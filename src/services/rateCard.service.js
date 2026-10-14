import { prisma } from '../config/prisma.js';
import { CREW_ROLES, DEFAULT_CREW_SHARE_PERCENT, DEFAULT_RATES, getGstPercent } from '../config/pricing.js';
import ApiError from '../utils/apiError.js';
import { activityLogService } from './index.js';

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function serializeAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    fullName: admin.fullName,
    email: admin.email,
  };
}

class RateCardService {
  /**
   * Current fixed event rates and crew share percents. Missing roles fall back
   * to defaults so bookings still work before seed/migration has run.
   */
  async getCards() {
    const rows = await prisma.crewRateCard.findMany();
    const cards = Object.fromEntries(
      CREW_ROLES.map((role) => [
        role,
        { rate: DEFAULT_RATES[role], crewSharePercent: DEFAULT_CREW_SHARE_PERCENT },
      ])
    );
    for (const row of rows) {
      cards[row.role] = {
        rate: Number(row.rate),
        crewSharePercent: Number(row.crewSharePercent),
      };
    }
    return cards;
  }

  async getRates() {
    const cards = await this.getCards();
    return Object.fromEntries(CREW_ROLES.map((role) => [role, cards[role].rate]));
  }

  async listCurrent() {
    const rows = await prisma.crewRateCard.findMany({
      include: { updatedBy: { select: { id: true, fullName: true, email: true } } },
    });
    const byRole = Object.fromEntries(rows.map((row) => [row.role, row]));
    const items = CREW_ROLES.map((role) => {
      const row = byRole[role];
      if (!row) {
        return {
          role,
          rate: DEFAULT_RATES[role],
          crewSharePercent: DEFAULT_CREW_SHARE_PERCENT,
          updatedAt: null,
          updatedBy: null,
        };
      }
      return {
        id: row.id,
        role: row.role,
        rate: decimal(row.rate),
        crewSharePercent: decimal(row.crewSharePercent),
        updatedAt: row.updatedAt,
        updatedBy: serializeAdmin(row.updatedBy),
      };
    });

    return {
      rates: Object.fromEntries(items.map((item) => [item.role, item.rate])),
      crewSharePercents: Object.fromEntries(items.map((item) => [item.role, item.crewSharePercent])),
      gstPercent: getGstPercent(),
      items,
    };
  }

  async updateRates(adminId, body) {
    const percents = body.crewSharePercent || {};
    const updates = CREW_ROLES.filter((role) => body[role] != null || percents[role] != null).map((role) => ({
      role,
      rate: body[role] != null ? Number(body[role]) : null,
      crewSharePercent: percents[role] != null ? Number(percents[role]) : null,
    }));
    if (!updates.length) {
      throw ApiError.badRequest('Provide at least one rate or crew share percent to update', {
        code: 'RATE_REQUIRED',
      });
    }

    const note = body.note ? String(body.note).trim() || null : null;
    const changes = [];

    await prisma.$transaction(async (tx) => {
      for (const { role, rate, crewSharePercent } of updates) {
        const existing = await tx.crewRateCard.findUnique({ where: { role } });
        const previousRate = existing ? Number(existing.rate) : DEFAULT_RATES[role];
        const previousPercent = existing
          ? Number(existing.crewSharePercent)
          : DEFAULT_CREW_SHARE_PERCENT;
        const nextRate = rate != null ? rate : previousRate;
        const nextPercent = crewSharePercent != null ? crewSharePercent : previousPercent;
        if (existing && previousRate === nextRate && previousPercent === nextPercent) continue;

        const card = existing
          ? await tx.crewRateCard.update({
              where: { role },
              data: { rate: nextRate, crewSharePercent: nextPercent, updatedByAdminId: adminId },
            })
          : await tx.crewRateCard.create({
              data: {
                role,
                rate: nextRate,
                crewSharePercent: nextPercent,
                updatedByAdminId: adminId,
              },
            });

        await tx.crewRateLog.create({
          data: {
            rateCardId: card.id,
            role,
            previousRate,
            newRate: nextRate,
            previousCrewSharePercent: previousPercent,
            newCrewSharePercent: nextPercent,
            changedByAdminId: adminId,
            note,
          },
        });

        changes.push({
          role,
          previousRate,
          newRate: nextRate,
          previousCrewSharePercent: previousPercent,
          newCrewSharePercent: nextPercent,
        });
      }

      if (changes.length) {
        await tx.adminAuditLog.create({
          data: {
            adminId,
            actionType: 'rate_updated',
            targetEntityType: 'crew_rate_card',
            details: { changes, note },
          },
        });
      }
    });

    if (changes.length) {
      await activityLogService.record({
        category: 'admin_action',
        actorType: 'admin',
        actorId: adminId,
        action: 'rate_updated',
        referenceEntityType: 'crew_rate_card',
        metadata: { changes, note },
      });
    }

    return this.listCurrent();
  }

  async listLogs(query) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where = {};
    if (query.role) where.role = query.role;

    const [total, rows] = await prisma.$transaction([
      prisma.crewRateLog.count({ where }),
      prisma.crewRateLog.findMany({
        where,
        include: { changedBy: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        role: row.role,
        previousRate: decimal(row.previousRate),
        newRate: decimal(row.newRate),
        previousCrewSharePercent: decimal(row.previousCrewSharePercent),
        newCrewSharePercent: decimal(row.newCrewSharePercent),
        note: row.note,
        createdAt: row.createdAt,
        changedBy: serializeAdmin(row.changedBy),
      })),
      meta: paginationMeta({ page, limit, total }),
    };
  }
}

export default new RateCardService();
