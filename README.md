# Cheat Sheet Maker

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

**Key API endpoints:**
- `POST /projects` – create project (body: `{"name": "..."}`)
- `GET /projects/{id}` – get project with assets (each asset has `file_url`)
- `POST /projects/{id}/assets` – upload images (multipart, field: `files`)
- `GET /assets/{id}/file` – serve image file
- `POST /projects/{id}/export` – export to PDF (body: page settings + placements in points)
- `GET /exports/{id}/download` – download exported PDF

**Where files are stored (PoC):**

- `data/uploads` – uploaded images (created on startup if missing)
- `data/outputs` – exported PDFs (created on startup if missing)
- `data/db.sqlite` – SQLite metadata DB (projects, assets, exports)

Paths are relative to `apps/api` when run from that directory. Override via env vars (`UPLOAD_DIR`, `OUTPUT_DIR`, `DB_PATH`). See `apps/api/.env.example`.

**Reset the database:** Delete `data/db.sqlite` and restart the API. Tables are recreated on startup.

## Data Directories (PoC)

- `data/uploads` – uploaded images
- `data/outputs` – exported PDFs
- `data/db.sqlite` – SQLite metadata DB

These are excluded from git via `.gitignore`.
