import express from 'express';
import { Session } from '../../models/index.js';
import { ah, httpError, istDay, oid, pageParams, parseDate, toCsv } from '../../services/http.js';
import { signedFileUrl } from '../../services/signedUrl.js';
import { deleteSessionFiles } from '../../services/retention.js';
import { escapeRe } from './events.js';

/**
 * Readings ("Users" in the admin panel). The kiosk does not collect names, so a guest is a
 * reading; phone / email exist only when the guest asked for WhatsApp / email delivery.
 */
export const sessionsRouter = express.Router();

function filter(q) {
  const f = {};
  if (q.event) f.event = oid(q.event, 'event');
  if (q.machine) f.machine = oid(q.machine, 'machine');
  if (q.outcome) f.outcome = q.outcome;
  if (q.printed === 'true') f['delivery.printed'] = true;
  if (q.from || q.to) {
    f.createdAt = {};
    if (q.from) f.createdAt.$gte = parseDate(q.from);
    if (q.to) f.createdAt.$lte = parseDate(q.to, { endOfDay: true });
  }
  if (q.q) {
    const re = new RegExp(escapeRe(q.q), 'i');
    f.$or = [{ sessionId: re }, { 'delivery.whatsapp': re }, { 'delivery.email': re }];
  }
  return f;
}

const populate = (q) => q.populate('event', 'name').populate('machine', 'machineId name').populate('template', 'code name');

function view(s, { full = false } = {}) {
  const v = {
    sessionId: s.sessionId,
    createdAt: s.createdAt,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    durationSec: s.startedAt && s.completedAt ? Math.round((new Date(s.completedAt) - new Date(s.startedAt)) / 1000) : null,
    event: s.event ? { id: String(s.event._id), name: s.event.name } : null,
    machine: s.machine ? { id: String(s.machine._id), machineId: s.machine.machineId } : null,
    template: s.template ? { code: s.template.code, name: s.template.name } : null,
    language: s.language,
    consent: s.consent,
    outcome: s.outcome,
    abandonedAt: s.abandonedAt,
    fortuneSource: s.fortuneSource,
    delivery: { printed: !!s.delivery?.printed, whatsapp: s.delivery?.whatsapp || '', email: s.delivery?.email || '' },
    thumb: signedFileUrl(s.facePhotoPath || s.palmEnhancedPath || s.palmPhotoPath),
    photosErased: !s.facePhotoPath && !s.palmPhotoPath && s.consent,
  };
  if (full) {
    Object.assign(v, {
      fortune: s.fortune,
      images: {
        face: signedFileUrl(s.facePhotoPath),
        palm: signedFileUrl(s.palmPhotoPath),
        palmEnhanced: signedFileUrl(s.palmEnhancedPath),
        card: signedFileUrl(s.cardImagePath),
      },
    });
  }
  return v;
}

sessionsRouter.get(
  '/',
  ah(async (req, res) => {
    const f = filter(req.query);
    const { page, limit, skip } = pageParams(req.query);
    const [total, list] = await Promise.all([Session.countDocuments(f), populate(Session.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit)).lean()]);
    res.json({ page, limit, total, items: list.map((s) => view(s)) });
  }),
);

/** Header numbers for the readings page. */
sessionsRouter.get(
  '/stats',
  ah(async (req, res) => {
    const now = new Date();
    const today = parseDate(istDay(now));
    const monthStart = parseDate(istDay(now).slice(0, 8) + '01');
    const [total, month, todayCount, contacts, abandoned] = await Promise.all([
      Session.countDocuments({ outcome: 'completed' }),
      Session.countDocuments({ outcome: 'completed', createdAt: { $gte: monthStart } }),
      Session.countDocuments({ outcome: 'completed', createdAt: { $gte: today } }),
      Session.countDocuments({ $or: [{ 'delivery.whatsapp': { $gt: '' } }, { 'delivery.email': { $gt: '' } }] }),
      Session.countDocuments({ outcome: 'abandoned' }),
    ]);
    res.json({ total, thisMonth: month, today: todayCount, withContact: contacts, abandoned });
  }),
);

sessionsRouter.get(
  '/export.csv',
  ah(async (req, res) => {
    const list = (await populate(Session.find(filter(req.query)).sort({ createdAt: -1 }).limit(50_000)).lean()).map((s) => ({ ...view(s), fortune: s.fortune }));
    res.type('text/csv').attachment('kuri-readings.csv').send(
      toCsv(list, [
        { label: 'Reading', value: (s) => s.sessionId },
        { label: 'Date', value: (s) => s.createdAt },
        { label: 'Event', value: (s) => s.event?.name },
        { label: 'Machine', value: (s) => s.machine?.machineId },
        { label: 'Template', value: (s) => s.template?.name },
        { label: 'Language', value: (s) => s.language },
        { label: 'Outcome', value: (s) => s.outcome },
        { label: 'Printed', value: (s) => (s.delivery.printed ? 'yes' : 'no') },
        { label: 'WhatsApp', value: (s) => s.delivery.whatsapp },
        { label: 'Email', value: (s) => s.delivery.email },
        { label: 'Fortune source', value: (s) => s.fortuneSource },
        { label: 'Fortune', value: (s) => s.fortune },
      ]),
    );
  }),
);

sessionsRouter.get(
  '/:sessionId',
  ah(async (req, res) => {
    const s = await populate(Session.findOne({ sessionId: String(req.params.sessionId).toUpperCase() })).lean();
    if (!s) throw httpError(404, 'Reading not found');
    res.json(view(s, { full: true }));
  }),
);

/** Erase a reading completely (guest's right to erasure). */
sessionsRouter.delete(
  '/:sessionId',
  ah(async (req, res) => {
    const s = await Session.findOne({ sessionId: String(req.params.sessionId).toUpperCase() }).lean();
    if (!s) throw httpError(404, 'Reading not found');
    await deleteSessionFiles(s);
    await Session.deleteOne({ _id: s._id });
    res.json({ ok: true });
  }),
);
