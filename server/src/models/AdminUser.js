import mongoose from 'mongoose';

/** Modules an admin can be given access to (matches the admin panel's sidebar). */
export const PERMISSIONS = ['dashboard', 'events', 'bookings', 'machines', 'templates', 'sessions', 'team', 'reports'];

export const ROLES = {
  super_admin: PERMISSIONS,
  event_manager: ['dashboard', 'events', 'bookings', 'reports', 'sessions'],
  operations_manager: ['dashboard', 'machines', 'events', 'bookings', 'templates'],
  support: ['dashboard', 'machines', 'sessions'],
};

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.keys(ROLES), default: 'support' },
    // Per-user module access; defaults to the role's list. super_admin always has everything.
    permissions: { type: [String], default: undefined },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    lastActiveAt: { type: Date },
    tokenVersion: { type: Number, default: 0 }, // bump to sign the user out everywhere
  },
  { timestamps: true },
);

adminUserSchema.methods.effectivePermissions = function effectivePermissions() {
  if (this.role === 'super_admin') return PERMISSIONS;
  return (this.permissions?.length ? this.permissions : ROLES[this.role] || []).filter((p) => PERMISSIONS.includes(p));
};

adminUserSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    permissions: this.effectivePermissions(),
    status: this.status,
    lastActiveAt: this.lastActiveAt,
    createdAt: this.createdAt,
  };
};

export const AdminUser = mongoose.model('AdminUser', adminUserSchema);
