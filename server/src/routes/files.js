import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';
import { verifyFileSig } from '../services/signedUrl.js';

/** GET /api/files/<relative path>?exp=&sig= — serves guest images only with a valid signature. */
export const filesRouter = express.Router();

filesRouter.get(/^\/(.+)$/, (req, res) => {
  const rel = decodeURIComponent(req.params[0]);
  if (!verifyFileSig(rel, req.query.exp, req.query.sig)) return res.status(403).json({ error: 'Link expired or invalid' });
  const abs = path.resolve(config.uploadDir, rel);
  if (!abs.startsWith(config.uploadDir + path.sep) || !fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });
  res.set('Cache-Control', 'private, max-age=600');
  res.sendFile(abs);
});
