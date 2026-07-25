# Jewelima — Production Lock (frozen 2026-07-24 from the verified Mac dev bench)

The app is developed against EXACTLY this stack. Deploys must reproduce it —
newer frappe/erpnext tags are upgraded deliberately on dev first, never on PROD.

## Pinned stack

| Component  | Version    | Pin |
|------------|-----------|-----|
| Frappe     | v16.24.2  | commit `110f853cecac862856aa02be860a9461a85703de` |
| ERPNext    | v16.25.0  | commit `e9a9224ec4558622e646d1db9d4647790fd8ecdf` |
| Python     | 3.14.x    | bench env |
| Pillow     | 12.2.0    | frappe dependency (card/CAD rendering) |
| openpyxl   | 3.1.5     | frappe dependency (excel exports) |
| pytesseract| 0.3.13    | jewelima pyproject (`>=0.3.13,<0.4`) |
| segno      | >=1.6,<2  | jewelima pyproject (barcode QR) |

System binaries (apt):
- `tesseract-ocr` (5.x) — Design Bank OCR
- `wkhtmltopdf` 0.12.6 (patched qt) — Price Chart PDF letters
- Fonts: NONE required — Cantarell ships inside the app (jewelima/public/fonts)

## Pinning the framework on a bench

```bash
cd frappe-bench/apps/frappe  && git fetch && git checkout 110f853cecac862856aa02be860a9461a85703de
cd ../erpnext               && git fetch && git checkout e9a9224ec4558622e646d1db9d4647790fd8ecdf
cd ../.. && ./env/bin/pip install -e apps/frappe -e apps/erpnext -e apps/jewelima
bench build && bench --site <site> migrate
```

## Standard deploy (app updates only)

```bash
cd apps/jewelima && git checkout -- . && git pull --ff-only && cd ../..
bench --site <site> migrate          # doctypes, seeds, roles (after_migrate)
bench build --app jewelima
bench --site <site> clear-cache
# if permissions changed:
bench --site <site> execute jewelima.setup.setup_roles
```

## Design Bank go-live (PROD piece, one-time) — DATA CARRIED FROM THE MAC

The Mac is the master: import, OCR, rebuild and the team's dedupe/review
clicks all happened there. The server RECEIVES that state — do NOT run
fresh_v2/ocr/rebuild on the server.

1. Mac: `bench --site development.localhost execute jewelima.jewelima.imports.import_design_bank.export_full`
   -> <site>/private/design_bank_full.jsonl
2. Copy to the server: that JSONL into <site>/private/, PLUS the site's
   public/files content (design-bank/ folder and the <code>.photo/.info/
   .customer.png slot files at files/ root). rsync -a is fine.
3. Server: `bench --site <site> execute ...import_design_bank.import_full`
   (wipes the server's Design Bank — including the old 26,748 records, per
   decision — and recreates the Mac state name-for-name).
4. Team workflow: Duplicates -> Review (approve needs Design Type) ->
   Photo Update -> Photo Approvals. Progress on /app/design-bank-report.

## Email

Gmail Workspace via Email Domain "jewelima.com" + Email Account
system@jewelima.com (app password; outgoing only on dev — enable Incoming on
ONE site max). Stored password re-entry needed unless site encryption_key
travels with a DB restore.

## PLANNED: dev-container -> real production stack (same Ubuntu box)

Today the server runs the frappe_docker DEV container (devcontainer-frappe-1,
`bench start` honcho on :8000, ~/frappe_jewelima bind-mounted, MariaDB root pw
123). Works, but it is a dev server: single process, no gunicorn/nginx, no
container restart discipline, dev-grade DB creds. Target: frappe_docker's
PRODUCTION compose on the same machine.

### Target shape
- **Custom image** built from frappe_docker's layered Containerfile with
  `apps.json` = frappe @110f853, erpnext @e9a9224, jewelima release/0.0.1 —
  plus `apt install tesseract-ocr` baked in (wkhtmltopdf ships in the base).
- **Compose services**: frontend (nginx) + backend (gunicorn) + websocket +
  scheduler + short/long workers + mariadb (REAL root password) + redis pair.
  `restart: unless-stopped` everywhere — replaces the @reboot cron for the app.
- **Named volume** for sites/ (DB stays in its own volume). Cloudflared tunnel
  ingress flips from localhost:8000 to the new frontend port.

### Migration steps (half-day, rollback = restart old stack)
1. Build the image on the server (or push to a registry from the Mac).
2. Bring up the new stack on ALTERNATE ports alongside the running dev stack.
3. `bench backup --with-files` on the old site -> restore into the new stack
   (keep site name development.localhost + default_site, zero URL churn).
4. rsync the 25G public/files into the new sites volume (backup tarballs skip
   nothing, but rsync is faster to re-verify).
5. Smoke test on the alternate port: login, Bank Report numbers, one design
   image, one certification page, one sell scan.
6. Cutover: stop old bench, repoint cloudflared + LAN port, done. Old
   devcontainer stays stopped-but-intact for a week as rollback.
7. Deploys after migration: EITHER rebuild+restart the image per release
   (clean, immutable) OR bind-mount apps/jewelima into backend and keep the
   current `git pull + migrate + build` script (pragmatic, keeps today's
   workflow). Decide at migration time; start pragmatic, harden later.

### Also in scope while we're at it
- MariaDB root + site DB passwords rotated to real secrets.
- `sudo cloudflared service install` (systemd) instead of nohup-from-cron.
- Nightly `bench backup` cron to /srv (or the spare 223G sda once wiped).
