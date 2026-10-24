import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 5010),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/kuri',
  // Shared secret a kiosk must present the first time it registers.
  // Trimmed + unquoted so a stray space or "quotes" in .env can't cause "Invalid provision key".
  provisionKey: String(process.env.KIOSK_PROVISION_KEY || '').trim().replace(/^(['"])(.*)\1$/, '$2'),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  // Largest JSON body (base64 images). 4x6 photos at kiosk quality are ~1–2 MB each.
  bodyLimit: process.env.BODY_LIMIT || '25mb', // face + palm + enhanced palm + 4x6 card (300 dpi)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    timeoutMs: num(process.env.GEMINI_TIMEOUT_MS, 9000),
  },
  // A machine is shown "offline" when no heartbeat arrives within this window.
  heartbeatStaleMs: num(process.env.HEARTBEAT_STALE_MS, 90_000),
  admin: {
    jwtSecret: process.env.ADMIN_JWT_SECRET || '',
    jwtTtl: process.env.ADMIN_JWT_TTL || '12h',
  },
  // Guest photos are deleted after this many days (DPDP: keep personal data only as long as needed).
  // Readings stay for reports, without images or contact details. 0 = keep forever.
  retentionDays: num(process.env.DATA_RETENTION_DAYS, 90),
  timeZone: process.env.TIME_ZONE || 'Asia/Kolkata',
  // Built web apps served by this server (one app). Missing builds are simply not mounted.
  web: {
    adminDir: path.resolve(process.env.WEB_ADMIN_DIR || path.join(repoRoot, 'admin', 'dist')),
    kioskDir: path.resolve(process.env.WEB_KIOSK_DIR || path.join(repoRoot, 'kiosk', 'dist')),
    enabled: process.env.SERVE_WEB !== 'false',
  },
};

if (!config.admin.jwtSecret) {
  if (process.env.NODE_ENV === 'production') throw new Error('ADMIN_JWT_SECRET must be set in production');
  config.admin.jwtSecret = 'dev-only-insecure-secret';
}
