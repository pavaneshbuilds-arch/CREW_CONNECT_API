import { prisma } from '../config/prisma.js';
import monthBucket from '../utils/monthBucket.js';
import logger from '../utils/logger.js';

function toOptionalInt(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

class ActivityLogService {
  /**
   * Central entry point for the "all system activity must be logged and
   * queryable month-wise" requirement. Fire-and-forget: logging failures must
   * never break the primary request, so errors are swallowed (and logged
   * locally).
   *
   * @param {Object} entry
   * @param {'login'|'admin_action'|'payment'|'crew_redemption'|'crew_earning'|'penalty'} entry.category
   * @param {'user'|'crew'|'admin'|'system'} entry.actorType
   * @param {string|number} [entry.actorId]
   * @param {string} entry.action
   * @param {string} [entry.referenceEntityType]
   * @param {string|number} [entry.referenceEntityId]
   * @param {Object} [entry.metadata]
   */
  async record(entry) {
    try {
      await prisma.activityLog.create({
        data: {
          category: entry.category,
          actorType: entry.actorType,
          actorId: toOptionalInt(entry.actorId),
          action: entry.action,
          referenceEntityType: entry.referenceEntityType ?? null,
          referenceEntityId: toOptionalInt(entry.referenceEntityId),
          metadata: entry.metadata ?? undefined,
          monthBucket: monthBucket(),
        },
      });
    } catch (err) {
      logger.error('Failed to write activity log', { message: err.message, action: entry.action });
    }
  }
}

export default new ActivityLogService();
