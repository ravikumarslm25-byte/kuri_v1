import mongoose from 'mongoose';

/**
 * A Booking puts one Machine at one Event for a date range. Confirmed bookings are what a
 * kiosk reads to know which event / template it is serving right now.
 */
const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, unique: true }, // BKG-0001
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    machine: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    shift: { type: String, enum: ['full', 'morning', 'evening'], default: 'full' },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' }, // overrides the event's template
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    amount: { type: Number, default: 0, min: 0 }, // INR, for revenue reports
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

bookingSchema.index({ machine: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ event: 1 });

export const Booking = mongoose.model('Booking', bookingSchema);
