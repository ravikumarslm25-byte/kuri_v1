// Integration tests for the kiosk API. Needs a MongoDB-compatible server:
//   TEST_MONGO_URI=mongodb://127.0.0.1:27017/kuri_test npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kuri-up-'));
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/kuri_test';
process.env.KIOSK_PROVISION_KEY = 'test-provision-key';
process.env.GEMINI_API_KEY = ''; // force fallback path, no network
process.env.UPLOAD_DIR = uploadDir;

const { default: request } = await import('supertest');
const mongoose = (await import('mongoose')).default;
const { connectDb, disconnectDb } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { Machine, Template, Event, Session } = await import('../src/models/index.js');

const app = createApp({ logging: false });
// 1x1 JPEG
const JPG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
let token;

before(async () => {
  await connectDb(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await Promise.all([Machine.init(), Template.init(), Event.init(), Session.init()]);
});
after(async () => {
  await mongoose.connection.db.dropDatabase();
  await disconnectDb();
  await fs.rm(uploadDir, { recursive: true, force: true });
});

test('health', async () => {
  const r = await request(app).get('/api/health').expect(200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.db, 'up');
  assert.equal(r.body.ai, false);
});

test('register rejects bad provision key and bad machineId', async () => {
  await request(app).post('/api/kiosk/register').send({ machineId: 'KURI-001', provisionKey: 'nope' }).expect(403);
  await request(app).post('/api/kiosk/register').send({ machineId: 'x', provisionKey: 'test-provision-key' }).expect(400);
});

test('register issues token; protected routes need it', async () => {
  const r = await request(app)
    .post('/api/kiosk/register')
    .send({ machineId: 'kuri-001', name: 'Kiosk 001', provisionKey: 'test-provision-key', appVersion: '0.1.0' })
    .expect(201);
  token = r.body.token;
  assert.ok(token && token.length > 30);
  assert.equal(r.body.config.machine.machineId, 'KURI-001');
  assert.equal(r.body.config.event, null);
  await request(app).get('/api/kiosk/config').expect(401);
  await request(app).get('/api/kiosk/config').set('Authorization', 'Bearer wrong').expect(401);
});

test('re-register rotates the token', async () => {
  const r = await request(app).post('/api/kiosk/register').send({ machineId: 'KURI-001', provisionKey: 'test-provision-key' }).expect(201);
  await request(app).get('/api/kiosk/config').set('Authorization', `Bearer ${token}`).expect(401);
  token = r.body.token;
  await request(app).get('/api/kiosk/config').set('Authorization', `Bearer ${token}`).expect(200);
});

test('config returns the live event + template for this machine', async () => {
  const machine = await Machine.findOne({ machineId: 'KURI-001' });
  const tmpl = await Template.create({ code: 'TMPL-002', name: 'Love & Destiny', status: 'active', theme: 'love', fallbackFortunes: ['Custom line for the love template, long enough.'] });
  await Event.create({
    name: 'Wedding Expo',
    client: 'EventPro',
    startDate: new Date(Date.now() - 3600_000),
    endDate: new Date(Date.now() + 3600_000),
    machines: [machine._id],
    template: tmpl._id,
  });
  // A past event must not be picked.
  await Event.create({ name: 'Old', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-02'), machines: [machine._id] });
  const r = await request(app).get('/api/kiosk/config').set('Authorization', `Bearer ${token}`).expect(200);
  assert.equal(r.body.event.name, 'Wedding Expo');
  assert.equal(r.body.template.code, 'TMPL-002');
  assert.equal(r.body.template.theme, 'love');
});

test('heartbeat updates machine state', async () => {
  await request(app)
    .post('/api/kiosk/heartbeat')
    .set('Authorization', `Bearer ${token}`)
    .send({ state: 'idle', appVersion: '0.1.1', hardware: { palmCamera: 'Logitech BRIO' }, pendingUploads: 3 })
    .expect(200);
  const m = await Machine.findOne({ machineId: 'KURI-001' }).lean();
  assert.equal(m.lastState, 'idle');
  assert.equal(m.appVersion, '0.1.1');
  assert.equal(m.hardware.palmCamera, 'Logitech BRIO');
  assert.equal(m.pendingUploads, 3);
  assert.ok(m.lastHeartbeatAt);
});

test('fortune falls back offline when AI is not configured', async () => {
  const r = await request(app).post('/api/kiosk/fortune').set('Authorization', `Bearer ${token}`).send({ palmImage: JPG }).expect(200);
  assert.equal(r.body.source, 'fallback');
  assert.ok(r.body.fortune.length > 20);
  const ta = await request(app).post('/api/kiosk/fortune').set('Authorization', `Bearer ${token}`).send({ palmImage: JPG, language: 'ta' }).expect(200);
  assert.equal(ta.body.language, 'ta');
  assert.match(ta.body.fortune, /[஀-௿]/); // Tamil script
});

test('session upload stores images, is idempotent, bumps counters', async () => {
  const body = {
    sessionId: 'K7M2-QX9P',
    consent: true,
    startedAt: new Date(Date.now() - 90_000).toISOString(),
    completedAt: new Date().toISOString(),
    facePhoto: JPG,
    palmPhoto: JPG,
    palmEnhanced: JPG,
    fortune: 'Your heart line runs deep. Good things are coming.',
    fortuneSource: 'fallback',
    delivery: { printed: true },
  };
  await request(app).post('/api/kiosk/sessions').set('Authorization', `Bearer ${token}`).send(body).expect(201);
  const dup = await request(app).post('/api/kiosk/sessions').set('Authorization', `Bearer ${token}`).send(body).expect(200);
  assert.equal(dup.body.duplicate, true);

  const s = await Session.findOne({ sessionId: 'K7M2-QX9P' }).populate('event').lean();
  assert.equal(s.event.name, 'Wedding Expo');
  assert.ok(s.facePhotoPath.endsWith('K7M2-QX9P-face.jpg'));
  await fs.access(path.join(uploadDir, s.palmEnhancedPath));
  const m = await Machine.findOne({ machineId: 'KURI-001' }).lean();
  assert.equal(m.counters.readingsToday, 1);
  assert.equal(m.counters.readingsTotal, 1);
  const t = await Template.findOne({ code: 'TMPL-002' }).lean();
  assert.equal(t.usageCount, 1);
});

test('no consent => no images stored; abandoned sessions do not count', async () => {
  await request(app)
    .post('/api/kiosk/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId: 'ABCD-0001', consent: false, facePhoto: JPG, outcome: 'abandoned', abandonedAt: 'consent' })
    .expect(201);
  const s = await Session.findOne({ sessionId: 'ABCD-0001' }).lean();
  assert.equal(s.facePhotoPath, '');
  assert.equal(s.outcome, 'abandoned');
  const m = await Machine.findOne({ machineId: 'KURI-001' }).lean();
  assert.equal(m.counters.readingsTotal, 1);
});

test('session validation', async () => {
  await request(app).post('/api/kiosk/sessions').set('Authorization', `Bearer ${token}`).send({ sessionId: 'bad id!', consent: true }).expect(400);
  await request(app).post('/api/kiosk/sessions').set('Authorization', `Bearer ${token}`).send({ sessionId: 'ABCD-0002' }).expect(400);
  await request(app)
    .post('/api/kiosk/sessions')
    .set('Authorization', `Bearer ${token}`)
    .send({ sessionId: 'ABCD-0003', consent: true, facePhoto: 'data:text/html;base64,PHA+' })
    .expect(400);
});
