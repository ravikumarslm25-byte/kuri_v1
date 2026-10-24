# Kuri — The Digital Oracle

Palm-reading fortune kiosk for events (HackGeniX). Monorepo:

| Folder | What | Stack |
|---|---|---|
| `server/` | API for kiosks and the admin panel (see `server/API.md`) | Node 20+, Express 4, MongoDB (Mongoose 8), Gemini |
| `kiosk/` | Portrait touch-screen app (1080×1920 design stage) | React 19, Vite, TypeScript, motion |
| `admin/` | Admin panel (the Figma admin design, wired to the API) | React 18, Vite, Tailwind 4, Radix UI, Recharts |
| `deploy/windows/` | Kiosk PC setup: Chrome kiosk launcher, DNP printer setup | Windows 10/11 |
| `deploy/aws/` | One-server deployment guide (EC2 + Docker + HTTPS), backups | Docker Compose, Caddy |
| `tools/` | `make_standin_plates.py`: builds the temporary 9:16 backgrounds | Python 3, OpenCV |

## Run locally

```bash
# 1. API
cd server
cp .env.example .env          # set KIOSK_PROVISION_KEY; GEMINI_API_KEY optional
npm install
npm run seed -- --fresh       # dev data: templates, 4 machines, events, bookings, 480 sample readings
                              # dev admin: admin@kuri.dev / KuriDev2026
npm run dev                   # http://localhost:5010/api/health
npm run create-admin -- ravi@hackgenix.com '<password>' Ravi   # real super admin (production)

# 2. Kiosk
cd ../kiosk
npm install
npm run dev                   # http://localhost:5173

# 3. Admin panel
cd ../admin
npm install
npm run dev                   # http://localhost:5174  (VITE_API_URL defaults to http://localhost:5010)
```

## Production: one app

In production everything is **one app on one port**: the server also serves the built admin panel at `/admin/` and the kiosk app at `/`, so one domain does it all (`/api`, `/admin/`, `/`) and no CORS setup is needed.

```bash
npm run install:all      # server + kiosk + admin dependencies
npm run build            # builds kiosk/dist and admin/dist (admin built for /admin/)
NODE_ENV=production npm start   # http://localhost:5010/  (kiosk) · /admin/ · /api/health
```

Both apps default to the server they are loaded from (`VITE_API_URL` only needed to point elsewhere). `SERVE_WEB=false` turns the web apps off; `WEB_ADMIN_DIR` / `WEB_KIOSK_DIR` move them.

**AWS (one EC2 instance, Docker, automatic HTTPS): see [`deploy/aws/README.md`](deploy/aws/README.md).** `Dockerfile` + `docker-compose.yml` (app + MongoDB 7 + Caddy) at the repo root; `deploy/aws/backup.sh` for daily backups.

First run on a kiosk: tap the **top-left corner 5×** on the Idle screen → Setup → enter API URL, Machine ID (`KURI-001`) and the provision key → **Register machine** → pick face/palm cameras by name → **Save & close**.

Without registration, or with the server unreachable, the kiosk still works end-to-end using on-device fallback fortunes, and **every reading is kept on the kiosk** until it can be uploaded (see Offline sync).

Dev shortcut: copy `kiosk/.env.development.example` to `kiosk/.env.development.local` and `npm run dev` registers the kiosk with your local server automatically (dev builds only).

Design review shortcuts (dev builds only): `/?step=result&demo=1`, `/?step=reading&demo=1`, `/?step=printing&demo=1`.

## Tests

```bash
cd kiosk && npm test           # palm-analysis (13) + card-layout (3) unit tests
cd server
TEST_MONGO_URI=mongodb://127.0.0.1:27017/kuri_test npm test   # 26 integration tests + 3 web-serving tests (kiosk + admin), needs a MongoDB
```

## Kiosk API (`/api/kiosk`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/register` | provision key | Register machine, returns bearer token (re-register rotates it) |
| GET | `/config` | token | Current event + template for this machine |
| POST | `/heartbeat` | token | Every 30 s: screen state, app version, hardware |
| POST | `/fortune` | token | Palm image → Gemini fortune (server-side key); offline fallback on any failure |
| POST | `/sessions` | token | Upload a reading (idempotent on `sessionId`); images saved only with consent |

## Palm AI (Stages B + C)

`kiosk/src/lib/hand/` and `kiosk/src/lib/palm/`

