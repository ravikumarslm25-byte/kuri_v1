import express from 'express';
import { Booking, Event, Machine, Session, Template } from '../../models/index.js';
import { ah, httpError, oid, parseDate, pick, requireFields } from '../../services/http.js';
import { signedFileUrl } from '../../services/signedUrl.js';

export const eventsRouter = express.Router();

/** upcoming | live | completed | cancelled, derived from dates (only "cancelled" is stored). */
export function eventPhase(e, now = new Date()) {
  if (e.status === 'cancelled') return 'cancelled';
  if (now < new Date(e.startDate)) return 'upcoming';
  if (now > new Date(e.endDate)) return 'completed';
  return 'live';
}

async function normalise(body, existing) {
  const b = pick(body, ['name', 'client', 'venue', 'language', 'deliveryOptions', 'branding', 'expectedAttendees', 'contact', 'status']);
  if (body.startDate !== undefined) b.startDate = parseDate(body.startDate);
  if (body.endDate !== undefined) b.endDate = parseDate(body.endDate, { endOfDay: true });
  const start = b.startDate ?? existing?.startDate;
  const end = b.endDate ?? existing?.endDate;
  if (start && end && end < start) throw httpError(400, 'endDate is before startDate');
  if (b.status !== undefined && !['upcoming', 'cancelled'].includes(b.status)) throw httpError(400, 'status can only be set to "cancelled" (or "upcoming" to restore)');
  if (body.template !== undefined) {
    if (!body.template) b.template = null;
    else {
      const t = await Template.findById(oid(body.template, 'template')).lean();
      if (!t) throw httpError(400, 'Template not found');
      b.template = t._id;
    }
  }
  if (body.machines !== undefined) {
    const ids = (Array.isArray(body.machines) ? body.machines : []).map((id) => oid(id, 'machine'));
    if ((await Machine.countDocuments({ _id: { $in: ids } })) !== ids.length) throw httpError(400, 'Unknown machine in list');
    b.machines = ids;
  }
  return b;
}

async function counts(eventIds) {
  const [sessions, bookings] = await Promise.all([
    Session.find({ event: { $in: eventIds }, outcome: 'completed' }).select('event').lean(),
    Booking.find({ event: { $in: eventIds }, status: { $ne: 'cancelled' } }).select('event machine').lean(),
  ]);
  const scans = new Map();
  for (const s of sessions) scans.set(String(s.event), (scans.get(String(s.event)) || 0) + 1);
  const machines = new Map();
  for (const b of bookings) {
    const k = String(b.event);
    if (!machines.has(k)) machines.set(k, new Set());
    machines.get(k).add(String(b.machine));
  }
  return { scans, machines };
}

function view(e, c) {
  const machineSet = new Set([...(c?.machines.get(String(e._id)) || []), ...(e.machines || []).map(String)]);
  return {
    id: String(e._id),
    name: e.name,
    client: e.client,
    venue: e.venue,
    startDate: e.startDate,
    endDate: e.endDate,
    phase: eventPhase(e),
    language: e.language,
    deliveryOptions: e.deliveryOptions,
    branding: e.branding,
    expectedAttendees: e.expectedAttendees,
    contact: e.contact,
    template: e.template && e.template.name ? { id: String(e.template._id), code: e.template.code, name: e.template.name } : null,
    machineIds: (e.machines || []).map(String),
    machineCount: machineSet.size,
    scans: c?.scans.get(String(e._id)) || 0,
  };
}

/** GET /api/admin/events?phase=upcoming|live|completed|cancelled&q=&from=&to= */
eventsRouter.get(
  '/',
  ah(async (req, res) => {
    const q = {};
    if (req.query.q) q.$or = [{ name: new RegExp(escapeRe(req.query.q), 'i') }, { client: new RegExp(escapeRe(req.query.q), 'i') }];
    if (req.query.from) q.endDate = { $gte: parseDate(req.query.from) };
    if (req.query.to) q.startDate = { $lte: parseDate(req.query.to, { endOfDay: true }) };
    const list = await Event.find(q).sort({ startDate: -1 }).populate('template', 'code name').lean();
    const c = await counts(list.map((e) => e._id));
    let items = list.map((e) => view(e, c));
    if (req.query.phase) items = items.filter((e) => e.phase === req.query.phase);
    res.json({ items });
  }),
);

eventsRouter.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['name', 'startDate', 'endDate']);
    const e = await Event.create(await normalise(req.body));
    res.status(201).json(view(await Event.findById(e._id).populate('template', 'code name').lean()));
  }),
);

eventsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const e = await Event.findById(oid(req.params.id)).populate('template', 'code name').lean();
    if (!e) throw httpError(404, 'Event not found');
    const [c, bookings, recent, abandoned] = await Promise.all([
      counts([e._id]),
      Booking.find({ event: e._id }).sort({ startDate: 1 }).populate('machine', 'machineId name').populate('template', 'code name').lean(),
      Session.find({ event: e._id }).sort({ createdAt: -1 }).limit(12).lean(),
      Session.countDocuments({ event: e._id, outcome: 'abandoned' }),
    ]);
    res.json({
      ...view(e, c),
      abandoned,
      bookings: bookings.map((b) => ({
        id: String(b._id),
        bookingId: b.bookingId,
        machine: b.machine ? { id: String(b.machine._id), machineId: b.machine.machineId, name: b.machine.name } : null,
        template: b.template ? { code: b.template.code, name: b.template.name } : null,
        startDate: b.startDate,
        endDate: b.endDate,
        shift: b.shift,
        status: b.status,
        amount: b.amount,
      })),
      recentSessions: recent.map((s) => ({
        sessionId: s.sessionId,
        createdAt: s.createdAt,
        outcome: s.outcome,
        printed: !!s.delivery?.printed,
        fortune: s.fortune,
        face: signedFileUrl(s.facePhotoPath),
        palm: signedFileUrl(s.palmEnhancedPath || s.palmPhotoPath),
      })),
    });
  }),
);

eventsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const existing = await Event.findById(id).lean();
    if (!existing) throw httpError(404, 'Event not found');
    await Event.updateOne({ _id: id }, { $set: await normalise(req.body, existing) }, { runValidators: true });
    const e = await Event.findById(id).populate('template', 'code name').lean();
    res.json(view(e, await counts([id])));
  }),
);

eventsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    if (await Session.exists({ event: id })) throw httpError(409, 'This event has readings. Cancel it instead (status: "cancelled").');
    await Booking.deleteMany({ event: id });
    const r = await Event.deleteOne({ _id: id });
    if (!r.deletedCount) throw httpError(404, 'Event not found');
    res.json({ ok: true });
  }),
);

export function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
}
