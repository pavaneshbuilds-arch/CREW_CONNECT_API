import { mongoose } from '../../../config/mongo.js';

/**
 * Push/in-app notifications for all three clients.
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient_type: { type: String, required: true, enum: ['user', 'crew', 'admin'] },
    recipient_id: { type: Number, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['booking_confirmed', 'crew_on_the_way', 'rate_experience', 'new_job_request', 'offer', 'reminder'],
    },
    reference_entity_type: { type: String },
    reference_entity_id: { type: Number },
    is_read: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
  },
  { collection: 'notifications', versionKey: false }
);

notificationSchema.index({ recipient_type: 1, recipient_id: 1, created_at: -1 });
notificationSchema.index({ recipient_id: 1, is_read: 1 });

export default mongoose.model('Notification', notificationSchema);
