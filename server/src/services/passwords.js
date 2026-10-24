import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384;

/** "scrypt$N$salt$hash" (base64). No native deps, OWASP-acceptable parameters. */
export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N, r: 8, p: 1 });
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw, stored) {
  const [alg, n, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), 64, { N: Number(n), r: 8, p: 1 });
  const expected = Buffer.from(hash, 'base64');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers';
  return null;
}

export function randomPassword() {
  return crypto.randomBytes(9).toString('base64url') + '7a';
}
