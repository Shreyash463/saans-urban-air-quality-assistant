# Contributing to Saans

Thank you for helping improve **Saans — Urban Air Quality Assistant**!

## Development Setup

### Prerequisites

- Node.js 22+ (Node 24 recommended)
- Python 3.12+ (Python 3.13 recommended)

### First-Time Install

```bash
cd frontend && npm ci --ignore-scripts && cd ..
python -m venv .venv
# Linux/macOS: source .venv/bin/activate
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
python -m pip install --require-hashes -r backend/requirements-dev.txt
cp .env.example .env
```

Leave `GEMINI_API_KEY` empty in `.env` to test the deterministic rule-based backend, or add a local Google AI Studio key (`.env` is gitignored and must never be committed).

### Running Locally

- Terminal 1 (API): `python -m uvicorn --app-dir backend app.main:app --reload --port 8000`
- Terminal 2 (Vite SPA): `cd frontend && npm run dev` (proxies `/api/*` -> `http://127.0.0.1:8000`)

## Quality & Verification Gates

Before opening a pull request, all of the following checks must pass:

### Frontend (inside `frontend/`)

```bash
npm run format:check
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
```

### Backend (from `backend/`)

```bash
ruff check app tests scripts
mypy app
npx pyright app
pytest --cov=app --cov-report=term-missing
pip-audit -r requirements.txt
```

## Engineering Guidelines

- Keep `frontend/src/types/index.ts`, `backend/app/schemas.py`, and `contract/impact-factors.json` synchronized (additive changes only).
- Never invent emission or CO2 savings outside `contract/impact-factors.json`; non-emission actions (masks, purifiers, sealing, ventilation) must report `co2SavedKgPerMonth = 0` or `null`.
- All new UI copy must support both English (`frontend/src/locales/en.json`) and Hindi (`frontend/src/locales/hi.json`) and pass `axe-core` WCAG 2.2 AA checks in Light and Dark themes.
- Never log or persist API keys or opt-in geolocation coordinates (`lat`/`lon`).
