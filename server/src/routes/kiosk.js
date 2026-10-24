import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { Machine, Template, Session } from '../models/index.js';
import { kioskAuth, hashToken, newToken } from '../middleware/kioskAuth.js';
import { generateFortune } from '../services/fortune.js';
import { saveDataUrl } from '../services/images.js';
import { activeAssignment } from '../services/assignment.js';
import { ah } from '../services/http.js';

export const kioskRouter = express.Router();

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // YYYY-MM-DD

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function publicConfig(machine, { event, template }) {
  return {
    machine: { machineId: machine.machineId, name: machine.name, status: machine.status, location: machine.location },
    event: event
      ? {
          id: String(event._id),
          name: event.name,
          client: event.client,
          venue: event.venue,
          language: event.language,
          deliveryOptions: event.deliveryOptions,
          branding: event.branding,
        }
      : null,
    template: template
      ? {
          code: template.code,
          name: template.name,
          theme: template.theme,
          // ?v= changes when the artwork is replaced, so the kiosk's offline copy is refreshed.
          cardImageUrl: template.cardImageUrl ? `/api/public/templates/${template.code}/card?v=${new Date(template.updatedAt || 0).getTime()}` : '',
          cardLayout: template.cardImageUrl ? template.cardLayout || null : null,
        }
      : null,
    serverTime: new Date().toISOString(),
  };
}

/**
 * POST /api/kiosk/register
 * First boot of a kiosk: exchanges the shared provision key for a per-machine token.
 * Re-registering an existing machineId rotates its token (old token stops working).
 */
kioskRouter.post(
  '/register',
  ah(async (req, res) => {
    const { machineId, name, provisionKey, appVersion } = req.body || {};
    if (!config.provisionKey) return res.status(503).json({ error: 'Provisioning disabled on server' });
    const key = String(provisionKey || '').trim();
    if (!key || !safeEqual(key, config.provisionKey)) {
      console.warn(`[register] rejected ${machineId || '?'} from ${req.ip}: key length ${key.length}, server key length ${config.provisionKey.length}`);
      return res.status(403).json({ error: 'Invalid provision key — it must match KIOSK_PROVISION_KEY in the server .env (restart the server after editing .env)' });
    }
    const id = String(machineId || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(id)) return res.status(400).json({ error: 'machineId must be 3–32 chars: A–Z, 0–9, -' });

    const token = newToken();
    await Machine.updateOne(
      { machineId: id },
      {
        $set: { tokenHash: hashToken(token), appVersion: appVersion || '', lastIp: req.ip },
        $setOnInsert: { machineId: id, name: name || id },
      },
      { upsert: true },
    );
    const machine = await Machine.findOne({ machineId: id });
    res.status(201).json({ token, config: publicConfig(machine, await activeAssignment(machine)) });
  }),
);

kioskRouter.use(kioskAuth);

/** GET /api/kiosk/config — current event/template for this machine. */
kioskRouter.get(
  '/config',
  ah(async (req, res) => {
    res.json(publicConfig(req.machine, await activeAssignment(req.machine)));
  }),
);

/** POST /api/kiosk/heartbeat — every ~30s. Body: { state, appVersion, hardware } */
kioskRouter.post(
  '/heartbeat',
  ah(async (req, res) => {
    const { state, appVersion, hardware, pendingUploads } = req.body || {};
    const m = req.machine;
    m.lastHeartbeatAt = new Date();
    m.lastIp = req.ip;
    if (typeof state === 'string') m.lastState = state.slice(0, 32);
    if (typeof appVersion === 'string') m.appVersion = appVersion.slice(0, 32);
    if (Number.isFinite(pendingUploads) && pendingUploads >= 0) m.pendingUploads = Math.min(Math.floor(pendingUploads), 1e6);
    if (hardware && typeof hardware === 'object') {
      for (const k of ['faceCamera', 'palmCamera', 'printer']) {
        if (typeof hardware[k] === 'string') m.hardware[k] = hardware[k].slice(0, 120);
      }
    }
    await m.save();
    res.json(publicConfig(m, await activeAssignment(m)));
  }),
);

