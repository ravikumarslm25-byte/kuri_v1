// Create (or reset) a super admin.
//   ADMIN_EMAIL=ravi@hackgenix.com ADMIN_PASSWORD='...' npm run create-admin
//   npm run create-admin -- ravi@hackgenix.com 'Password123' "Ravi"
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { AdminUser } from '../models/index.js';
import { hashPassword, validatePassword } from '../services/passwords.js';

const [, , argEmail, argPw, argName] = process.argv;
const email = String(argEmail || process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const password = argPw || process.env.ADMIN_PASSWORD || '';
if (!email || !password) {
  console.error('Usage: npm run create-admin -- <email> <password> [name]   (or set ADMIN_EMAIL / ADMIN_PASSWORD)');
  process.exit(1);
}
const bad = validatePassword(password);
if (bad) {
  console.error(bad);
  process.exit(1);
}
await connectDb(config.mongoUri);
const passwordHash = await hashPassword(password);
const existing = await AdminUser.findOne({ email });
if (existing) {
  existing.passwordHash = passwordHash;
  existing.role = 'super_admin';
  existing.status = 'active';
  existing.tokenVersion = (existing.tokenVersion || 0) + 1;
  await existing.save();
  console.log(`Updated ${email}: super admin, password reset.`);
} else {
  await AdminUser.create({ email, name: argName || email.split('@')[0], role: 'super_admin', passwordHash });
  console.log(`Created super admin ${email}.`);
}
await disconnectDb();
