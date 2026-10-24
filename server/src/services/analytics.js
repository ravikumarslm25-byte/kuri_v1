import { Booking, Event, Machine, Session, Template } from '../models/index.js';
import { istDay, istHour, parseDate } from './http.js';

/**
 * Report numbers for a date range. Aggregates in JS over a slim projection: simple, portable
 * across MongoDB versions, and fast for event-scale volumes (tens of thousands of readings).
 */
export async function report({ from, to, event, machine, template } = {}) {
  const now = new Date();
  const end = to || now;
  const start = from || new Date(end.getTime() - 29 * 86_400_000);
  const span = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - span - 1);
  const prevEnd = new Date(start.getTime() - 1);

  const scope = {};
  if (event) scope.event = event;
  if (machine) scope.machine = machine;
  if (template) scope.template = template;

  const fields = 'createdAt outcome event machine template language fortuneSource delivery startedAt completedAt abandonedAt';
  const [cur, prevCount, bookings, prevBookings] = await Promise.all([
    Session.find({ ...scope, createdAt: { $gte: start, $lte: end } }).select(fields).lean(),
    Session.countDocuments({ ...scope, outcome: 'completed', createdAt: { $gte: prevStart, $lte: prevEnd } }),
    revenueBookings(start, end, { event, machine }),
    revenueBookings(prevStart, prevEnd, { event, machine }),
  ]);

  const done = cur.filter((s) => s.outcome === 'completed');
  const abandoned = cur.length - done.length;
  const revenue = bookings.reduce((a, b) => a + (b.amount || 0), 0);
  const prevRevenue = prevBookings.reduce((a, b) => a + (b.amount || 0), 0);
  const durations = done.filter((s) => s.startedAt && s.completedAt).map((s) => (new Date(s.completedAt) - new Date(s.startedAt)) / 1000);

  // daily series (every day in range, zero-filled)
  const daily = new Map();
  for (let d = parseDate(istDay(start)); d <= end; d = new Date(d.getTime() + 86_400_000)) daily.set(istDay(d), 0);
  for (const s of done) {
    const k = istDay(new Date(s.createdAt));
    daily.set(k, (daily.get(k) || 0) + 1);
  }
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, readings: 0 }));
  for (const s of done) byHour[istHour(new Date(s.createdAt))].readings++;

  const group = async (key, Model, label) => {
    const m = new Map();
    for (const s of cur) {
      const id = s[key] ? String(s[key]) : 'none';
      const r = m.get(id) || { id, readings: 0, printed: 0, abandoned: 0 };
      if (s.outcome === 'completed') r.readings++;
      else r.abandoned++;
      if (s.delivery?.printed) r.printed++;
      m.set(id, r);
    }
    const ids = [...m.keys()].filter((k) => k !== 'none');
    const docs = await Model.find({ _id: { $in: ids } }).lean();
    const names = new Map(docs.map((d) => [String(d._id), label(d)]));
    return [...m.values()].map((r) => ({ ...r, name: names.get(r.id) || '(none)' })).sort((a, b) => b.readings - a.readings);
  };

  const [byEvent, byMachine, byTemplate] = await Promise.all([
    group('event', Event, (d) => d.name),
    group('machine', Machine, (d) => d.machineId),
    group('template', Template, (d) => d.name),
  ]);

  const count = (fn) => done.filter(fn).length;
  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);

  return {
    range: { from: start, to: end },
    totals: {
      readings: done.length,
      abandoned,
      completionRate: cur.length ? Math.round((done.length / cur.length) * 1000) / 10 : null,
      printed: count((s) => s.delivery?.printed),
      whatsapp: count((s) => s.delivery?.whatsapp),
      email: count((s) => s.delivery?.email),
      aiShare: done.length ? Math.round((count((s) => s.fortuneSource === 'ai') / done.length) * 1000) / 10 : null,
      avgDurationSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      revenue,
    },
    change: { readingsPct: pct(done.length, prevCount), revenuePct: pct(revenue, prevRevenue) },
    daily: [...daily.entries()].map(([date, readings]) => ({ date, readings })),
    byHour,
    byEvent,
    byMachine,
    byTemplate,
    byLanguage: ['en', 'ta'].map((l) => ({ language: l, readings: count((s) => (s.language || 'en') === l) })),
    abandonedAt: Object.entries(
      cur.filter((s) => s.outcome === 'abandoned').reduce((a, s) => ({ ...a, [s.abandonedAt || 'unknown']: (a[s.abandonedAt || 'unknown'] || 0) + 1 }), {}),
    ).map(([step, n]) => ({ step, count: n })),
  };
}

/** Confirmed bookings whose start date falls in the range (revenue is counted when the booking starts). */
function revenueBookings(start, end, { event, machine }) {
  const q = { status: 'confirmed', startDate: { $gte: start, $lte: end } };
  if (event) q.event = event;
  if (machine) q.machine = machine;
  return Booking.find(q).select('amount').lean();
}
