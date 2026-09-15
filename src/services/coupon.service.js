import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { activityLogService } from './index.js';

const REDEEMED_STATUS = { not: 'pending_payment' };

function decimal(value) {
  if (value == null) return null;
  return Number(value);
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function paginationMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

function blankToNull(value) {
  if (value === undefined) return undefined;
  if (value === '') return null;
  return value;
}

function normalizeCode(code) {
  return String(code).trim().toUpperCase();
}

function isCurrentlyValid(coupon, now = new Date()) {
  if (!coupon || !coupon.isActive) return false;
  if (coupon.validFrom && coupon.validFrom > now) return false;
  if (coupon.validUntil && coupon.validUntil < now) return false;
  return true;
}

function publicFields(coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: decimal(coupon.discountValue),
    minSpend: decimal(coupon.minSpend),
    maxDiscountAmount: decimal(coupon.maxDiscountAmount),
    maxUses: coupon.maxUses,
    maxUsesPerUser: coupon.maxUsesPerUser,
    validFrom: coupon.validFrom,
    validUntil: coupon.validUntil,
  };
}

class CouponService {
  serializePublic(coupon) {
    if (!coupon) return null;
    return publicFields(coupon);
  }

  serializeForBooking(coupon) {
    if (!coupon) return null;
    return {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: decimal(coupon.discountValue),
      minSpend: decimal(coupon.minSpend),
      maxDiscountAmount: decimal(coupon.maxDiscountAmount),
    };
  }

  serializeAdmin(coupon, { usedCount = 0 } = {}) {
    return {
      ...publicFields(coupon),
      isActive: coupon.isActive,
      usedCount,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    };
  }

