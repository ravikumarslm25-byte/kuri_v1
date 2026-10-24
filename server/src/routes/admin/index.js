import express from 'express';
import { requireAdmin, requirePerm } from '../../middleware/adminAuth.js';
import { authRouter } from './auth.js';
import { machinesRouter } from './machines.js';
import { templatesRouter } from './templates.js';
import { eventsRouter } from './events.js';
import { bookingsRouter } from './bookings.js';
import { sessionsRouter } from './sessions.js';
import { teamRouter } from './team.js';
import { insightsRouter } from './insights.js';
import { Event, Machine, Template } from '../../models/index.js';
import { ah } from '../../services/http.js';

/** /api/admin — everything except /auth/login needs an admin JWT; each module needs its permission. */
export const adminRouter = express.Router();

adminRouter.use('/auth', authRouter);
adminRouter.use(requireAdmin);
adminRouter.use('/machines', requirePerm('machines'), machinesRouter);
adminRouter.use('/templates', requirePerm('templates'), templatesRouter);
adminRouter.use('/events', requirePerm('events'), eventsRouter);
adminRouter.use('/bookings', requirePerm('bookings'), bookingsRouter);
adminRouter.use('/sessions', requirePerm('sessions'), sessionsRouter);
adminRouter.use('/team', requirePerm('team'), teamRouter);
adminRouter.use('/', insightsRouter); // /dashboard, /reports (own permission checks)

/** Lists for dropdowns (event / machine / template pickers) available to any signed-in admin. */
adminRouter.get(
  '/lookups',
  ah(async (req, res) => {
    const [events, machines, templates] = await Promise.all([
      Event.find({ status: { $ne: 'cancelled' } }).select('name startDate endDate').sort({ startDate: -1 }).limit(500).lean(),
      Machine.find({ status: { $ne: 'retired' } }).select('machineId name').sort({ machineId: 1 }).lean(),
      Template.find({ status: { $ne: 'archived' } }).select('code name').sort({ code: 1 }).lean(),
    ]);
    res.json({
      events: events.map((e) => ({ id: String(e._id), name: e.name, startDate: e.startDate, endDate: e.endDate })),
      machines: machines.map((m) => ({ id: String(m._id), machineId: m.machineId, name: m.name })),
      templates: templates.map((t) => ({ id: String(t._id), code: t.code, name: t.name })),
    });
  }),
);
