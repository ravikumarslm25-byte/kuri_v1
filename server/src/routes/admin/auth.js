import express from 'express';
import { AdminUser } from '../../models/index.js';
import { issueAdminToken, loginLimiter, requireAdmin } from '../../middleware/adminAuth.js';
import { hashPassword, validatePassword, verifyPassword } from '../../services/passwords.js';
import { ah, httpError } from '../../services/http.js';

export const authRouter = express.Router();

/** POST /api/admin/auth/login  { email, password } -> { token, user } */
authRouter.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    const user = await AdminUser.findOne({ email: String(email || '').toLowerCase().trim() }).select('+passwordHash');
    const ok = user && user.status === 'active' && (await verifyPassword(String(password || ''), user.passwordHash));
    if (!ok) {
      req.loginFailed();
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    req.loginOk();
    user.lastActiveAt = new Date();
    await user.save();
    res.json({ token: issueAdminToken(user), user: user.toPublic() });
  }),
);

authRouter.get('/me', requireAdmin, (req, res) => res.json({ user: req.admin.toPublic() }));

/** POST /api/admin/auth/change-password { current, next } — signs out other devices. */
authRouter.post(
  '/change-password',
  requireAdmin,
  ah(async (req, res) => {
    const { current, next } = req.body || {};
    const user = await AdminUser.findById(req.admin._id).select('+passwordHash');
    if (!(await verifyPassword(String(current || ''), user.passwordHash))) throw httpError(400, 'Current password is wrong');
    const bad = validatePassword(next);
    if (bad) throw httpError(400, bad);
    user.passwordHash = await hashPassword(next);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ token: issueAdminToken(user) });
  }),
);

/** POST /api/admin/auth/logout-all — invalidates every token for this user. */
authRouter.post(
  '/logout-all',
  requireAdmin,
  ah(async (req, res) => {
    await AdminUser.updateOne({ _id: req.admin._id }, { $inc: { tokenVersion: 1 } });
    res.json({ ok: true });
  }),
);
