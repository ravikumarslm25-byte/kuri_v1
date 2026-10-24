import express from 'express';
import { requirePerm } from '../../middleware/adminAuth.js';
import { Machine, Session } from '../../models/index.js';
import { report } from '../../services/analytics.js';
import { activeAssignment } from '../../services/assignment.js';
import { ah, oid, parseDate, toCsv } from '../../services/http.js';
import { signedFileUrl } from '../../services/signedUrl.js';
import { isOnline } from './machines.js';

export const insightsRouter = express.Router();

/** GET /api/admin/dashboard — the landing page in one call. */
insightsRouter.get(
  '/dashboard',
  requirePerm('dashboard'),
  ah(async (req, res) => {
    const now = new Date();
    const [r30, machines, recent] = await Promise.all([
      report({ from: new Date(now.getTime() - 29 * 86_400_000), to: now }),
      Machine.find().lean(),
      Session.find({ outcome: 'completed' }).sort({ createdAt: -1 }).limit(8).populate('event', 'name').populate('machine', 'machineId').lean(),
    ]);
    const live = await Promise.all(
      machines.filter((m) => m.status !== 'retired').map(async (m) => {
        const a = await activeAssignment(m, now);
        return { machineId: m.machineId, name: m.name, status: m.status, online: isOnline(m), lastState: m.lastState, event: a.event?.name || null };
      }),
    );
    const fleet = live.length;
    const online = live.filter((m) => m.online).length;
    res.json({
      kpis: {
        readings30d: r30.totals.readings,
        readingsChangePct: r30.change.readingsPct,
        machinesOnline: online,
        machinesTotal: fleet,
        utilizationPct: fleet ? Math.round((live.filter((m) => m.event).length / fleet) * 100) : 0,
        revenue30d: r30.totals.revenue,
        revenueChangePct: r30.change.revenuePct,
        completionRate: r30.totals.completionRate,
        printed30d: r30.totals.printed,
      },
      systemsOnline: fleet > 0 && online === live.filter((m) => m.status === 'active').length,
      weekly: r30.daily.slice(-7),
      delivery: { print: r30.totals.printed, whatsapp: r30.totals.whatsapp, email: r30.totals.email },
      topEvents: r30.byEvent.filter((e) => e.id !== 'none').slice(0, 5),
      machines: live,
      recentReadings: recent.map((s) => ({
        sessionId: s.sessionId,
        createdAt: s.createdAt,
        event: s.event?.name || null,
        machineId: s.machine?.machineId || null,
        thumb: signedFileUrl(s.cardImagePath || s.palmEnhancedPath),
      })),
    });
  }),
);

function reportParams(q) {
  return {
    from: q.from ? parseDate(q.from) : undefined,
    to: q.to ? parseDate(q.to, { endOfDay: true }) : undefined,
    event: q.event ? oid(q.event, 'event') : undefined,
    machine: q.machine ? oid(q.machine, 'machine') : undefined,
    template: q.template ? oid(q.template, 'template') : undefined,
  };
}

/** GET /api/admin/reports?from=YYYY-MM-DD&to=&event=&machine=&template= */
insightsRouter.get(
  '/reports',
  requirePerm('reports'),
  ah(async (req, res) => res.json(await report(reportParams(req.query)))),
);

/** GET /api/admin/reports/export.csv — daily readings + breakdowns. */
insightsRouter.get(
  '/reports/export.csv',
  requirePerm('reports'),
  ah(async (req, res) => {
    const r = await report(reportParams(req.query));
    const rows = [
      ...r.daily.map((d) => ({ section: 'Daily', key: d.date, readings: d.readings, printed: '' })),
      ...r.byEvent.map((e) => ({ section: 'Event', key: e.name, readings: e.readings, printed: e.printed })),
      ...r.byMachine.map((e) => ({ section: 'Machine', key: e.name, readings: e.readings, printed: e.printed })),
      ...r.byTemplate.map((e) => ({ section: 'Template', key: e.name, readings: e.readings, printed: e.printed })),
    ];
    res.type('text/csv').attachment('kuri-report.csv').send(
      toCsv(rows, [
        { label: 'Section', value: (x) => x.section },
        { label: 'Item', value: (x) => x.key },
        { label: 'Readings', value: (x) => x.readings },
        { label: 'Printed', value: (x) => x.printed },
      ]),
    );
  }),
);
