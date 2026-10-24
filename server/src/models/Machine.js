import mongoose from 'mongoose';

const machineSchema = new mongoose.Schema(
  {
    machineId: { type: String, required: true, unique: true, trim: true, uppercase: true }, // e.g. KURI-001
    name: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    // Admin-controlled lifecycle state. "online/offline" is derived from lastHeartbeatAt.
    status: {
      type: String,
      enum: ['available', 'active', 'maintenance', 'retired'],
      default: 'available',
    },
    tokenHash: { type: String, select: false }, // sha256 of the kiosk bearer token
    appVersion: { type: String, default: '' },
    lastHeartbeatAt: { type: Date },
    lastState: { type: String, default: '' }, // kiosk screen at last heartbeat
    // Card template used when no event/booking gives this kiosk one (e.g. a showroom kiosk, testing).
    defaultTemplate: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', default: null },
    pendingUploads: { type: Number, default: 0 }, // readings saved on the kiosk, not yet uploaded
    lastIp: { type: String, default: '' },
    hardware: {
      faceCamera: { type: String, default: '' },
      palmCamera: { type: String, default: '' },
      printer: { type: String, default: '' },
    },
    counters: {
      readingsToday: { type: Number, default: 0 },
      readingsDate: { type: String, default: '' }, // YYYY-MM-DD the counter belongs to
      readingsTotal: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export const Machine = mongoose.model('Machine', machineSchema);
