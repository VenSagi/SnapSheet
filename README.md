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

**Where files are stored (PoC):**

- `data/uploads` – uploaded images (created on startup if missing)
- `data/outputs` – exported PDFs (created on startup if missing)

Paths are relative to `apps/api` when run from that directory. Override via env vars (`UPLOAD_DIR`, `OUTPUT_DIR`). See `apps/api/.env.example`.

## Data Directories (PoC)

- `data/uploads` – uploaded images
- `data/outputs` – exported PDFs

These are excluded from git via `.gitignore`.