  computeDiscountAmount(subtotal, coupon) {
    if (!coupon) return 0;
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = roundMoney(subtotal * (Number(coupon.discountValue) / 100));
    } else {
      discountAmount = roundMoney(Number(coupon.discountValue));
    }
    if (coupon.maxDiscountAmount != null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
    }
    return roundMoney(Math.max(0, Math.min(discountAmount, subtotal)));
  }

  meetsMinSpend(coupon, subtotal) {
    if (!coupon || coupon.minSpend == null) return true;
    return subtotal >= Number(coupon.minSpend);
  }

  async countRedemptions(couponId, { userId, excludeBookingId, client = prisma } = {}) {
    const where = {
      couponId,
      status: REDEEMED_STATUS,
    };
    if (userId) where.userId = userId;
    if (excludeBookingId) where.id = { not: excludeBookingId };
    return client.booking.count({ where });
  }

  async redemptionCounts(couponIds, { userId } = {}) {
    if (!couponIds.length) return { global: new Map(), byUser: new Map() };
    const globalRows = await prisma.booking.groupBy({
      by: ['couponId'],
      where: { couponId: { in: couponIds }, status: REDEEMED_STATUS },
      _count: { _all: true },
    });
    const global = new Map(globalRows.map((row) => [row.couponId, row._count._all]));

    let byUser = new Map();
    if (userId) {
      const userRows = await prisma.booking.groupBy({
        by: ['couponId'],
        where: { couponId: { in: couponIds }, userId, status: REDEEMED_STATUS },
        _count: { _all: true },
      });
      byUser = new Map(userRows.map((row) => [row.couponId, row._count._all]));
    }
    return { global, byUser };
  }

  hasRemainingUses(coupon, usedCount, usedByUser) {
    if (coupon.maxUses != null && usedCount >= coupon.maxUses) return false;
    if (coupon.maxUsesPerUser != null && usedByUser >= coupon.maxUsesPerUser) return false;
    return true;
  }

  async assertRedeemable(coupon, { userId, bookingId, client = prisma } = {}) {
    if (!isCurrentlyValid(coupon)) {
      throw ApiError.badRequest('Coupon is invalid or expired', { code: 'COUPON_INVALID' });
    }
    if (coupon.maxUses != null) {
      const used = await this.countRedemptions(coupon.id, { excludeBookingId: bookingId, client });
      if (used >= coupon.maxUses) {
        throw ApiError.badRequest('This coupon has reached its usage limit', { code: 'COUPON_LIMIT_REACHED' });
      }
    }
    if (coupon.maxUsesPerUser != null && userId) {
      const usedByUser = await this.countRedemptions(coupon.id, {
        userId,
        excludeBookingId: bookingId,
        client,
      });
      if (usedByUser >= coupon.maxUsesPerUser) {
        throw ApiError.badRequest('You have already used this coupon', { code: 'COUPON_USER_LIMIT' });
      }
    }
  }

  async isRedeemable(coupon, opts = {}) {
    try {
      await this.assertRedeemable(coupon, opts);
      return true;
    } catch (err) {
      if (err instanceof ApiError && ['COUPON_INVALID', 'COUPON_LIMIT_REACHED', 'COUPON_USER_LIMIT'].includes(err.code)) {
        return false;
      }
      throw err;
    }
  }

  async findUsableByCode(code, { userId, bookingId } = {}) {
    const now = new Date();
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: { equals: String(code).trim(), mode: 'insensitive' },
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
    });
    if (!coupon) throw ApiError.badRequest('Coupon is invalid or expired', { code: 'COUPON_INVALID' });
    await this.assertRedeemable(coupon, { userId, bookingId });
    return coupon;
  }

  async listPublic(userId) {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    const { global, byUser } = await this.redemptionCounts(
      coupons.map((c) => c.id),
      { userId }
    );

    return coupons
      .filter((c) => this.hasRemainingUses(c, global.get(c.id) || 0, byUser.get(c.id) || 0))
      .map((c) => this.serializePublic(c));
  }

  async listAdmin(query) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where = {};
    if (typeof query.isActive === 'boolean') where.isActive = query.isActive;
    if (query.discountType) where.discountType = query.discountType;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.coupon.count({ where }),
      prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const { global } = await this.redemptionCounts(rows.map((c) => c.id));
    return {
      items: rows.map((c) => this.serializeAdmin(c, { usedCount: global.get(c.id) || 0 })),
      meta: paginationMeta({ page, limit, total }),
    };
  }

  async getAdmin(id) {
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw ApiError.notFound('Coupon not found', { code: 'COUPON_NOT_FOUND' });
    const usedCount = await this.countRedemptions(coupon.id);
    return this.serializeAdmin(coupon, { usedCount });
  }

  assertFieldRules(data, existing = null) {
    const discountType = data.discountType ?? existing?.discountType;
    const discountValue = data.discountValue ?? (existing ? Number(existing.discountValue) : undefined);
    if (discountType === 'percentage' && discountValue != null && discountValue > 100) {
      throw ApiError.badRequest('Percentage discount cannot exceed 100', { code: 'COUPON_VALUE_INVALID' });
    }

    const validFrom = data.validFrom !== undefined ? data.validFrom : existing?.validFrom;
    const validUntil = data.validUntil !== undefined ? data.validUntil : existing?.validUntil;
    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
      throw ApiError.badRequest('validUntil must be on or after validFrom', { code: 'COUPON_DATES_INVALID' });
    }
  }

  toWriteData(body, { partial = false } = {}) {
    const data = {};
    const assign = (key, value) => {
      if (value !== undefined) data[key] = value;
    };

    if (body.code !== undefined) assign('code', normalizeCode(body.code));
    if (body.description !== undefined) assign('description', blankToNull(body.description));
    if (body.discountType !== undefined) assign('discountType', body.discountType);
    if (body.discountValue !== undefined) assign('discountValue', body.discountValue);
    if (body.minSpend !== undefined) assign('minSpend', body.minSpend);
    if (body.maxDiscountAmount !== undefined) assign('maxDiscountAmount', body.maxDiscountAmount);
    if (body.maxUses !== undefined) assign('maxUses', body.maxUses);
    if (body.maxUsesPerUser !== undefined) assign('maxUsesPerUser', body.maxUsesPerUser);
    if (body.validFrom !== undefined) assign('validFrom', body.validFrom);
    if (body.validUntil !== undefined) assign('validUntil', body.validUntil);
    if (body.isActive !== undefined) assign('isActive', body.isActive);

    if (!partial && !data.code) {
      throw ApiError.badRequest('Coupon code is required', { code: 'VALIDATION_ERROR' });
    }
    return data;
  }

  async create(adminId, body) {
    this.assertFieldRules(body);
    const data = this.toWriteData(body);
    let coupon;
    try {
      coupon = await prisma.coupon.create({ data });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw ApiError.conflict('A coupon with this code already exists', { code: 'COUPON_CODE_IN_USE' });
      }
      throw err;
    }

    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'coupon_created',
        targetEntityType: 'coupon',
        targetEntityId: coupon.id,
        details: { code: coupon.code },
      },
    });
    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'coupon_created',
      referenceEntityType: 'coupon',
      referenceEntityId: coupon.id,
      metadata: { code: coupon.code },
    });

    return this.serializeAdmin(coupon, { usedCount: 0 });
  }

  async update(id, adminId, body) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Coupon not found', { code: 'COUPON_NOT_FOUND' });
    this.assertFieldRules(body, existing);
    const data = this.toWriteData(body, { partial: true });
    if (!Object.keys(data).length) {
      throw ApiError.badRequest('No fields to update', { code: 'VALIDATION_ERROR' });
    }

    let coupon;
    try {
      coupon = await prisma.coupon.update({ where: { id }, data });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw ApiError.conflict('A coupon with this code already exists', { code: 'COUPON_CODE_IN_USE' });
      }
      throw err;
    }

    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'coupon_updated',
        targetEntityType: 'coupon',
        targetEntityId: coupon.id,
        details: { code: coupon.code, changes: data },
      },
    });
    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'coupon_updated',
      referenceEntityType: 'coupon',
      referenceEntityId: coupon.id,
      metadata: { code: coupon.code },
    });

    const usedCount = await this.countRedemptions(coupon.id);
    return this.serializeAdmin(coupon, { usedCount });
  }

  async remove(id, adminId) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Coupon not found', { code: 'COUPON_NOT_FOUND' });

    const bookingCount = await prisma.booking.count({ where: { couponId: id } });
    if (bookingCount > 0) {
      throw ApiError.conflict('Coupon is used on bookings; deactivate it instead', {
        code: 'COUPON_IN_USE',
      });
    }

    await prisma.coupon.delete({ where: { id } });
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        actionType: 'coupon_deleted',
        targetEntityType: 'coupon',
        targetEntityId: id,
        details: { code: existing.code },
      },
    });
    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'coupon_deleted',
      referenceEntityType: 'coupon',
      referenceEntityId: id,
      metadata: { code: existing.code },
    });

    return { id, deleted: true };
  }
}

export default new CouponService();
