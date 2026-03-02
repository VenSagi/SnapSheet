# Cheat Sheet Maker (SnapSheet)

Upload screenshots, lay them out on pages, and export to PDF.

## Monorepo Structure

- `apps/web` – Next.js (TypeScript) frontend
- `apps/api` – FastAPI (Python) backend

## Prerequisites

- Node.js 18+
- Python 3.10+
- npm

## Running in Development

### Web (Next.js)

```bash
cd apps/web
npm install
npm run dev
```

Runs at [http://localhost:3000](http://localhost:3000).

### API (FastAPI)

```bash
cd apps/api
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Runs at [http://localhost:8000](http://localhost:8000). Health check: [http://localhost:8000/health](http://localhost:8000/health).

## End-to-End Flow

1. **Create project** – Go to `/new`. A project is created automatically when you first upload.
2. **Upload images** – Drag & drop or click to select PNG, JPG, JPEG, or WebP. Max 25MB per file, max 200 assets per project.
3. **Edit layout** – Click "Continue to Editor". Layout autosaves (debounced 1s). Refresh to verify persistence.
4. **Export PDF** – Click "Export PDF". Versions auto-increment (v1, v2, …). The file downloads in a new tab.

## Key API Endpoints

- `POST /projects` – create project (body: `{"name": "..."}`)
- `GET /projects/{id}` – get project with assets (each asset has `file_url`)
- `GET /projects/{id}/layout` – get saved layout (or null)
- `PUT /projects/{id}/layout` – save layout (body: `{"layout": { settings, placements } }`)
- `POST /projects/{id}/assets` – upload images (multipart, field: `files`)
- `GET /assets/{id}/file` – serve image file
- `POST /projects/{id}/export` – export to PDF (body: page settings + placements; optional `version_name`)
- `GET /exports/{id}/download` – download exported PDF

## Validation & Limits

- **Export payload**: Non-negative sizes (x, y ≥ 0; w, h > 0). Placements outside page bounds are **clamped** to the content area (within margins). Missing or foreign `assetId`s are rejected.
- **Max assets per project**: 200 (configurable via `MAX_ASSETS_PER_PROJECT`).
- **Max upload size**: 25MB per file (configurable via `MAX_UPLOAD_MB`).
- **Error responses**: All API errors return `{ "detail": "string" }` for consistent handling.

## Where Files Are Stored (PoC)

- `data/uploads` – uploaded images (created on startup if missing)
- `data/outputs` – exported PDFs (created on startup if missing)
- `data/db.sqlite` – SQLite metadata DB (projects, assets, exports)

Paths are relative to `apps/api` when run from that directory. Override via env vars (`UPLOAD_DIR`, `OUTPUT_DIR`, `DB_PATH`, `MAX_ASSETS_PER_PROJECT`). See `apps/api/.env.example`.

**Reset the database:** Delete `data/db.sqlite` and restart the API. Tables are recreated on startup.
