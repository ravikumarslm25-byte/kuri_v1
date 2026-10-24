import { Booking, Event, Template } from '../models/index.js';

/**
 * Which event (and template) is this machine serving right now?
 * 1. A CONFIRMED booking covering now (booking template overrides the event's).
 * 2. Otherwise an event that lists the machine directly (simple setups without bookings).
 * Template: booking's -> event's -> the machine's default template (Admin -> Machines).
 * `templateSource` says which one won, so the admin can show what the kiosk will print.
 */
export async function activeAssignment(machine, now = new Date()) {
  const a = await findAssignment(machine, now);
  if (a.template) return { ...a, templateSource: a.booking?.template ? 'booking' : 'event' };
  if (machine.defaultTemplate) {
    const t = await Template.findOne({ _id: machine.defaultTemplate, status: { $ne: 'archived' } }).lean();
    if (t) return { ...a, template: t, templateSource: 'machine' };
  }
  return { ...a, templateSource: null };
}

async function findAssignment(machine, now) {
  const booking = await Booking.findOne({
    machine: machine._id,
    status: 'confirmed',
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .sort({ startDate: -1 })
    .populate({ path: 'event', populate: { path: 'template' } })
    .populate('template')
    .lean();
  if (booking?.event && booking.event.status !== 'cancelled') {
    return { event: booking.event, template: booking.template || booking.event.template || null, booking };
  }

  const event = await Event.findOne({
    machines: machine._id,
    startDate: { $lte: now },
    endDate: { $gte: now },
    status: { $ne: 'cancelled' },
  })
    .sort({ startDate: -1 })
    .populate('template')
    .lean();
  return { event, template: event?.template || null, booking: null };
}
