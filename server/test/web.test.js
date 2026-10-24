// One app: the server also serves the built admin panel (/admin/) and kiosk (/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kuri-web-'));
const admin = path.join(tmp, 'admin');
const kiosk = path.join(tmp, 'kiosk');
for (const [dir, name] of [[admin, 'ADMIN'], [kiosk, 'KIOSK']]) {
  await fs.mkdir(path.join(dir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), `<!doctype html><title>${name}</title>`);
  await fs.writeFile(path.join(dir, 'assets', 'app-abc123.js'), `console.log('${name}')`);
}
process.env.WEB_ADMIN_DIR = admin;
process.env.WEB_KIOSK_DIR = kiosk;

const { default: request } = await import('supertest');
const { createApp } = await import('../src/app.js');
const app = createApp({ logging: false, web: true });

test('admin panel is served under /admin/ with SPA fallback', async () => {
  await request(app).get('/admin').expect(301).expect('location', '/admin/');
  const r = await request(app).get('/admin/').expect(200);
  assert.match(r.text, /ADMIN/);
  assert.match((await request(app).get('/admin/templates').expect(200)).text, /ADMIN/); // deep link
  const js = await request(app).get('/admin/assets/app-abc123.js').expect(200);
  assert.match(js.headers['cache-control'], /immutable/);
  await request(app).get('/admin/assets/missing.js').expect(404);
});

test('kiosk app is served at / and allows the palm AI (WebAssembly) in its CSP', async () => {
  const r = await request(app).get('/').expect(200);
  assert.match(r.text, /KIOSK/);
  assert.equal(r.headers['cache-control'], 'no-cache');
  const csp = r.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.doesNotMatch(csp, /upgrade-insecure-requests/);
  assert.match((await request(app).get('/setup').expect(200)).text, /KIOSK/);
});

test('API paths never fall through to the web apps', async () => {
  const r = await request(app).get('/api/nope').expect(404);
  assert.deepEqual(r.body, { error: 'Not found' });
  await request(app).get('/api/health').expect(200);
});
