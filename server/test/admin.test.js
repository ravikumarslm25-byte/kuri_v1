// Integration tests for the admin API (+ how bookings drive the kiosk).
//   TEST_MONGO_URI=mongodb://127.0.0.1:27017/kuri_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kuri-admin-'));
process.env.MONGO_URI = (process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/kuri_test') + '_admin';
process.env.KIOSK_PROVISION_KEY = 'test-provision-key';
process.env.GEMINI_API_KEY = '';
process.env.UPLOAD_DIR = uploadDir;
process.env.ADMIN_JWT_SECRET = 'test-secret';

const { default: request } = await import('supertest');
const mongoose = (await import('mongoose')).default;
const { connectDb, disconnectDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const M = await import('../src/models/index.js');
const { hashPassword } = await import('../src/services/passwords.js');
const { purgeExpired } = await import('../src/services/retention.js');

const app = createApp({ logging: false });
const JPG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

let admin; // super admin token
let kiosk; // kiosk token
const ids = {};
const A = (t = admin) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await connectDb(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await Promise.all(Object.values(M).filter((x) => x?.init).map((m) => m.init()));
  await M.AdminUser.create({ name: 'Ravi', email: 'ravi@hackgenix.com', role: 'super_admin', passwordHash: await hashPassword('Kuri2026secret') });
});
after(async () => {
  await mongoose.connection.db.dropDatabase();
  await disconnectDb();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

test('login: wrong password rejected, right password returns token + user', async () => {
  await request(app).post('/api/admin/auth/login').send({ email: 'ravi@hackgenix.com', password: 'nope' }).expect(401);
  const r = await request(app).post('/api/admin/auth/login').send({ email: 'RAVI@hackgenix.com', password: 'Kuri2026secret' }).expect(200);
  admin = r.body.token;
  assert.equal(r.body.user.role, 'super_admin');
  assert.ok(r.body.user.permissions.includes('team'));
  const me = await request(app).get('/api/admin/auth/me').set(A()).expect(200);
  assert.equal(me.body.user.email, 'ravi@hackgenix.com');
});

test('admin routes need a token', async () => {
  await request(app).get('/api/admin/machines').expect(401);
  await request(app).get('/api/admin/machines').set(A('garbage')).expect(401);
});

test('machines: create, duplicate, update, list stats', async () => {
  const r = await request(app).post('/api/admin/machines').set(A()).send({ machineId: 'kuri-001', name: 'Kiosk 001', location: 'Warehouse - Chennai' }).expect(201);
  ids.machine = r.body.id;
  assert.equal(r.body.machineId, 'KURI-001');
  assert.equal(r.body.registered, false);
  await request(app).post('/api/admin/machines').set(A()).send({ machineId: 'KURI-001' }).expect(409);
  const m2 = await request(app).post('/api/admin/machines').set(A()).send({ machineId: 'KURI-002' }).expect(201);
  ids.machine2 = m2.body.id;
  await request(app).patch(`/api/admin/machines/${ids.machine}`).set(A()).send({ status: 'active' }).expect(200);
  await request(app).patch(`/api/admin/machines/${ids.machine}`).set(A()).send({ status: 'bogus' }).expect(400);
  const list = await request(app).get('/api/admin/machines').set(A()).expect(200);
  assert.equal(list.body.stats.total, 2);
  assert.equal(list.body.stats.active, 1);

  // kiosk registers the pre-created machine
  const reg = await request(app).post('/api/kiosk/register').send({ machineId: 'KURI-001', provisionKey: 'test-provision-key' }).expect(201);
  kiosk = reg.body.token;
  await request(app).post('/api/kiosk/heartbeat').set(A(kiosk)).send({ state: 'idle' }).expect(200);
  const d = await request(app).get(`/api/admin/machines/${ids.machine}`).set(A()).expect(200);
  assert.equal(d.body.registered, true);
  assert.equal(d.body.online, true);
});

test('templates: auto code, fortune cleanup, card artwork served publicly', async () => {
  const r = await request(app)
    .post('/api/admin/templates')
    .set(A())
    .send({ name: 'Love & Destiny', theme: 'love', status: 'active', fallbackFortunes: ['too short', 'A long enough custom fortune line for testing.'] })
    .expect(201);
  ids.template = r.body.id;
  assert.equal(r.body.code, 'TMPL-001');
  assert.deepEqual(r.body.fallbackFortunes, ['A long enough custom fortune line for testing.']);
  await request(app).post('/api/admin/templates').set(A()).send({ name: 'X', theme: 'nope' }).expect(400);
  const t2 = await request(app).post('/api/admin/templates').set(A()).send({ name: 'Career Oracle', theme: 'career', status: 'active' }).expect(201);
  ids.template2 = t2.body.id;
  const up = await request(app).put(`/api/admin/templates/${ids.template}/card`).set(A()).send({ image: JPG }).expect(200);
  assert.match(up.body.cardImageUrl, /^\/api\/public\/templates\/TMPL-001\/card/);
  await request(app).get('/api/public/templates/TMPL-001/card').expect(200).expect('content-type', /image\/jpeg/);
  await request(app).get('/api/public/templates/TMPL-002/card').expect(404);
});

test('templates: card layout is validated, clamped into the card and saved', async () => {
  const put = (cardLayout) => request(app).patch(`/api/admin/templates/${ids.template}`).set(A()).send({ cardLayout });
  await put('nope').expect(400);
  await put({ fortune: { x: 0, y: 0, w: 100, h: 50 } }).expect(400); // fortune box too small
  const r = await put({
    face: { x: 100, y: 300, w: 400, h: 500, shape: 'circle', borderColor: '#ff0000', borderWidth: 4 },
    palm: { x: 1150, y: 1790, w: 400, h: 500, shape: 'triangle', borderColor: 'red' }, // off the card + bad values
    fortune: { x: 100, y: 1000, w: 1000, h: 500, font: 'Comic Sans', align: 'left', maxSize: 999, enabled: false },
    meta: { enabled: true },
  }).expect(200);
  const L = r.body.cardLayout;
  assert.deepEqual([L.face.x, L.face.shape, L.face.borderColor], [100, 'circle', '#ff0000']);
  assert.deepEqual([L.palm.x, L.palm.y, L.palm.shape, L.palm.borderColor], [800, 1300, 'rounded', '#dcb15c']); // pulled back inside 1200x1800
  assert.deepEqual([L.fortune.font, L.fortune.align, L.fortune.maxSize, L.fortune.enabled], ['Marcellus', 'left', 160, true]);
  assert.equal(L.meta.enabled, true);
  // Other edits keep the layout
  const t = await request(app).patch(`/api/admin/templates/${ids.template}`).set(A()).send({ promptHint: 'Mention family.' }).expect(200);
  assert.equal(t.body.cardLayout.face.x, 100);
});

test('machine default template: used when nothing is booked, shown on the machine', async () => {
  await request(app).patch(`/api/admin/machines/${ids.machine}`).set(A()).send({ defaultTemplate: 'nope' }).expect(400);
  const m = await request(app).patch(`/api/admin/machines/${ids.machine}`).set(A()).send({ defaultTemplate: ids.template }).expect(200);
  assert.equal(m.body.defaultTemplate, ids.template);
  assert.deepEqual([m.body.currentTemplate.code, m.body.currentTemplate.source, m.body.currentTemplate.customCard], ['TMPL-001', 'machine default', true]);
  const cfg = await request(app).get('/api/kiosk/config').set(A(kiosk)).expect(200);
  assert.equal(cfg.body.event, null);
  assert.equal(cfg.body.template.code, 'TMPL-001');
  assert.equal(cfg.body.template.cardLayout.face.x, 100); // the custom card reaches an unbooked kiosk
  await request(app).delete(`/api/admin/templates/${ids.template}`).set(A()).expect(409); // in use as a default
  const cleared = await request(app).patch(`/api/admin/machines/${ids.machine}`).set(A()).send({ defaultTemplate: null }).expect(200);
  assert.equal(cleared.body.currentTemplate, null);
});

test('events: create, validation, phase', async () => {
  await request(app).post('/api/admin/events').set(A()).send({ name: 'Bad', startDate: day(2), endDate: day(1) }).expect(400);
  const live = await request(app)
    .post('/api/admin/events')
    .set(A())
    .send({ name: 'Wedding Expo', client: 'EventPro', venue: 'Pragati Maidan', startDate: day(-1), endDate: day(1), template: ids.template2, expectedAttendees: 5000 })
    .expect(201);
  ids.event = live.body.id;
  assert.equal(live.body.phase, 'live');
  assert.equal(live.body.template.name, 'Career Oracle');
  const up = await request(app).post('/api/admin/events').set(A()).send({ name: 'Corporate Annual Meet', startDate: day(10), endDate: day(11) }).expect(201);
  ids.event2 = up.body.id;
  assert.equal(up.body.phase, 'upcoming');
  const l = await request(app).get('/api/admin/events?phase=live').set(A()).expect(200);
  assert.deepEqual(l.body.items.map((e) => e.name), ['Wedding Expo']);
});

test('bookings: dates inside event, no double-booking, confirmed booking drives the kiosk', async () => {
  // before any booking the kiosk has no event
  let cfg = await request(app).get('/api/kiosk/config').set(A(kiosk)).expect(200);
  assert.equal(cfg.body.event, null);

  await request(app).post('/api/admin/bookings').set(A()).send({ event: ids.event, machine: ids.machine, startDate: day(-5) }).expect(400); // outside event
  const b = await request(app)
    .post('/api/admin/bookings')
    .set(A())
    .send({ event: ids.event, machine: ids.machine, template: ids.template, amount: 25000, status: 'pending' })
    .expect(201);
  ids.booking = b.body.id;
  assert.equal(b.body.bookingId, 'BKG-0001');

  // pending booking does not activate the kiosk
  cfg = await request(app).get('/api/kiosk/config').set(A(kiosk)).expect(200);
  assert.equal(cfg.body.event, null);

  // same machine, overlapping dates -> clash
  const clash = await request(app).post('/api/admin/bookings').set(A()).send({ event: ids.event, machine: ids.machine }).expect(409);
  assert.match(clash.body.error, /already booked/);

  await request(app).patch(`/api/admin/bookings/${ids.booking}`).set(A()).send({ status: 'confirmed' }).expect(200);
  cfg = await request(app).get('/api/kiosk/config').set(A(kiosk)).expect(200);
  assert.equal(cfg.body.event.name, 'Wedding Expo');
  assert.equal(cfg.body.template.name, 'Love & Destiny'); // booking template overrides event template
  assert.match(cfg.body.template.cardImageUrl, /^\/api\/public\/templates\/TMPL-001\/card\?v=\d+$/);
  assert.equal(cfg.body.template.cardLayout.face.x, 100); // layout set in the templates test reaches the kiosk

  await request(app).delete(`/api/admin/bookings/${ids.booking}`).set(A()).expect(409); // confirmed: cancel instead
  const ev = await request(app).get(`/api/admin/events/${ids.event}`).set(A()).expect(200);
  assert.equal(ev.body.machineCount, 1);
  assert.equal(ev.body.bookings[0].machine.machineId, 'KURI-001');
});

test('readings: kiosk upload -> admin list, signed images, erase', async () => {
  for (const [id, outcome] of [
    ['AAAA-0001', 'completed'],
    ['AAAA-0002', 'completed'],
    ['AAAA-0003', 'abandoned'],
  ]) {
    await request(app)
      .post('/api/kiosk/sessions')
      .set(A(kiosk))
      .send({
        sessionId: id,
        consent: true,
        outcome,
        abandonedAt: outcome === 'abandoned' ? 'palm' : undefined,
        startedAt: new Date(Date.now() - 80_000).toISOString(),
        completedAt: new Date().toISOString(),
        facePhoto: JPG,
        palmPhoto: JPG,
        cardImage: JPG,
        fortune: 'Your heart line runs deep and steady.',
        delivery: { printed: outcome === 'completed', whatsapp: id === 'AAAA-0002' ? '+919876543210' : '' },
      })
      .expect(201);
  }
  const list = await request(app).get('/api/admin/sessions?limit=2').set(A()).expect(200);
  assert.equal(list.body.total, 3);
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.items[0].event.name, 'Wedding Expo');
  const search = await request(app).get('/api/admin/sessions?q=98765').set(A()).expect(200);
  assert.deepEqual(search.body.items.map((s) => s.sessionId), ['AAAA-0002']);

  const stats = await request(app).get('/api/admin/sessions/stats').set(A()).expect(200);
  assert.equal(stats.body.total, 2);
  assert.equal(stats.body.withContact, 1);

  const d = await request(app).get('/api/admin/sessions/aaaa-0001').set(A()).expect(200);
  assert.ok(d.body.images.card.startsWith('/api/files/sessions/'));
  await request(app).get(d.body.images.face).expect(200);
  await request(app).get(d.body.images.face.replace(/sig=[^&]+/, 'sig=forged')).expect(403);
  await request(app).get('/api/files/sessions/whatever.jpg').expect(403);

  const csv = await request(app).get('/api/admin/sessions/export.csv').set(A()).expect(200);
  assert.match(csv.text, /^Reading,Date,Event/);
  assert.equal(csv.text.trim().split('\n').length, 4);

  await request(app).delete('/api/admin/sessions/AAAA-0003').set(A()).expect(200);
  await request(app).get('/api/admin/sessions/AAAA-0003').set(A()).expect(404);
  const files = await fs.readdir(path.join(uploadDir, 'sessions', new Date().toISOString().slice(0, 7)));
  assert.ok(!files.some((f) => f.startsWith('AAAA-0003')));
});

test('a reading uploaded late (offline queue) is filed under the event booked when it was taken', async () => {
  // Past event + confirmed booking on the same kiosk, 3 days ago
  const past = await request(app).post('/api/admin/events').set(A()).send({ name: 'Yesterday Fair', startDate: day(-4), endDate: day(-3) }).expect(201);
  await request(app).post('/api/admin/bookings').set(A()).send({ event: past.body.id, machine: ids.machine, status: 'confirmed' }).expect(201);
  const takenAt = new Date(Date.now() - 3.5 * 86_400_000);
  await request(app)
    .post('/api/kiosk/sessions')
    .set(A(kiosk))
    .send({ sessionId: 'LATE-0001', consent: false, startedAt: takenAt.toISOString(), completedAt: takenAt.toISOString(), outcome: 'completed' })
    .expect(201);
  const s = await request(app).get('/api/admin/sessions/LATE-0001').set(A()).expect(200);
  assert.equal(s.body.event.name, 'Yesterday Fair');
  assert.equal(new Date(s.body.createdAt).toISOString(), takenAt.toISOString());
  await request(app).delete('/api/admin/sessions/LATE-0001').set(A()).expect(200);
});

test('reports + dashboard', async () => {
  const r = await request(app).get('/api/admin/reports').set(A()).expect(200);
  assert.equal(r.body.totals.readings, 2);
  assert.equal(r.body.totals.printed, 2);
  assert.equal(r.body.totals.whatsapp, 1);
  assert.equal(r.body.totals.revenue, 25000);
  assert.equal(r.body.totals.avgDurationSec, 80);
  assert.equal(r.body.daily.length, 30);
  assert.equal(r.body.byEvent[0].name, 'Wedding Expo');
  assert.equal(r.body.byTemplate[0].name, 'Love & Destiny');
  const filtered = await request(app).get(`/api/admin/reports?machine=${ids.machine2}`).set(A()).expect(200);
  assert.equal(filtered.body.totals.readings, 0);

  const dsh = await request(app).get('/api/admin/dashboard').set(A()).expect(200);
  assert.equal(dsh.body.kpis.readings30d, 2);
  assert.equal(dsh.body.kpis.machinesTotal, 2);
  assert.equal(dsh.body.kpis.machinesOnline, 1);
  assert.equal(dsh.body.kpis.utilizationPct, 50);
  assert.equal(dsh.body.weekly.length, 7);
  assert.equal(dsh.body.recentReadings.length, 2);
  await request(app).get('/api/admin/reports/export.csv').set(A()).expect(200).expect('content-type', /text\/csv/);
});

test('team + permissions', async () => {
  const c = await request(app)
    .post('/api/admin/team')
    .set(A())
    .send({ name: 'Ravi Verma', email: 'ravi.verma@kuri.com', role: 'event_manager' })
    .expect(201);
  assert.ok(c.body.tempPassword);
  assert.deepEqual(c.body.user.permissions, ['dashboard', 'events', 'bookings', 'reports', 'sessions']);
  await request(app).post('/api/admin/team').set(A()).send({ name: 'Dup', email: 'ravi.verma@kuri.com' }).expect(409);

  const em = (await request(app).post('/api/admin/auth/login').send({ email: 'ravi.verma@kuri.com', password: c.body.tempPassword }).expect(200)).body.token;
  await request(app).get('/api/admin/events').set(A(em)).expect(200);
  await request(app).get('/api/admin/machines').set(A(em)).expect(403);
  await request(app).get('/api/admin/team').set(A(em)).expect(403);
  await request(app).get('/api/admin/lookups').set(A(em)).expect(200);

  // custom permissions
  await request(app).patch(`/api/admin/team/${c.body.user.id}`).set(A()).send({ permissions: ['machines'] }).expect(200);
  await request(app).get('/api/admin/machines').set(A(em)).expect(200);
  await request(app).get('/api/admin/events').set(A(em)).expect(403);

  // disabling signs them out immediately
  await request(app).patch(`/api/admin/team/${c.body.user.id}`).set(A()).send({ status: 'disabled' }).expect(200);
  await request(app).get('/api/admin/auth/me').set(A(em)).expect(401);

  // protect the last super admin
  const me = (await request(app).get('/api/admin/auth/me').set(A())).body.user;
  await request(app).patch(`/api/admin/team/${me.id}`).set(A()).send({ status: 'disabled' }).expect(400);
  await request(app).delete(`/api/admin/team/${me.id}`).set(A()).expect(400);
});

test('change password rotates tokens', async () => {
  await request(app).post('/api/admin/auth/change-password').set(A()).send({ current: 'Kuri2026secret', next: 'short' }).expect(400);
  const r = await request(app).post('/api/admin/auth/change-password').set(A()).send({ current: 'Kuri2026secret', next: 'NewKuri2026pass' }).expect(200);
  await request(app).get('/api/admin/auth/me').set(A()).expect(401); // old token dead
  admin = r.body.token;
  await request(app).get('/api/admin/auth/me').set(A()).expect(200);
});

test('retention erases photos and contacts but keeps the reading', async () => {
  const r = await purgeExpired(90, new Date(Date.now() + 91 * 86_400_000));
  assert.equal(r.purged, 2);
  const s = await M.Session.findOne({ sessionId: 'AAAA-0002' }).lean();
  assert.equal(s.facePhotoPath, '');
  assert.equal(s.cardImagePath, '');
  assert.equal(s.delivery.whatsapp, '');
  assert.equal(s.fortune, 'Your heart line runs deep and steady.');
  const d = await request(app).get('/api/admin/sessions/AAAA-0002').set(A()).expect(200);
  assert.equal(d.body.photosErased, true);
});

test('delete guards', async () => {
  await request(app).delete(`/api/admin/machines/${ids.machine}`).set(A()).expect(409); // has readings
  await request(app).delete(`/api/admin/machines/${ids.machine2}`).set(A()).expect(200);
  await request(app).delete(`/api/admin/templates/${ids.template}`).set(A()).expect(409); // used by booking
  await request(app).delete(`/api/admin/events/${ids.event}`).set(A()).expect(409); // has readings
  await request(app).delete(`/api/admin/events/${ids.event2}`).set(A()).expect(200);
});

test('login rate limit', async () => {
  for (let i = 0; i < 8; i++) await request(app).post('/api/admin/auth/login').send({ email: 'x@y.com', password: 'bad' }).expect(401);
  await request(app).post('/api/admin/auth/login').send({ email: 'x@y.com', password: 'bad' }).expect(429);
});
