import { mongoose } from '../../../config/mongo.js';

/**
 * Unified, append-heavy activity log. Mirrors admin audit events and captures
 * logins, payments, earnings/redemptions, and penalties in one collection,
 * filtered by `category`. `month_bucket` (YYYY-MM) supports efficient
 * month-wise querying and archival as required by the design.
 */
const activityLogSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ['login', 'admin_action', 'payment', 'crew_redemption', 'crew_earning', 'penalty'],
    },
    actor_type: { type: String, required: true, enum: ['user', 'crew', 'admin', 'system'] },
    actor_id: { type: Number },
    action: { type: String, required: true },
    reference_entity_type: { type: String },
    reference_entity_id: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed },
    month_bucket: { type: String, required: true }, // "2026-07"
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'activity_logs', versionKey: false }
);

activityLogSchema.index({ month_bucket: 1, category: 1 });
activityLogSchema.index({ actor_id: 1, created_at: -1 });

export default mongoose.model('ActivityLog', activityLogSchema);
