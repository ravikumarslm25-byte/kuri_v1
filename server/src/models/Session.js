import mongoose from 'mongoose';

// One guest reading at a kiosk. sessionId is generated on the kiosk so an upload
// retried after a network drop never creates a duplicate.
const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true }, // e.g. K7M2-QX9P
    machine: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    startedAt: { type: Date },
    completedAt: { type: Date },
    consent: { type: Boolean, required: true },
    language: { type: String, default: 'en' },
    facePhotoPath: { type: String, default: '' },
    palmPhotoPath: { type: String, default: '' },
    palmEnhancedPath: { type: String, default: '' },
    cardImagePath: { type: String, default: '' }, // the printed 4x6 card
    fortune: { type: String, default: '' },
    fortuneSource: { type: String, enum: ['ai', 'fallback'], default: 'fallback' },
    delivery: {
      printed: { type: Boolean, default: false },
      whatsapp: { type: String, default: '' }, // phone number, only if guest asked
      email: { type: String, default: '' },
    },
    outcome: { type: String, enum: ['completed', 'abandoned'], default: 'completed' },
    abandonedAt: { type: String, default: '' }, // screen where the guest walked away
  },
  { timestamps: true },
);

sessionSchema.index({ machine: 1, createdAt: -1 });
sessionSchema.index({ event: 1, createdAt: -1 });

export const Session = mongoose.model('Session', sessionSchema);
