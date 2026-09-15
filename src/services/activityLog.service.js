import ActivityLog from '../db/mongo/models/activityLog.model.js';
import monthBucket from '../utils/monthBucket.js';
import logger from '../utils/logger.js';

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
   * @param {string} [entry.actorId]
   * @param {string} entry.action
   * @param {string} [entry.referenceEntityType]
   * @param {string} [entry.referenceEntityId]
   * @param {Object} [entry.metadata]
   */
  async record(entry) {
    try {
      await ActivityLog.create({
        category: entry.category,
        actor_type: entry.actorType,
        actor_id: entry.actorId,
        action: entry.action,
        reference_entity_type: entry.referenceEntityType,
        reference_entity_id: entry.referenceEntityId,
        metadata: entry.metadata,
        month_bucket: monthBucket(),
        created_at: new Date(),
      });
    } catch (err) {
      logger.error('Failed to write activity log', { message: err.message, action: entry.action });
    }
  }
}

export default new ActivityLogService();
