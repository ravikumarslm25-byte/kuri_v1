import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AdminUser } from '../models/index.js';

export function issueAdminToken(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.admin.jwtSecret, { expiresIn: config.admin.jwtTtl });
}

/** Requires `Authorization: Bearer <admin JWT>`; sets req.admin (AdminUser doc). */
export async function requireAdmin(req, res, next) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Not signed in' });
    let payload;
    try {
      payload = jwt.verify(m[1], config.admin.jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Session expired, please sign in again' });
    }
    const user = await AdminUser.findById(payload.sub);
    if (!user || user.status !== 'active' || (user.tokenVersion || 0) !== payload.v) return res.status(401).json({ error: 'Not signed in' });
    req.admin = user;
    // Cheap "last active" tracking: at most one write per minute per user.
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 60_000) {
      AdminUser.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => undefined);
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Module-level access check, e.g. requirePerm('machines'). */
export const requirePerm = (perm) => (req, res, next) => {
  if (!req.admin?.effectivePermissions().includes(perm)) return res.status(403).json({ error: `No access to ${perm}` });
  next();
};

/** Tiny in-memory login limiter: 8 failures per 15 min per IP+email. */
const attempts = new Map();
export function loginLimiter(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
  const now = Date.now();
  const rec = attempts.get(key) || { n: 0, t: now };
  if (now - rec.t > 15 * 60_000) {
    rec.n = 0;
    rec.t = now;
  }
  if (rec.n >= 8) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  req.loginFailed = () => {
    rec.n += 1;
    attempts.set(key, rec);
  };
  req.loginOk = () => attempts.delete(key);
  next();
}
