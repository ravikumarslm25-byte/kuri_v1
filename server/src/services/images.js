import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 6 * 1024 * 1024;

/**
 * Save a base64 data URL under uploads/sessions/YYYY-MM/<sessionId>-<kind>.<ext>.
 * Returns the path relative to the upload dir ('' when no image was sent).
 */
export async function saveDataUrl(dataUrl, { sessionId, kind }) {
  if (!dataUrl) return '';
  const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(dataUrl);
  if (!m || !EXT[m[1].toLowerCase()]) throw Object.assign(new Error(`Invalid ${kind} image`), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_BYTES) throw Object.assign(new Error(`${kind} image too large`), { status: 413 });

  const month = new Date().toISOString().slice(0, 7);
  const safeId = String(sessionId).replace(/[^A-Za-z0-9-]/g, '');
  const rel = path.posix.join('sessions', month, `${safeId}-${kind}.${EXT[m[1].toLowerCase()]}`);
  const abs = path.join(config.uploadDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  return rel;
}
