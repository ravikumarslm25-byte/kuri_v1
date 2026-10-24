import express from 'express';
import { config } from '../../config.js';
import { Booking, Machine, Session, Template } from '../../models/index.js';
import { activeAssignment } from '../../services/assignment.js';
import { ah, httpError, oid, pick, requireFields, istDay } from '../../services/http.js';
import { signedFileUrl } from '../../services/signedUrl.js';

export const machinesRouter = express.Router();

const EDITABLE = ['name', 'location', 'status'];

export function isOnline(m, now = Date.now()) {
  return !!m.lastHeartbeatAt && now - new Date(m.lastHeartbeatAt).getTime() < config.heartbeatStaleMs;
}

/** null/'' clears it; otherwise it must be an existing, non-archived template. */
async function cleanDefaultTemplate(body) {
  if (!body || !('defaultTemplate' in body)) return {};
  const v = body.defaultTemplate;
  if (v === null || v === '') return { defaultTemplate: null };
  const t = await Template.findById(oid(v)).lean();
  if (!t) throw httpError(400, 'Default template not found');
  if (t.status === 'archived') throw httpError(400, 'That template is archived');
  return { defaultTemplate: t._id };
}

const SOURCE_LABEL = { booking: 'booking', event: 'event', machine: 'machine default' };

function view(m, assignment) {
  const today = istDay(new Date());
  return {
    id: String(m._id),
    machineId: m.machineId,
    name: m.name,
    location: m.location,
    status: m.status,
    online: isOnline(m),
    registered: !!m.tokenHash,
    appVersion: m.appVersion,
    lastHeartbeatAt: m.lastHeartbeatAt || null,
    lastState: m.lastState,
    pendingUploads: m.pendingUploads || 0,
    hardware: m.hardware,
    readingsToday: m.counters?.readingsDate === today ? m.counters.readingsToday : 0,
    readingsTotal: m.counters?.readingsTotal || 0,
    currentEvent: assignment?.event ? { id: String(assignment.event._id), name: assignment.event.name } : null,
    defaultTemplate: m.defaultTemplate ? String(m.defaultTemplate) : null,
    // What the kiosk prints right now, and why.
    currentTemplate: assignment?.template
      ? {
          code: assignment.template.code,
          name: assignment.template.name,
          source: SOURCE_LABEL[assignment.templateSource] || 'event',
          customCard: !!(assignment.template.cardImageUrl && assignment.template.cardLayout),
          hasArtwork: !!assignment.template.cardImageUrl,
        }
      : null,
  };
}

/** GET /api/admin/machines -> { stats, items } */
machinesRouter.get(
  '/',
  ah(async (req, res) => {
    const machines = await Machine.find(req.query.status ? { status: req.query.status } : {})
      .select('+tokenHash')
      .sort({ machineId: 1 })
      .lean();
    const items = await Promise.all(machines.map(async (m) => view(m, await activeAssignment(m))));
    const count = (s) => items.filter((m) => m.status === s).length;
    res.json({
      stats: { total: items.length, active: count('active'), available: count('available'), maintenance: count('maintenance'), online: items.filter((m) => m.online).length },
      items,
    });
  }),
);

machinesRouter.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['machineId']);
    const machineId = String(req.body.machineId).trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(machineId)) throw httpError(400, 'machineId must be 3–32 chars: A–Z, 0–9, -');
    if (await Machine.exists({ machineId })) throw httpError(409, `${machineId} already exists`);
    const m = await Machine.create({ machineId, name: req.body.name || machineId, ...pick(req.body, ['location', 'status']), ...(await cleanDefaultTemplate(req.body)) });
    const o = m.toObject();
    res.status(201).json(view(o, await activeAssignment(o)));
  }),
);

machinesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const m = await Machine.findById(oid(req.params.id)).select('+tokenHash').lean();
    if (!m) throw httpError(404, 'Machine not found');
    const [assignment, recent, bookings] = await Promise.all([
      activeAssignment(m),
      Session.find({ machine: m._id }).sort({ createdAt: -1 }).limit(10).lean(),
      Booking.find({ machine: m._id, endDate: { $gte: new Date() }, status: { $ne: 'cancelled' } }).sort({ startDate: 1 }).limit(10).populate('event', 'name').lean(),
    ]);
    res.json({
      ...view(m, assignment),
      upcomingBookings: bookings.map((b) => ({ id: String(b._id), bookingId: b.bookingId, event: b.event?.name, startDate: b.startDate, endDate: b.endDate, status: b.status })),
      recentSessions: recent.map((s) => ({ sessionId: s.sessionId, createdAt: s.createdAt, outcome: s.outcome, printed: s.delivery?.printed, thumb: signedFileUrl(s.cardImagePath || s.palmEnhancedPath) })),
    });
  }),
);

machinesRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const r = await Machine.updateOne({ _id: id }, { $set: { ...pick(req.body, EDITABLE), ...(await cleanDefaultTemplate(req.body)) } }, { runValidators: true });
    if (!r.matchedCount) throw httpError(404, 'Machine not found');
    const m = await Machine.findById(id).select('+tokenHash').lean();
    res.json(view(m, await activeAssignment(m)));
  }),
);

/** Revoke the kiosk's token: it must be registered again with the provision key. */
machinesRouter.post(
  '/:id/revoke',
  ah(async (req, res) => {
    const r = await Machine.updateOne({ _id: oid(req.params.id) }, { $unset: { tokenHash: 1 } });
    if (!r.matchedCount) throw httpError(404, 'Machine not found');
    res.json({ ok: true });
  }),
);

machinesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    if (await Session.exists({ machine: id })) throw httpError(409, 'This machine has readings. Set its status to "retired" instead.');
    await Booking.deleteMany({ machine: id });
    const r = await Machine.deleteOne({ _id: id });
    if (!r.deletedCount) throw httpError(404, 'Machine not found');
    res.json({ ok: true });
  }),
);
