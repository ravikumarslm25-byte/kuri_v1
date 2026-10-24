import crypto from 'node:crypto';
import { Machine } from '../models/index.js';

export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/** Requires `Authorization: Bearer <kiosk token>`; sets req.machine. */
export async function kioskAuth(req, res, next) {
  try {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return res.status(401).json({ error: 'Missing kiosk token' });
    const machine = await Machine.findOne({ tokenHash: hashToken(m[1]) });
    if (!machine) return res.status(401).json({ error: 'Invalid kiosk token' });
    if (machine.status === 'retired') return res.status(403).json({ error: 'Machine retired' });
    req.machine = machine;
    next();
  } catch (err) {
    next(err);
  }
}
