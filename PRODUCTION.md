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

## Design Bank go-live (PROD piece, one-time)

1. Copy the FLATTENED image folder to `<site>/public/files/design-bank/`
   (build it from the Takeout zips with the zip-by-zip extractor — collisions
   become "<folder> - <name>", nothing overwritten).
2. `bench --site <site> execute jewelima.jewelima.imports.import_design_bank.fresh_v2`
   (wipes Design Bank, imports every image, folds same-code duplicates into
   Review Images with duplicate_review flagged).
3. OCR until zero left (resumable):
   `bench --site <site> execute ...import_design_bank.ocr_fill --kwargs "{'limit': 1000}"`
4. Crop + card re-render until zero left (resumable, OCR-gated):
   `bench --site <site> execute ...import_design_bank.rebuild_cards --kwargs "{'limit': 500}"`
5. Team workflow: Duplicates -> Review (approve needs Design Type) ->
   Photo Update -> Photo Approvals. Progress on /app/design-bank-report.

## Email

Gmail Workspace via Email Domain "jewelima.com" + Email Account
system@jewelima.com (app password; outgoing only on dev — enable Incoming on
ONE site max). Stored password re-entry needed unless site encryption_key
travels with a DB restore.
