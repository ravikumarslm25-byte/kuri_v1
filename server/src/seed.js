// Dev seed: templates, machines, events, bookings, a dev super admin and ~30 days of sample
// readings (no images) so the admin panel has realistic data to build against.
// Usage: npm run seed            (refuses to run when NODE_ENV=production)
//        npm run seed -- --fresh (wipe the dev database first)
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import mongoose from 'mongoose';
import { AdminUser, Booking, Event, Machine, Session, Template, nextId } from './models/index.js';
import { hashPassword } from './services/passwords.js';
import { fallbackFortunes } from './data/fallbackFortunes.js';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production');
  process.exit(1);
}

await connectDb(config.mongoUri);
if (process.argv.includes('--fresh')) await mongoose.connection.db.dropDatabase();

const DAY = 86_400_000;
const at = (offsetDays, h = 0) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(h, 0, 0, 0);
  return d;
};

// Templates
const tplDefs = [
  { code: 'TMPL-001', name: 'Cosmic Fortune', status: 'active', theme: 'general' },
  { code: 'TMPL-002', name: 'Love & Destiny', status: 'active', theme: 'love' },
  { code: 'TMPL-003', name: 'Career Oracle', status: 'active', theme: 'career' },
  { code: 'TMPL-004', name: 'Festival of Lights', status: 'draft', theme: 'wealth' },
];
for (const t of tplDefs) await Template.updateOne({ code: t.code }, { $setOnInsert: t }, { upsert: true });
await mongoose.connection.db.collection('counters').updateOne({ _id: 'TMPL' }, { $max: { seq: 4 } }, { upsert: true });
const T = Object.fromEntries((await Template.find().lean()).map((t) => [t.code, t]));

// Machines
const machineDefs = [
  { machineId: 'KURI-001', name: 'Kiosk 001', location: 'HackGeniX Lab - Salem', status: 'active' },
  { machineId: 'KURI-002', name: 'Kiosk 002', location: 'HackGeniX Lab - Salem', status: 'active' },
  { machineId: 'KURI-003', name: 'Kiosk 003', location: 'Warehouse - Chennai', status: 'available' },
  { machineId: 'KURI-004', name: 'Kiosk 004', location: 'Warehouse - Chennai', status: 'maintenance' },
];
for (const m of machineDefs) await Machine.updateOne({ machineId: m.machineId }, { $setOnInsert: m }, { upsert: true });
const K = Object.fromEntries((await Machine.find().lean()).map((m) => [m.machineId, m]));

// Events (+ bookings)
async function upsertEvent(e) {
  await Event.updateOne({ name: e.name }, { $set: e }, { upsert: true });
  return Event.findOne({ name: e.name }).lean();
}
const demo = await upsertEvent({ name: 'Demo Day', client: 'HackGeniX', venue: 'Salem', startDate: at(0), endDate: new Date(at(3).getTime() - 1), template: T['TMPL-001']._id, branding: { cardFooter: 'Demo Day · HackGeniX' }, machines: [] });
const summit = await upsertEvent({ name: 'Tech Summit 2026', client: 'TechCorp India', venue: 'Chennai Trade Centre', startDate: at(-20), endDate: new Date(at(-17).getTime() - 1), template: T['TMPL-003']._id, expectedAttendees: 5000, contact: { name: 'Event desk', phone: '' } });
const expo = await upsertEvent({ name: 'Wedding Expo', client: 'EventPro Solutions', venue: 'Codissia, Coimbatore', startDate: at(-9), endDate: new Date(at(-6).getTime() - 1), template: T['TMPL-002']._id, expectedAttendees: 3000, language: 'en+ta' });
const meet = await upsertEvent({ name: 'Corporate Annual Meet', client: 'GlobalTech Corp', venue: 'ITC Grand Chola, Chennai', startDate: at(12), endDate: new Date(at(13).getTime() - 1), template: T['TMPL-003']._id, expectedAttendees: 800 });

async function book(event, machineId, status, amount) {
  if (await Booking.exists({ event: event._id, machine: K[machineId]._id })) return;
  await Booking.create({ bookingId: await nextId('BKG'), event: event._id, machine: K[machineId]._id, startDate: event.startDate, endDate: event.endDate, status, amount });
}
await book(demo, 'KURI-001', 'confirmed', 0);
await book(summit, 'KURI-001', 'confirmed', 45000);
await book(summit, 'KURI-002', 'confirmed', 45000);
await book(expo, 'KURI-002', 'confirmed', 38000);
await book(meet, 'KURI-003', 'pending', 30000);

// Dev super admin
if (!(await AdminUser.exists({ email: 'admin@kuri.dev' }))) {
  await AdminUser.create({ name: 'Dev Admin', email: 'admin@kuri.dev', role: 'super_admin', passwordHash: await hashPassword('KuriDev2026') });
}

// Sample readings (no images) for past events
if (!(await Session.exists({ sessionId: /^SEED-/ }))) {
  const pool = fallbackFortunes.general;
  const docs = [];
  let n = 0;
  for (const [ev, machines, perDay] of [
    [summit, ['KURI-001', 'KURI-002'], 70],
    [expo, ['KURI-002'], 90],
  ]) {
    for (let d = new Date(ev.startDate); d < ev.endDate; d = new Date(d.getTime() + DAY)) {
      for (let i = 0; i < perDay; i++) {
        const created = new Date(d.getTime() + (10 + Math.random() * 10) * 3600_000);
        const abandoned = Math.random() < 0.07;
        const lang = ev.language === 'en+ta' && Math.random() < 0.3 ? 'ta' : 'en';
        n++;
        docs.push({
          sessionId: `SEED-${String(n).padStart(4, '0')}`,
          machine: K[machines[i % machines.length]]._id,
          event: ev._id,
          template: ev.template,
          startedAt: new Date(created.getTime() - 75_000 - Math.random() * 40_000),
          completedAt: abandoned ? undefined : created,
          createdAt: created,
          updatedAt: created,
          consent: true,
          language: lang,
          fortune: abandoned ? '' : pool[n % pool.length],
          fortuneSource: Math.random() < 0.9 ? 'ai' : 'fallback',
          delivery: { printed: !abandoned && Math.random() < 0.85, whatsapp: '', email: '' },
          outcome: abandoned ? 'abandoned' : 'completed',
          abandonedAt: abandoned ? ['consent', 'face', 'palm'][n % 3] : '',
        });
      }
    }
  }
  await Session.collection.insertMany(docs);
  for (const t of Object.values(T)) {
    await Template.updateOne({ _id: t._id }, { $set: { usageCount: docs.filter((d) => String(d.template) === String(t._id) && d.outcome === 'completed').length } });
  }
  console.log(`Seeded ${docs.length} sample readings`);
}

console.log('Seed done. Admin login: admin@kuri.dev / KuriDev2026  ·  "Demo Day" (today+2) booked on KURI-001');
await disconnectDb();
