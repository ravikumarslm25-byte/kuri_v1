import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Guest photos are never public. The admin API hands out short-lived signed URLs
 * (/api/files/<path>?exp=..&sig=..) so <img> tags work without an auth header.
 */
const sign = (rel, exp) => crypto.createHmac('sha256', config.admin.jwtSecret).update(`${rel}|${exp}`).digest('base64url');

export function signedFileUrl(rel, ttlSec = 15 * 60) {
  if (!rel) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `/api/files/${rel.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sign(rel, exp)}`;
}

export function verifyFileSig(rel, exp, sig) {
  if (!rel || !exp || !sig) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(sign(rel, exp));
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