/**
 * POST /api/kiosk/fortune — Body: { palmImage: dataURL, language? }
 * Gemini is called only from here, so the API key never reaches the kiosk browser.
 * Always 200: falls back to the offline bank on any AI failure.
 */
kioskRouter.post(
  '/fortune',
  ah(async (req, res) => {
    const { palmImage, language } = req.body || {};
    const { event, template } = await activeAssignment(req.machine);
    const lang = language === 'ta' ? 'ta' : event?.language === 'ta' ? 'ta' : 'en';
    const result = await generateFortune({
      palmImage,
      theme: template?.theme || 'general',
      language: lang,
      promptHint: template?.promptHint || '',
      fallbackPool: template?.fallbackFortunes || [],
    });
    if (result.error) console.warn(`[fortune] ${req.machine.machineId} fallback: ${result.error}`);
    res.json({ fortune: result.fortune, source: result.source, language: lang });
  }),
);

/**
 * POST /api/kiosk/sessions — upload a finished (or abandoned) reading.
 * Idempotent on sessionId so the kiosk can safely retry from its offline queue.
 */
kioskRouter.post(
  '/sessions',
  ah(async (req, res) => {
    const b = req.body || {};
    if (!/^[A-Z0-9-]{6,24}$/.test(String(b.sessionId || ''))) return res.status(400).json({ error: 'Invalid sessionId' });
    if (typeof b.consent !== 'boolean') return res.status(400).json({ error: 'consent (boolean) is required' });

    const existing = await Session.findOne({ sessionId: b.sessionId }).lean();
    if (existing) return res.status(200).json({ ok: true, duplicate: true, sessionId: b.sessionId });

    // Readings can arrive late from the kiosk's offline queue: file them under the event that was
    // booked when the reading was TAKEN (startedAt), not when it reached the server.
    const started = b.startedAt ? new Date(b.startedAt) : null;
    const takenAt = started && !Number.isNaN(started.getTime()) && started <= new Date(Date.now() + 5 * 60_000) && started > new Date(Date.now() - 90 * 86_400_000) ? started : new Date();
    const { event, template } = await activeAssignment(req.machine, takenAt);
    // Images are stored only when the guest consented.
    const [facePhotoPath, palmPhotoPath, palmEnhancedPath, cardImagePath] = b.consent
      ? await Promise.all([
          saveDataUrl(b.facePhoto, { sessionId: b.sessionId, kind: 'face' }),
          saveDataUrl(b.palmPhoto, { sessionId: b.sessionId, kind: 'palm' }),
          saveDataUrl(b.palmEnhanced, { sessionId: b.sessionId, kind: 'palm-enhanced' }),
          saveDataUrl(b.cardImage, { sessionId: b.sessionId, kind: 'card' }),
        ])
      : ['', '', '', ''];

    const outcome = b.outcome === 'abandoned' ? 'abandoned' : 'completed';
    await Session.create({
      createdAt: takenAt,
      sessionId: b.sessionId,
      machine: req.machine._id,
      event: event?._id,
      template: template?._id,
      startedAt: b.startedAt ? new Date(b.startedAt) : undefined,
      completedAt: b.completedAt ? new Date(b.completedAt) : undefined,
      consent: b.consent,
      language: b.language || 'en',
      facePhotoPath,
      palmPhotoPath,
      palmEnhancedPath,
      cardImagePath,
      fortune: String(b.fortune || '').slice(0, 1000),
      fortuneSource: b.fortuneSource === 'ai' ? 'ai' : 'fallback',
      delivery: {
        printed: !!b.delivery?.printed,
        whatsapp: b.consent ? String(b.delivery?.whatsapp || '').slice(0, 20) : '',
        email: b.consent ? String(b.delivery?.email || '').slice(0, 120) : '',
      },
      outcome,
      abandonedAt: outcome === 'abandoned' ? String(b.abandonedAt || '').slice(0, 32) : '',
    });

    if (outcome === 'completed') {
      const d = today();
      const m = req.machine;
      m.counters.readingsToday = m.counters.readingsDate === d ? m.counters.readingsToday + 1 : 1;
      m.counters.readingsDate = d;
      m.counters.readingsTotal += 1;
      await m.save();
      if (template) await Template.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
    }
    res.status(201).json({ ok: true, sessionId: b.sessionId });
  }),
);
