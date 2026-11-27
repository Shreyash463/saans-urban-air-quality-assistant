# Deployment & Configuration Guide

## Environment Variables

See [`.env.example`](../.env.example):

| Variable                   | Default                                       | Purpose                                                                                                                                                  |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`              | `production`                                  | `production` disables `/docs`, `/redoc`, and `/openapi.json` (set `development` locally to inspect OpenAPI/Swagger).                                     |
| `GEMINI_API_KEY`           | _(unset)_                                     | Server-side Google Gemini API key read from root `.env`. Missing/invalid keys automatically serve deterministic rule-based plans.                        |
| `GEMINI_MODEL`             | _(auto)_                                      | Optional single-model pin (e.g. `gemini-3.5-flash-lite`). Auto-discovers Flash models prioritizing Flash-Lite first when blank.                          |
| `GEMINI_MODEL_PRIORITY`    | `gemini-3.5-flash-lite,...`                   | Comma-separated model preference order for Flash discovery.                                                                                              |
| `GEMINI_DAILY_CALL_BUDGET` | `400`                                         | UTC daily upstream Gemini request cap (`00:00 UTC` reset) protecting free-tier quota.                                                                    |
| `ALLOWED_ORIGINS`          | `http://localhost:5173,http://localhost:4173` | Comma-separated CORS origin allowlist (never `*`).                                                                                                       |
| `TRUST_PROXY_HEADERS`      | `false`                                       | Set `true` behind Render/Cloud Run/nginx so rate limiting extracts client IPs safely from the rightmost `trusted_proxy_hops` entry of `X-Forwarded-For`. |
| `TRUSTED_PROXY_HOPS`       | `1`                                           | Number of trusted proxy hops to strip from the right of `X-Forwarded-For`.                                                                               |
| `VITE_API_BASE_URL`        | `""`                                          | Frontend API base URL; empty string uses same-origin `/api`.                                                                                             |

---

## Option 1: Render (60-Second Blueprint Deploy — Free Tier)

1. Open `https://render.com/deploy?repo=https://github.com/Shreyash463/saans-urban-air-quality-assistant` and authorize GitHub access for the repository.
2. When prompted by [`render.yaml`](../render.yaml), paste your server-side `GEMINI_API_KEY` (leave `GEMINI_MODEL` blank to auto-select healthy Flash models).
3. Click **Deploy Blueprint** — Render builds [`Dockerfile`](../Dockerfile), serves `frontend/dist/` and FastAPI `/api/*` via `uvicorn --factory app.main:create_app` on a single HTTPS origin, and monitors `/api/health`.

---

## Option 2: Google Cloud Run

```bash
gcloud run deploy saans-assistant --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,TRUST_PROXY_HEADERS=true --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

---

## Option 3: Vercel (Frontend) + Hosted FastAPI Backend

Deploy the static Vite SPA (`frontend/`) while pointing `VITE_API_BASE_URL` at your Cloud Run or Render backend URL (and add the Vercel domain to `ALLOWED_ORIGINS` on the backend):

```bash
cd frontend && vercel --prod   # Build command: npm run build | Output dir: dist | Env: VITE_API_BASE_URL=https://<backend-url>
```

---

## Option 4: Local Docker

Multi-stage build (Node 24 builds `frontend/dist` -> slim Python 3.13 non-root runtime executes `uvicorn --factory app.main:create_app` serving `frontend/dist/` + `/api` on `$PORT`, defaulting to `8000`):

```bash
docker build -t saans-assistant .
docker run --rm -p 8000:8000 -e ENVIRONMENT=production --env-file .env saans-assistant
```
