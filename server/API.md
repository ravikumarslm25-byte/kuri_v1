# Kuri API reference

Base URL: `https://<server>/api`. JSON in and out. Dates are ISO strings; filters also accept `YYYY-MM-DD` (read as IST; a bare `to` date includes the whole day).
Errors: `{ "error": "message" }` with 400 (bad input), 401 (not signed in), 403 (no permission), 404, 409 (conflict / in use), 413, 429.

## Auth

| | |
|---|---|
| `POST /admin/auth/login` | `{ email, password }` → `{ token, user }`. 8 failed tries per 15 min → 429 |
| `GET /admin/auth/me` | `{ user }` |
| `POST /admin/auth/change-password` | `{ current, next }` → `{ token }` (other devices signed out) |
| `POST /admin/auth/logout-all` | Invalidate all tokens for this user |

Send `Authorization: Bearer <token>` on every other admin call. Tokens last 12 h (`ADMIN_JWT_TTL`).

`user.permissions` decides which sidebar items to show: `dashboard, events, bookings, machines, templates, sessions, team, reports`.
Roles and their default permissions:

| Role | Permissions |
|---|---|
| `super_admin` | all |
| `event_manager` | dashboard, events, bookings, reports, sessions |
| `operations_manager` | dashboard, machines, events, bookings, templates |
| `support` | dashboard, machines, sessions |

A team member's `permissions` can be customised per person (Team → Edit).

## Dashboard & reports

| | |
|---|---|
| `GET /admin/dashboard` | `kpis` (readings30d, readingsChangePct, machinesOnline/Total, utilizationPct, revenue30d, revenueChangePct, completionRate, printed30d), `systemsOnline`, `weekly[7]`, `delivery`, `topEvents`, `machines` (live status), `recentReadings` |
| `GET /admin/reports?from&to&event&machine&template` | `totals` (readings, abandoned, completionRate, printed, whatsapp, email, aiShare, avgDurationSec, revenue), `change` vs previous period, `daily[]`, `byHour[24]`, `byEvent`, `byMachine`, `byTemplate`, `byLanguage`, `abandonedAt` (which screen guests walked away from). Default range: last 30 days |
| `GET /admin/reports/export.csv` | same filters |

Revenue = sum of `amount` on **confirmed** bookings whose start date falls in the range.

## Machines (`machines`)

| | |
|---|---|
| `GET /admin/machines?status=` | `{ stats: { total, active, available, maintenance, online }, items[] }` |
| `POST /admin/machines` | `{ machineId, name?, location?, status? }` (status: available · active · maintenance · retired) |
| `GET /admin/machines/:id` | + `upcomingBookings`, `recentSessions` |
| `PATCH /admin/machines/:id` | `{ name?, location?, status? }` |
| `POST /admin/machines/:id/revoke` | Kiosk must register again with the provision key |
| `DELETE /admin/machines/:id` | 409 if it has readings → retire instead |

Item: `id, machineId, name, location, status, online, registered, appVersion, lastHeartbeatAt, lastState, hardware, readingsToday, readingsTotal, currentEvent, currentTemplate`.
`online` = heartbeat in the last 90 s.

## Events (`events`)

| | |
|---|---|
| `GET /admin/events?phase=upcoming\|live\|completed\|cancelled&q=&from=&to=` | `{ items[] }` |
| `POST /admin/events` | `{ name, startDate, endDate, client?, venue?, template?, language? (en · ta · en+ta), deliveryOptions?, branding? { cardFooter }, expectedAttendees?, contact? { name, phone } }` |
| `GET /admin/events/:id` | + `bookings[]`, `recentSessions[]` (signed image URLs), `abandoned` |
| `PATCH /admin/events/:id` | any field above; `status: "cancelled"` to cancel, `"upcoming"` to restore |
| `DELETE /admin/events/:id` | 409 if it has readings → cancel instead |

`phase` is computed from the dates. `scans` = completed readings. `machineCount` = machines with active bookings.

## Bookings (`bookings`)

| | |
|---|---|
| `GET /admin/bookings?status&event&machine&from&to&q` | `{ items[] }` |
| `GET /admin/bookings/export.csv` | |
| `POST /admin/bookings` | `{ event, machine, startDate?, endDate? (default = event dates), shift? (full · morning · evening), template? (overrides event template), status? (pending · confirmed · cancelled), amount? (INR), notes? }` |
| `PATCH /admin/bookings/:id` | |
| `DELETE /admin/bookings/:id` | only pending/cancelled; cancel confirmed ones |

