import express from 'express';
import { Booking, Event, Machine, Template, nextId } from '../../models/index.js';
import { ah, httpError, oid, parseDate, pick, requireFields, toCsv } from '../../services/http.js';
import { escapeRe } from './events.js';

export const bookingsRouter = express.Router();

const populate = (q) => q.populate('event', 'name client venue startDate endDate').populate('machine', 'machineId name').populate('template', 'code name');

const view = (b) => ({
  id: String(b._id),
  bookingId: b.bookingId,
  event: b.event ? { id: String(b.event._id), name: b.event.name, client: b.event.client, venue: b.event.venue } : null,
  machine: b.machine ? { id: String(b.machine._id), machineId: b.machine.machineId, name: b.machine.name } : null,
  template: b.template ? { id: String(b.template._id), code: b.template.code, name: b.template.name } : null,
  startDate: b.startDate,
  endDate: b.endDate,
  shift: b.shift,
  status: b.status,
  amount: b.amount,
  notes: b.notes,
});

/**
 * Validates a booking and rejects a machine being double-booked
 * (overlapping pending/confirmed bookings on the same machine).
 */
async function normalise(body, existing) {
  const b = pick(body, ['shift', 'status', 'amount', 'notes']);
  const eventId = body.event !== undefined ? oid(body.event, 'event') : existing?.event;
  const machineId = body.machine !== undefined ? oid(body.machine, 'machine') : existing?.machine;
  const event = await Event.findById(eventId).lean();
  if (!event) throw httpError(400, 'Event not found');
  if (!(await Machine.exists({ _id: machineId }))) throw httpError(400, 'Machine not found');
  b.event = event._id;
  b.machine = machineId;
  b.startDate = body.startDate !== undefined ? parseDate(body.startDate) : existing?.startDate || event.startDate;
  b.endDate = body.endDate !== undefined ? parseDate(body.endDate, { endOfDay: true }) : existing?.endDate || event.endDate;
  if (b.endDate < b.startDate) throw httpError(400, 'endDate is before startDate');
  if (b.startDate < event.startDate || b.endDate > event.endDate) throw httpError(400, 'Booking dates must fall within the event dates');
  if (body.template !== undefined) {
    if (!body.template) b.template = null;
    else {
      const t = await Template.findById(oid(body.template, 'template')).lean();
      if (!t) throw httpError(400, 'Template not found');
      b.template = t._id;
    }
  }
  if (b.amount !== undefined && (typeof b.amount !== 'number' || b.amount < 0)) throw httpError(400, 'amount must be a positive number (INR)');

  const status = b.status ?? existing?.status ?? 'pending';
  if (status !== 'cancelled') {
    const clash = await Booking.findOne({
      _id: { $ne: existing?._id },
      machine: machineId,
      status: { $ne: 'cancelled' },
      startDate: { $lte: b.endDate },
      endDate: { $gte: b.startDate },
    })
      .populate('event', 'name')
      .lean();
    if (clash) throw httpError(409, `Machine already booked for "${clash.event?.name}" (${clash.bookingId}) on overlapping dates`);
  }
  return b;
}

function listQuery(q) {
  const f = {};
  if (q.status) f.status = q.status;
  if (q.event) f.event = oid(q.event, 'event');
  if (q.machine) f.machine = oid(q.machine, 'machine');
  if (q.from) f.endDate = { $gte: parseDate(q.from) };
  if (q.to) f.startDate = { $lte: parseDate(q.to, { endOfDay: true }) };
  return f;
}

bookingsRouter.get(
  '/',
  ah(async (req, res) => {
    let items = (await populate(Booking.find(listQuery(req.query)).sort({ startDate: -1 })).lean()).map(view);
    if (req.query.q) {
      const re = new RegExp(escapeRe(req.query.q), 'i');
      items = items.filter((b) => re.test(b.bookingId) || re.test(b.event?.name || '') || re.test(b.event?.client || '') || re.test(b.machine?.machineId || ''));
    }
    res.json({ items });
  }),
);

bookingsRouter.get(
  '/export.csv',
  ah(async (req, res) => {
    const items = (await populate(Booking.find(listQuery(req.query)).sort({ startDate: -1 })).lean()).map(view);
    res.type('text/csv').attachment('kuri-bookings.csv').send(
      toCsv(items, [
        { label: 'Booking ID', value: (b) => b.bookingId },
        { label: 'Event', value: (b) => b.event?.name },
        { label: 'Client', value: (b) => b.event?.client },
        { label: 'Venue', value: (b) => b.event?.venue },
        { label: 'Machine', value: (b) => b.machine?.machineId },
        { label: 'Template', value: (b) => b.template?.name },
        { label: 'Start', value: (b) => b.startDate },
        { label: 'End', value: (b) => b.endDate },
        { label: 'Shift', value: (b) => b.shift },
        { label: 'Status', value: (b) => b.status },
        { label: 'Amount (INR)', value: (b) => b.amount },
      ]),
    );
  }),
);

bookingsRouter.post(
  '/',
  ah(async (req, res) => {
    requireFields(req.body, ['event', 'machine']);
    const data = await normalise(req.body);
    const b = await Booking.create({ bookingId: await nextId('BKG'), ...data });
    res.status(201).json(view(await populate(Booking.findById(b._id)).lean()));
  }),
);

bookingsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const b = await populate(Booking.findById(oid(req.params.id))).lean();
    if (!b) throw httpError(404, 'Booking not found');
    res.json(view(b));
  }),
);

bookingsRouter.patch(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const existing = await Booking.findById(id).lean();
    if (!existing) throw httpError(404, 'Booking not found');
    await Booking.updateOne({ _id: id }, { $set: await normalise(req.body, existing) }, { runValidators: true });
    res.json(view(await populate(Booking.findById(id)).lean()));
  }),
);

bookingsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const id = oid(req.params.id);
    const b = await Booking.findById(id).lean();
    if (!b) throw httpError(404, 'Booking not found');
    if (b.status === 'confirmed') throw httpError(409, 'Cancel a confirmed booking (status: "cancelled") instead of deleting it');
    await Booking.deleteOne({ _id: id });
    res.json({ ok: true });
  }),
);