1. **Detect** — MediaPipe HandLandmarker (21 landmarks) runs in the browser at ~15 fps on the palm camera. Model + WASM ship in `public/mediapipe/` (no internet needed). GPU first, CPU fallback; force CPU with `localStorage['kuri.hand.delegate']='CPU'`.
2. **Check** (`analyze.ts`, unit-tested on real MediaPipe output) — one hand · palm (not back) facing camera · ≥3 fingers open · hand fills 42–97% of the square · centred · fully in frame. The guest sees a live gold hand skeleton and a plain-language prompt for whatever is wrong.
3. **Auto-capture** — after 1.3 s of a good, still palm. A manual "Read My Palm" button appears after 12 s as a fallback.
4. **Enhance** (`enhance.ts`) — rotate upright, crop to the hand, CLAHE on luminance + unsharp mask (skin colour preserved).
5. **Destiny lines** — heart / head / life / fate lines placed from hand landmarks (palmistry positions), then each snapped onto the nearest real crease; drawn as tapered gold strokes. The clean enhanced palm goes to Gemini; the gold-lined version goes on screen and on the card.

Setup → "Reject the back of the hand" can be switched off on site if it ever misfires.

### Scanner box requirements (from testing)

- The palm camera must see the **whole hand, wrist to fingertips, with margin**. A close-up of part of the palm is not detected (tested). With a Brio at 1080p, plan for the camera ~30–40 cm from the glass, or use its 90° FOV setting.
- **Matte black interior** behind/around the hand. A bright background shows up as a white square inside the reading sphere.
- Even, diffuse light (ring light behind a diffuser). Hard light washes out the creases the line-snapping relies on.
- Camera should not mirror the image (Brio default). If a camera does mirror, palm/back detection will invert — switch the check off in Setup.

