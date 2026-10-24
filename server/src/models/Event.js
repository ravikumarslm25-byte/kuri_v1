import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    client: { type: String, trim: true, default: '' },
    venue: { type: String, trim: true, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    machines: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Machine' }],
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    language: { type: String, enum: ['en', 'ta', 'en+ta'], default: 'en' },
    deliveryOptions: {
      print: { type: Boolean, default: true },
      whatsapp: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
    },
    branding: {
      cardFooter: { type: String, default: '' }, // e.g. "Tech Summit 2026 · Mumbai"
      logoUrl: { type: String, default: '' },
    },
    expectedAttendees: { type: Number, default: 0 },
    contact: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    status: { type: String, enum: ['upcoming', 'live', 'completed', 'cancelled'], default: 'upcoming' },
  },
  { timestamps: true },
);

eventSchema.index({ machines: 1, startDate: 1, endDate: 1 });

export const Event = mongoose.model('Event', eventSchema);
