import { prisma } from '../config/prisma.js';
import ApiError from '../utils/apiError.js';
import { activityLogService } from './index.js';

function serializeRange(row) {
  return {
    id: row.id,
    minWaiters: row.minWaiters,
    maxWaiters: row.maxWaiters,
    supervisorCount: row.supervisorCount,
  };
}

function assertRangesValid(ranges) {
  const sorted = [...ranges].sort((a, b) => a.minWaiters - b.minWaiters);
  for (let i = 0; i < sorted.length; i += 1) {
    const row = sorted[i];
    if (row.maxWaiters != null && row.maxWaiters < row.minWaiters) {
      throw ApiError.badRequest('Each range maxWaiters must be greater than or equal to minWaiters', {
        code: 'RANGE_INVALID',
        details: [{ path: 'maxWaiters', message: `Range ${row.minWaiters}–${row.maxWaiters} is inverted` }],
      });
    }
    if (row.maxWaiters == null && i !== sorted.length - 1) {
      throw ApiError.badRequest('Only the last range may have an open upper bound (maxWaiters null)', {
        code: 'RANGE_INVALID',
      });
    }
    const prev = sorted[i - 1];
    if (!prev) continue;
    if (prev.maxWaiters == null) {
      throw ApiError.badRequest('Open-ended ranges cannot overlap later ranges', {
        code: 'RANGE_OVERLAP',
      });
    }
    if (row.minWaiters <= prev.maxWaiters) {
      throw ApiError.badRequest('Waiter ranges must not overlap', {
        code: 'RANGE_OVERLAP',
        details: [
          {
            path: 'ranges',
            message: `${prev.minWaiters}–${prev.maxWaiters} overlaps ${row.minWaiters}–${row.maxWaiters ?? '∞'}`,
          },
        ],
      });
    }
  }
  return sorted;
}

class SupervisorRangeService {
  async list() {
    const rows = await prisma.supervisorStaffingRange.findMany({
      orderBy: { minWaiters: 'asc' },
    });
    return rows.map(serializeRange);
  }

  async replace(adminId, ranges) {
    const sorted = assertRangesValid(ranges);

    await prisma.$transaction(async (tx) => {
      await tx.supervisorStaffingRange.deleteMany();
      if (sorted.length) {
        await tx.supervisorStaffingRange.createMany({
          data: sorted.map((row) => ({
            minWaiters: row.minWaiters,
            maxWaiters: row.maxWaiters ?? null,
            supervisorCount: row.supervisorCount,
          })),
        });
      }
      await tx.adminAuditLog.create({
        data: {
          adminId,
          actionType: 'supervisor_ranges_updated',
          targetEntityType: 'supervisor_staffing_range',
          details: { ranges: sorted },
        },
      });
    });

    await activityLogService.record({
      category: 'admin_action',
      actorType: 'admin',
      actorId: adminId,
      action: 'supervisor_ranges_updated',
      referenceEntityType: 'supervisor_staffing_range',
      metadata: { ranges: sorted },
    });

    return this.list();
  }
}

export default new SupervisorRangeService();
