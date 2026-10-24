import express from 'express';
import { AdminUser, PERMISSIONS, ROLES } from '../../models/index.js';
import { ah, httpError, oid, requireFields } from '../../services/http.js';
import { hashPassword, randomPassword, validatePassword } from '../../services/passwords.js';

export const teamRouter = express.Router();

function cleanPerms(perms) {
  if (perms === undefined) return undefined;
  if (!Array.isArray(perms)) throw httpError(400, 'permissions must be a list');
  const bad = perms.filter((p) => !PERMISSIONS.includes(p));
  if (bad.length) throw httpError(400, `Unknown permission: ${bad.join(', ')}`);
  return [...new Set(perms)];
}

async function activeSuperAdmins(excludeId) {
  return AdminUser.countDocuments({ role: 'super_admin', status: 'active', _id: { $ne: excludeId } });
}

teamRouter.get(
  '/',
  ah(async (req, res) => {
    const users = await AdminUser.find().sort({ createdAt: 1 });
    const items = users.map((u) => u.toPublic());
    res.json({
      stats: {
        total: items.length,
        active: items.filter((u) => u.status === 'active').length,
        managers: items.filter((u) => ['event_manager', 'operations_manager'].includes(u.role)).length,
        support: items.filter((u) => u.role === 'support').length,
      },
      roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v])),
      permissions: PERMISSIONS,
      items,
    });
  }),
);

/** POST { name, email, phone?, role, permissions?, password? } -> user (+ tempPassword if generated) */
teamRouter.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['name', 'email']);
    const role = req.body.role || 'support';
    if (!ROLES[role]) throw httpError(400, 'Unknown role');
    if (role === 'super_admin' && req.admin.role !== 'super_admin') throw httpError(403, 'Only a super admin can add super admins');
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Invalid email');
    if (await AdminUser.exists({ email })) throw httpError(409, 'A team member with this email already exists');
    let tempPassword;
    let pw = req.body.password;
    if (pw) {
      const bad = validatePassword(pw);
      if (bad) throw httpError(400, bad);
    } else {
      pw = tempPassword = randomPassword();
    }
    const u = await AdminUser.create({
      name: String(req.body.name).trim(),
      email,
      phone: String(req.body.phone || '').trim(),
      role,
      permissions: cleanPerms(req.body.permissions),
      passwordHash: await hashPassword(pw),
    });
    res.status(201).json({ user: u.toPublic(), ...(tempPassword ? { tempPassword } : {}) });
  }),
);

teamRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const u = await AdminUser.findById(oid(req.params.id));
    if (!u) throw httpError(404, 'Team member not found');
    const self = String(u._id) === String(req.admin._id);
    const b = req.body || {};
    if (b.role !== undefined) {
      if (!ROLES[b.role]) throw httpError(400, 'Unknown role');
      if ((b.role === 'super_admin' || u.role === 'super_admin') && req.admin.role !== 'super_admin') throw httpError(403, 'Only a super admin can change super admins');
      if (self && b.role !== u.role) throw httpError(400, 'You cannot change your own role');
      if (u.role === 'super_admin' && b.role !== 'super_admin' && !(await activeSuperAdmins(u._id))) throw httpError(400, 'Keep at least one active super admin');
      u.role = b.role;
    }
    if (b.status !== undefined) {
      if (!['active', 'disabled'].includes(b.status)) throw httpError(400, 'status must be active or disabled');
      if (self && b.status === 'disabled') throw httpError(400, 'You cannot disable yourself');
      if (u.role === 'super_admin' && b.status === 'disabled' && !(await activeSuperAdmins(u._id))) throw httpError(400, 'Keep at least one active super admin');
      if (b.status === 'disabled') u.tokenVersion = (u.tokenVersion || 0) + 1; // sign out now
      u.status = b.status;
    }
    if (b.permissions !== undefined) u.permissions = cleanPerms(b.permissions);
    if (b.name !== undefined) u.name = String(b.name).trim();
    if (b.phone !== undefined) u.phone = String(b.phone).trim();
    await u.save();
    res.json({ user: u.toPublic() });
  }),
);

/** Generates a new temporary password and signs the user out everywhere. */
teamRouter.post(
  '/:id/reset-password',
  ah(async (req, res) => {
    const u = await AdminUser.findById(oid(req.params.id));
    if (!u) throw httpError(404, 'Team member not found');
    if (u.role === 'super_admin' && req.admin.role !== 'super_admin') throw httpError(403, 'Only a super admin can reset a super admin');
    const tempPassword = randomPassword();
    u.passwordHash = await hashPassword(tempPassword);
    u.tokenVersion = (u.tokenVersion || 0) + 1;
    await u.save();
    res.json({ tempPassword });
  }),
);

teamRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const u = await AdminUser.findById(oid(req.params.id));
    if (!u) throw httpError(404, 'Team member not found');
    if (String(u._id) === String(req.admin._id)) throw httpError(400, 'You cannot remove yourself');
    if (u.role === 'super_admin') {
      if (req.admin.role !== 'super_admin') throw httpError(403, 'Only a super admin can remove super admins');
      if (!(await activeSuperAdmins(u._id))) throw httpError(400, 'Keep at least one active super admin');
    }
    await AdminUser.deleteOne({ _id: u._id });
    res.json({ ok: true });
  }),
);
