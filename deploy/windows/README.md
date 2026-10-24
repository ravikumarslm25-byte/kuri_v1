# Kiosk PC setup (Windows 10/11)

One-time setup per machine. Takes ~30 minutes.

## 1. Software
1. Install **Node.js 20 LTS** and **Google Chrome**.
2. Copy the built kiosk to `C:\kuri\kiosk` (the `dist/` folder + `scripts/serve.mjs` + `package.json`).
   Build it on a dev machine with `cd kiosk && npm install && npm run build`.
3. Copy `start-kuri.bat` to `C:\kuri\` and put a shortcut to it in `shell:startup` (Win+R → `shell:startup`).

## 2. Printer: DNP DS-RX1HS (or HiTi P525L)
1. Install the manufacturer's Windows driver.
2. **Settings → Printers → set the DNP as the default printer.** Kiosk printing always uses the default printer.
3. Printer preferences → paper **PC (4x6)**, orientation **Portrait**, **Borderless ON**, finish **Glossy**.
4. Load 4x6 media (DS-RX1HS: "6x8" roll with 2-up cutting, or 4x6 roll).
5. Test: complete one real reading and press *Print Your Fortune*. The card must fill the 4x6 page with no white border; if it doesn't, check Borderless and paper size again.

## 3. Cameras
- Face camera: at eye level, facing the guest.
- Palm camera (inside the scanner box): sees the **whole hand** from wrist to fingertips; matte black interior; diffused light.
- Open the kiosk, tap the top-left corner **5 times** → Setup → pick each camera **by name** → Save.

## 4. Register the machine
Setup → API URL (your server, e.g. `https://kuri-api.hackgenix.com`), Machine ID (`KURI-001`), provision key → **Register machine** → **Test connection** shows the booked event.

## 5. Lock down Windows
- Sleep / screen off: **Never**. Disable Windows Update active hours restarts during events.
- Turn off notifications (Focus Assist → Alarms only).
- Auto-login to a local kiosk account (`netplwiz`).
- Touch screen: disable edge swipes (Group Policy → *Allow edge swipe* = Disabled).

## Known limits
- Browsers can't read printer status. If the printer is out of paper or ribbon, the guest still sees "printing". Staff should check the media counter on the printer before each event day. (A small local print agent using the DNP SDK can add paper/ribbon status later if needed.)
