import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { config } from './config.js';
import { kioskRouter } from './routes/kiosk.js';
import { adminRouter } from './routes/admin/index.js';
import { publicRouter } from './routes/admin/templates.js';
import { filesRouter } from './routes/files.js';
import { mountWebApps } from './services/web.js';

export function createApp({ logging = true, web = false } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
  app.use(express.json({ limit: config.bodyLimit }));
  if (logging) app.use(morgan('tiny'));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'up' : 'down', ai: !!config.gemini.apiKey, time: new Date().toISOString() });
  });

  app.use('/api/kiosk', kioskRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/files', filesRouter);
  if (web && config.web.enabled) mountWebApps(app, { ...config.web, log: logging });

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors || {}).map((e) => e.message).join('; ') || err.message });
    if (err.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });
    if (err.code === 11000) return res.status(409).json({ error: 'Already exists' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
  });
  return app;
}
