// Serves the built web apps from this server, so the whole product is ONE app on ONE port:
//   /api/...   the API (mounted before this)
//   /admin/... admin panel (admin/dist, built with base /admin/)
//   /...       kiosk app   (kiosk/dist)
// Each is only mounted if its build exists (dev keeps using the Vite servers).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';

// The apps need: MediaPipe palm model (WebAssembly), blob: images (offline card artwork),
// data: images (card previews/photos), camera streams. No third-party origins at all.
const csp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'"],
    'worker-src': ["'self'", 'blob:'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    // 'self' for the API; https: so a kiosk can be pointed at another Kuri server from Setup.
    'connect-src': ["'self'", 'https:', 'data:', 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'none'"],
  },
});

function spa(dir) {
  const index = path.join(dir, 'index.html');
  const router = express.Router();
  router.use(csp);
  router.use(
    express.static(dir, {
      index: false,
      setHeaders(res, file) {
        // Hashed build files never change; everything else (plates, models) re-validates hourly.
        if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );
  // SPA fallback: any page route returns index.html (never cached, so updates show up at once).
  router.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next(); // a missing file, not a page
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}

export function mountWebApps(app, { adminDir, kioskDir, log = true }) {
  const mounted = [];
  if (adminDir && fs.existsSync(path.join(adminDir, 'index.html'))) {
    // "/admin" -> "/admin/" so the app's relative asset paths resolve (Express also matches "/admin/" here).
    app.get('/admin', (req, res, next) => {
      const [p, q] = req.originalUrl.split('?');
      return p === '/admin' ? res.redirect(301, `/admin/${q ? `?${q}` : ''}`) : next();
    });
    app.use('/admin', spa(adminDir));
    mounted.push('/admin');
  }
  if (kioskDir && fs.existsSync(path.join(kioskDir, 'index.html'))) {
    const kiosk = spa(kioskDir);
    // Unknown /api/... paths fall through to the JSON 404, never to the kiosk page.
    app.use((req, res, next) => (req.path === '/api' || req.path.startsWith('/api/') ? next() : kiosk(req, res, next)));
    mounted.push('/ (kiosk)');
  }
  if (log && mounted.length) console.log(`Web apps: ${mounted.join(', ')}`);
  return mounted;
}