Rules: dates must sit inside the event; a machine can't have two overlapping pending/confirmed bookings (409 names the clash).
**A kiosk serves the event of its confirmed booking covering "now"** (template: booking's, else event's).

## Templates (`templates`)

| | |
|---|---|
| `GET /admin/templates` | `{ stats: { total, active, drafts, totalUsage }, items[] }` |
| `POST /admin/templates` | `{ name, theme? (general · love · career · wealth · health), status? (active · draft · archived), promptHint?, fallbackFortunes?[] }` → code auto `TMPL-00N` |
| `PATCH /admin/templates/:id` | any of name, status, theme, promptHint, fallbackFortunes, `cardLayout` (see below; `null` = standard card) |
| `PUT /admin/templates/:id/card` | `{ image: dataURL }` 4x6 artwork, ideally 1200x1800 px, ≤ 8 MB |
| `DELETE /admin/templates/:id/card` | |
| `DELETE /admin/templates/:id` | 409 if used → archive |
| `GET /public/templates/:code/card` | public image (used by kiosks) |

**Machines:** `POST/PATCH /admin/machines/:id` also take `defaultTemplate` (template id or `null`): the template a kiosk uses when no confirmed booking/event gives it one. Machine views include `defaultTemplate` and `currentTemplate { code, name, source: booking|event|machine default, customCard, hasArtwork }`.

**`cardLayout`** — where the kiosk prints on the client's artwork. Pixels on the 1200 × 1800 card (4×6" at 300 dpi). Values are clamped into the card; unknown values fall back to defaults.
```json
{
  "face":    { "x": 368, "y": 328, "w": 464, "h": 464, "enabled": true, "shape": "circle", "borderColor": "#dcb15c", "borderWidth": 0 },
  "palm":    { "x": 110, "y": 880, "w": 440, "h": 440, "enabled": true, "shape": "rounded", "borderColor": "#dcb15c", "borderWidth": 0 },
  "fortune": { "x": 626, "y": 896, "w": 452, "h": 408, "color": "#5b0f1a", "font": "Marcellus", "align": "center", "maxSize": 56 },
  "meta":    { "x": 250, "y": 1432, "w": 700, "h": 56, "enabled": true, "color": "#e2b857", "font": "Marcellus", "align": "center", "maxSize": 34 }
}
```
shape: `rect | rounded | circle` · font: `Marcellus | Poppins | Berkshire Swash` (Tamil fortunes always use Noto Serif Tamil) · align: `left | center | right` · maxSize 16–160 (text shrinks to fit, down to 18) · the fortune box is always on and at least 200 × 120. The kiosk config's `template` carries `cardLayout` (only when the template has artwork) and a versioned `cardImageUrl` (`?v=`).

`promptHint` is added to the AI prompt (e.g. "Mention new beginnings; this is a wedding expo").

## Readings (`sessions`) — the "Users" page

The kiosk collects no names. Phone/email exist only if the guest chose WhatsApp/email delivery.

| | |
|---|---|
| `GET /admin/sessions?page&limit&event&machine&outcome&printed=true&from&to&q` | `{ page, limit, total, items[] }`; `q` matches reading ID, phone, email |
| `GET /admin/sessions/stats` | `{ total, thisMonth, today, withContact, abandoned }` |
| `GET /admin/sessions/export.csv` | same filters, no images |
| `GET /admin/sessions/:sessionId` | + `fortune`, `images { face, palm, palmEnhanced, card }` |
| `DELETE /admin/sessions/:sessionId` | erase reading + images (right to erasure) |

Image URLs are **signed and expire in 15 min** (`/api/files/...?exp&sig`), so use them directly in `<img src>`; refetch the list to refresh.
Photos and contacts are erased automatically after `DATA_RETENTION_DAYS` (default 90); the reading stays for reports (`photosErased: true`).

## Team (`team`)

| | |
|---|---|
| `GET /admin/team` | `{ stats, roles, permissions, items[] }` |
| `POST /admin/team` | `{ name, email, phone?, role, permissions?, password? }` → `{ user, tempPassword? }` (shown once) |
| `PATCH /admin/team/:id` | `{ name?, phone?, role?, permissions?, status? (active · disabled) }` — disabling signs them out |
| `POST /admin/team/:id/reset-password` | → `{ tempPassword }` |
| `DELETE /admin/team/:id` | |

Guards: you can't disable/remove/demote yourself; at least one active super admin must remain; only super admins manage super admins.

## Lookups

`GET /admin/lookups` → `{ events, machines, templates }` for dropdowns (any signed-in admin).

## Kiosk API

See README → "Kiosk API". Kiosks use their own bearer token from `/kiosk/register`.
