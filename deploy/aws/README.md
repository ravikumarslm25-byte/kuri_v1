# Deploy Kuri on one AWS EC2 instance

Everything runs on one server, as one app, behind one domain:

```
https://kuri.example.com/          kiosk app (Chrome on the kiosk PC)
https://kuri.example.com/admin/    admin panel
https://kuri.example.com/api/...   API (kiosks + admin)

EC2 instance (Docker)
 ├─ caddy  : ports 80/443, free HTTPS certificate (Let's Encrypt), auto-renewed
 ├─ app    : Kuri (Node 22) — API + admin panel + kiosk app, port 5010 inside Docker only
 └─ mongo  : MongoDB 7, not reachable from the internet
Data: Docker volumes "mongo" (database) and "uploads" (photos, cards, template artwork)
```

HTTPS is required: browsers only allow the kiosk cameras on `https://` (or `localhost`).

---

## 1. Before you start

- A domain or subdomain you control, e.g. `kuri.hackgenix.com`.
- An AWS account.
- Optional: a Gemini API key (without one, kiosks use the offline fortune bank).

## 2. Launch the EC2 instance

AWS Console → EC2 → **Launch instance**

| Setting | Value |
|---|---|
| Region | Asia Pacific (Mumbai) `ap-south-1` (closest to Tamil Nadu) |
| Name | `kuri-prod` |
| Image | **Ubuntu Server 24.04 LTS** (64-bit x86) |
| Instance type | **t3.small** (2 vCPU, 2 GB) is enough for a few kiosks; **t3.medium** (4 GB) if you run many kiosks at once |
| Key pair | Create one (`kuri-prod.pem`) and keep it safe |
| Storage | **30 GB gp3** |
| Security group | Inbound: **SSH 22 from My IP**, **HTTP 80 from Anywhere**, **HTTPS 443 from Anywhere** |

Then EC2 → **Elastic IPs** → Allocate → **Associate** with `kuri-prod`. This keeps the IP fixed when the instance restarts.

## 3. Point the domain at the server

At your DNS provider, add an **A record**: `kuri` → the Elastic IP. Wait until it resolves:

```bash
nslookup kuri.hackgenix.com     # must show the Elastic IP
```

## 4. Install Docker on the server

```bash
ssh -i kuri-prod.pem ubuntu@<ELASTIC-IP>

# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit                                   # log out and back in so the group applies
ssh -i kuri-prod.pem ubuntu@<ELASTIC-IP>
docker compose version                 # should print v2.x

# 2 GB swap: the first build needs more memory than a t3.small has
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 5. Copy the project to the server

From your computer (in the folder that has `kuri.zip`):

```bash
scp -i kuri-prod.pem kuri.zip ubuntu@<ELASTIC-IP>:~
```

On the server:

```bash
sudo apt-get install -y unzip
sudo mkdir -p /opt && sudo unzip -q ~/kuri.zip -d /opt && sudo chown -R ubuntu:ubuntu /opt/kuri
cd /opt/kuri
```

(Or `git clone` your repository into `/opt/kuri`.)

## 6. Settings

```bash
cd /opt/kuri
cp .env.production.example .env
openssl rand -base64 32 | tr -d '/+=' | cut -c1-43     # run twice: one for each secret below
nano .env
```

Set at least:

```
DOMAIN=kuri.hackgenix.com
KIOSK_PROVISION_KEY=<first random value>
ADMIN_JWT_SECRET=<second random value>
CORS_ORIGINS=https://kuri.hackgenix.com,http://localhost:4173
GEMINI_API_KEY=<optional>
```

`http://localhost:4173` in `CORS_ORIGINS` is for kiosks that run their own local copy (step 9, recommended).

## 7. Start

```bash
cd /opt/kuri
docker compose up -d --build           # first build takes about 5–10 minutes
docker compose ps                      # app, mongo, caddy: all "running" / "healthy"
curl https://kuri.hackgenix.com/api/health
# {"ok":true,"db":"up","ai":true,...}
```