`hand_landmarker.task` is Google's official MediaPipe model (Apache-2.0). On a normal network it can be re-downloaded from
`https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.

## Printing (Stage E)

`kiosk/src/lib/print/`. The keepsake card is drawn on a 1200×1800 canvas (4×6" at 300 dpi): Kuri header, seeker photo, gold-lined palm, fortune (auto-fits, Tamil supported), reading ID, date and event footer. If the event's template has card artwork (Admin → Templates → upload), it's used as the background.

**Client-designed cards (Templates → card layout).** The client designs the whole 4×6" card (1200×1800 px, portrait) with empty spaces for the face photo, the palm photo and the fortune. In Admin → Templates → Edit → upload the artwork; the layout editor opens. Drag/resize the boxes onto those spaces (snapping, trim line, arrow-key nudge, exact px fields), pick photo shape (square / rounded / circle) and border, and the fortune's font, colour, alignment and largest size; an optional "Reading ID & date" line can be switched on. Preview with sample photos and the typical / longest / Tamil fortune, then **Save layout**. Kiosks print it from their next reading.
- **Which template a kiosk prints:** its confirmed booking's template → else the booked event's template → else the machine's **Default card template** (Admin → Machines → Manage). No template at all = standard Kuri card. Each machine card in Admin → Machines shows "Prints: …" with the reason, and the kiosk's Setup screen shows "Card: …" (Test connection refreshes it). Changes reach the kiosk within 30 s (heartbeat).
- With artwork **and** a layout, the card is exactly the client's design. Artwork without a layout keeps the old behaviour (standard Kuri card drawn on top).
- One renderer: `kiosk/src/lib/print/cardLayout.ts` draws the card on the kiosk; an identical copy (`admin/src/app/lib/cardLayout.ts`) draws the admin preview, so preview = print. After editing it run `node tools/sync-card-layout.mjs` (a kiosk test fails if the copies differ).
- The fortune shrinks (down to 18 px) until it fits its box; past that the last line ends with "…". Tamil always uses Noto Serif Tamil.
- The kiosk keeps the artwork in its browser cache (`lib/print/artCache.ts`), so cards still print with the client's design when the Wi-Fi drops. If the artwork was never downloaded, the standard card is printed.
The same image is shown sliding out on screen, printed, and uploaded, so screen = print = admin record. Printing uses `@page { size: 4in 6in; margin: 0 }`; verified by rendering to PDF (288×432 pt).
With Chrome `--kiosk-printing` the card goes straight to the Windows default printer. Setup steps: `deploy/windows/README.md`.

## Admin backend (Step 3a)

`server/src/routes/admin/`, full reference in **`server/API.md`**.
- JWT login (scrypt password hashes, login rate limit, sign-out-everywhere), roles + per-person module permissions.
- **Bookings drive the kiosks**: a machine serves the event of its confirmed booking covering "now"; double-booking a machine is rejected.
- Guest images are never public: the admin gets 15-minute signed URLs. Readings can be erased on request; photos and contacts auto-erase after `DATA_RETENTION_DAYS` (default 90).
- Dashboard + reports (completion rate, where guests walk away, AI vs fallback share, by event / machine / template / hour / language, revenue from confirmed bookings) + CSV exports.

## Admin panel (Step 3b)

`admin/src/app/`. Built from the Figma admin export (same sidebar, colours, cards and components), every screen on live API data:
- **Login** + change password + sign out. Sidebar and routes show only the modules the person has permission for.
- **Dashboard**: 30-day readings / machines online / revenue / completion rate, 7-day trend, delivery split, fleet status, top events, latest printed cards.
- **Events**: calendar + list (live / upcoming / past / cancelled), create/edit (dates, venue, template, kiosk language, card footer, contact, print on/off), detail with bookings and recent readings, cancel/restore/delete.
- **Bookings**: search + filters + CSV export, create/edit with the event's dates pre-filled; double-booking shows the clash.
- **Machines**: fleet stats and cards (online, registered, readings today/total, current event), add, edit, disconnect a lost kiosk, delete.
- **Templates**: theme, AI instruction, offline fortunes, 4×6 card artwork upload with preview.
- **Readings** (was "Users"): search by reading ID / phone / email, filters, pages, CSV export; detail shows photos, enhanced palm, printed card and fortune; erase on request.
- **Team**: roles + per-person access checkboxes, temporary passwords shown once, reset, disable, remove.
- **Reports**: date range + event / machine / template filters, KPIs vs previous period, daily trend, busiest hours, per-event/machine/template tables, where guests walked away, AI share, CSV export.

Changed from the Figma mock-up on purpose: "Avg Satisfaction" became **Completion Rate** (the kiosk collects no rating), and "Users" became **Readings** (the kiosk collects no names).

## Offline sync (Stage F)

`kiosk/src/lib/outbox.ts`. Each reading (photos, palm, printed card, fortune) is written to IndexedDB on the kiosk **first**, then uploaded. If the kiosk isn't registered yet, the Wi-Fi is down or the server is unreachable, readings wait and are sent oldest-first with backoff (30 s → 30 min), on reconnect, after registration, and every minute. A power cut doesn't lose them.
- The server files a late reading under the event that was booked **when it was taken** and on that day in reports.
- Idle screen: a small staff dot bottom-right (green synced · amber offline / waiting, with count · red not registered).
- Setup screen → Sync: connection, readings waiting, last upload, **Sync now**.
- Admin → Machines shows "N waiting to sync" per kiosk (reported in the heartbeat).

## Flow

Idle → Consent (EN/தமிழ்) → Face photo (3-2-1) → Palm (auto-capture) → Reading (palm inside the energy sphere) → Result scroll → Print → back to Idle.
Walk-away: 45 s without a touch → "Are you still there?" → 15 s → reset.

## Build status

- [x] Step 1 — backend skeleton (models, kiosk API, Gemini proxy + fallback bank, tests)
- [x] Stage A — kiosk shell (all screens, cameras by label, setup, idle reset, consent, Tamil)
- [x] Stage B — MediaPipe palm detection + auto-capture (offline, in-browser)
- [x] Stage C — palm enhancement (CLAHE + sharpen, no OpenCV dependency) + destiny lines snapped to real creases
- [ ] Stage D — Kurathi voice (TTS) + video loops
- [x] Stage E — 4×6 card rendered at 300 dpi, silent printing (Chrome `--kiosk-printing`), Windows kiosk kit
- [x] Template card layouts — client artwork + drag-and-drop photo/fortune spaces in the admin, printed by the kiosk (offline-cached)
- [x] Stage F — offline outbox (IndexedDB) with retry/backoff, sync status on kiosk + admin, late readings filed by the time they were taken
- [x] Step 3a — admin backend: auth + roles, machines, events, bookings, templates, readings, team, dashboard, reports, retention
- [x] Step 3b — admin frontend: login, Dashboard, Events, Bookings, Machines, Templates, Readings, Team, Reports, all on live data

## Placeholders to replace

- `kiosk/public/plates/*.jpg` are **temporary** backgrounds cut from the 4:5 concept art. Replace them with clean 9:16 plates or video loops (no text, no watermark), then re-measure the boxes in `kiosk/src/config/plates.ts`.
- `kiosk/public/dev/*` are sample images for design review only.
- Tamil copy (`kiosk/src/config/strings.ts`, `server/src/data/fallbackFortunes.js`) is a first draft and needs a native-speaker review.
