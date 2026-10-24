import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { Booking, Event, Machine, Template, nextId } from '../../models/index.js';
import { ah, httpError, oid, pick, requireFields } from '../../services/http.js';
import { cleanLayout } from '../../services/cardLayout.js';

export const templatesRouter = express.Router();

const EDITABLE = ['name', 'status', 'theme', 'promptHint', 'fallbackFortunes'];
const THEMES = ['general', 'love', 'career', 'wealth', 'health'];

const view = (t) => ({
  id: String(t._id),
  code: t.code,
  name: t.name,
  status: t.status,
  theme: t.theme,
  promptHint: t.promptHint,
  fallbackFortunes: t.fallbackFortunes || [],
  usageCount: t.usageCount || 0,
  cardImageUrl: t.cardImageUrl ? `/api/public/templates/${t.code}/card?v=${new Date(t.updatedAt).getTime()}` : '',
  cardLayout: t.cardLayout || null,
  updatedAt: t.updatedAt,
});

function clean(body) {
  const b = pick(body, EDITABLE);
  if (body && 'cardLayout' in body) b.cardLayout = cleanLayout(body.cardLayout);
  if (b.theme && !THEMES.includes(b.theme)) throw httpError(400, `theme must be one of ${THEMES.join(', ')}`);
  if (b.fallbackFortunes !== undefined) {
    if (!Array.isArray(b.fallbackFortunes)) throw httpError(400, 'fallbackFortunes must be a list');
    b.fallbackFortunes = b.fallbackFortunes.map((s) => String(s).trim()).filter((s) => s.length >= 20).slice(0, 50);
  }
  if (b.promptHint !== undefined) b.promptHint = String(b.promptHint).slice(0, 300);
  return b;
}

templatesRouter.get(
  '/',
  ah(async (req, res) => {
    const list = await Template.find().sort({ code: 1 }).lean();
    res.json({
      stats: {
        total: list.length,
        active: list.filter((t) => t.status === 'active').length,
        drafts: list.filter((t) => t.status === 'draft').length,
        totalUsage: list.reduce((a, t) => a + (t.usageCount || 0), 0),
      },
      items: list.map(view),
    });
  }),
);

templatesRouter.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['name']);
    const t = await Template.create({ code: await nextId('TMPL', 3), name: String(req.body.name).trim(), ...clean(req.body) });
    res.status(201).json(view(t));
  }),
);

templatesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const t = await Template.findById(oid(req.params.id)).lean();
    if (!t) throw httpError(404, 'Template not found');
    res.json(view(t));
  }),
);

templatesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const r = await Template.updateOne({ _id: id }, { $set: clean(req.body) }, { runValidators: true });
    if (!r.matchedCount) throw httpError(404, 'Template not found');
    res.json(view(await Template.findById(id).lean()));
  }),
);

templatesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    if ((await Event.exists({ template: id })) || (await Booking.exists({ template: id }))) {
      throw httpError(409, 'Template is used by events or bookings. Set its status to "archived" instead.');
    }
    if (await Machine.exists({ defaultTemplate: id })) throw httpError(409, 'Template is the default template of a machine. Change it in Machines first.');
    const t = await Template.findByIdAndDelete(id).lean();
    if (!t) throw httpError(404, 'Template not found');
    if (t.cardImageUrl) await fs.rm(path.join(config.uploadDir, t.cardImageUrl), { force: true });
    res.json({ ok: true });
  }),
);

/**
 * PUT /api/admin/templates/:id/card { image: dataURL }
 * Full-bleed 4x6 artwork (ideally 1200x1800 px) the kiosk draws the card content on top of.
 */
templatesRouter.put(
  '/:id/card',
  ah(async (req, res) => {
    const t = await Template.findById(oid(req.params.id));
    if (!t) throw httpError(404, 'Template not found');
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i.exec(String(req.body?.image || ''));
    if (!m) throw httpError(400, 'image must be a JPEG/PNG/WebP data URL');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) throw httpError(413, 'Image too large (max 8 MB)');
    const ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    const rel = path.posix.join('templates', `${t.code}.${ext === 'jpeg' ? 'jpg' : ext}`);
    await fs.mkdir(path.join(config.uploadDir, 'templates'), { recursive: true });
    if (t.cardImageUrl && t.cardImageUrl !== rel) await fs.rm(path.join(config.uploadDir, t.cardImageUrl), { force: true });
    await fs.writeFile(path.join(config.uploadDir, rel), buf);
    t.cardImageUrl = rel;
    await t.save();
    res.json(view(t));
  }),
);

templatesRouter.delete(
  '/:id/card',
  ah(async (req, res) => {
    const t = await Template.findById(oid(req.params.id));
    if (!t) throw httpError(404, 'Template not found');
    if (t.cardImageUrl) await fs.rm(path.join(config.uploadDir, t.cardImageUrl), { force: true });
    t.cardImageUrl = '';
    await t.save();
    res.json(view(t));
  }),
);

/** Public (no auth): kiosks download the card artwork. Artwork is not personal data. */
export const publicRouter = express.Router();
publicRouter.get(
  '/templates/:code/card',
  ah(async (req, res) => {
    const t = await Template.findOne({ code: String(req.params.code).toUpperCase() }).lean();
    if (!t?.cardImageUrl) throw httpError(404, 'No card artwork');
    res.set('Cache-Control', 'public, max-age=300');
    res.sendFile(path.join(config.uploadDir, t.cardImageUrl));
  }),
);