Caddy gets the HTTPS certificate on the first request (needs DNS from step 3 and ports 80/443 open).

## 8. First admin and setup

```bash
docker compose exec app node src/scripts/createAdmin.js ravi@hackgenix.com 'YourStrongPassword' Ravi
```

Open **https://kuri.hackgenix.com/admin/** and sign in. Then, as before:
1. **Templates** → upload the card artwork → set the photo & text spaces → Save layout.
2. **Machines** → Add Machine (`KURI-001`) → Manage → optional *Default card template*.
3. **Events** → add the event (template, language) → **Bookings** → book `KURI-001`, status **Confirmed**.

Do **not** run `npm run seed` on the server: it creates demo data and a demo admin.

## 9. Kiosk PCs

**Recommended — the kiosk runs its own local copy** (starts even when the venue has no internet; readings sync to AWS when it is back):

1. Install the kiosk on the PC as in `deploy/windows/README.md` (`C:\kuri\kiosk`, `start-kuri.bat`, `KURI_URL` left empty).
2. On the kiosk: tap the top-left corner 5× → Setup → **API URL** `https://kuri.hackgenix.com` → Machine ID `KURI-001` → provision key → **Register machine** → **Test connection** (it shows the event and the "Card:" line).

**Alternative — load the app straight from AWS** (always the latest version, but the kiosk needs internet when Chrome starts): in `start-kuri.bat` set `KURI_URL=https://kuri.hackgenix.com/`. The Setup screen then fills the API URL by itself.

Either way, check Admin → Machines: the kiosk shows **Online** and what it prints.

## 10. Backups

```bash
cd /opt/kuri && bash deploy/aws/backup.sh        # writes backups/db-*.archive.gz + uploads-*.tar.gz
crontab -e
# add:  30 3 * * * cd /opt/kuri && bash deploy/aws/backup.sh >> backups/backup.log 2>&1
```

Keeps 14 days. To also copy them off the server, install the AWS CLI, attach an IAM role with S3 write access to the instance, and set `S3_BUCKET=s3://your-bucket/kuri` in the cron line. Also turn on EBS snapshots (EC2 → Lifecycle Manager) as a second safety net. Restore commands are at the end of `backup.sh`.

## 11. Updating to a new version

```bash
cd /opt/kuri
# copy the new code over (scp + unzip, or git pull) — keep your .env
docker compose up -d --build
docker image prune -f
```

The database and uploads live in Docker volumes and are kept. Kiosks loading the app from AWS get the new version on their next reload; local-copy kiosks need the new `kiosk` folder copied to the PC.

## 12. Day-to-day commands

```bash
docker compose logs -f app             # live server log
docker compose restart app             # restart Kuri only
docker compose down                    # stop everything (data is kept)
docker compose exec mongo mongosh kuri # database shell
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Browser shows a certificate error / Caddy log says "challenge failed" | DNS must point at the Elastic IP, and ports 80 + 443 must be open in the security group. Then `docker compose restart caddy`. |
| `502 Bad Gateway` right after start | The app is still starting. Check `docker compose logs app`. |
| Build stops with "killed" / out of memory | Add the swap file from step 4, or use a t3.medium. |
| Kiosk camera says "The Oracle's eye is clouded" | Open the kiosk over `https://` (or the local copy on `localhost`). Plain `http://<ip>` blocks cameras. |
| Kiosk: "Invalid provision key" | It must equal `KIOSK_PROVISION_KEY` in `.env`. After changing `.env`: `docker compose up -d`. |
| Local-copy kiosk can't connect | Add `http://localhost:4173` to `CORS_ORIGINS` in `.env`, then `docker compose up -d`. |
| App refuses to start: "ADMIN_JWT_SECRET must be set" | Fill it in `.env`. |
