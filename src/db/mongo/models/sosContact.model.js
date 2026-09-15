import { mongoose } from '../../../config/mongo.js';

/**
 * Crew SOS emergency contacts — low relational value, fits Mongo well.
 * One document per crew member holding a list of contacts.
 */
const sosContactSchema = new mongoose.Schema(
  {
    crew_id: { type: Number, required: true, unique: true },
    contacts: [
      {
        _id: false,
        name: { type: String, required: true },
        phone: { type: String, required: true },
        relation: { type: String },
      },
    ],
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'sos_emergency_contacts', versionKey: false }
);

export default mongoose.model('SosContact', sosContactSchema);
