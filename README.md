# Saans — Urban Air Quality Assistant

[![CI](https://github.com/Shreyash463/saans-urban-air-quality-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/Shreyash463/saans-urban-air-quality-assistant/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Shreyash463/saans-urban-air-quality-assistant/actions/workflows/codeql.yml/badge.svg)](https://github.com/Shreyash463/saans-urban-air-quality-assistant/actions/workflows/codeql.yml)

**Live Demo**: <https://saans-urban-air-quality-assistant.onrender.com> · **Architecture**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · **ADRs**: [`docs/DECISIONS.md`](docs/DECISIONS.md) · **Branch**: `main` (single-branch repo)

**Saans** (Hindi for _"breath"_) is a bilingual (**English + हिन्दी**) full-stack web application built to help Indian households and communities navigate severe winter smog and urban air pollution. It combines a React + TypeScript + Vite frontend with a hardened FastAPI + Google Gemini backend, live Open-Meteo particulate data calibrated to the **Indian CPCB National AQI scale**, deterministic safety guardrails, and an interactive multiplicative impact simulator.

- **One-Click Cloud Deploy (Render Free Tier)**: [Deploy to Render](https://render.com/deploy?repo=https://github.com/Shreyash463/saans-urban-air-quality-assistant) (uses [`render.yaml`](render.yaml) + [`Dockerfile`](Dockerfile))

---

## Challenge Mapping (Problem Statement -> Code)

> _"Create a GenAI-powered assistant that helps families and communities navigate severe winter smog and urban air pollution. It should suggest low-emission daily routines, indoor air quality hacks, and sustainable alternatives tailored to their location and lifestyle, while clearly explaining the direct impact of their choices."_

| Problem Statement Requirement                     | Saans Implementation                                                                                                                                                                                                                                                  | Code Location                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Navigate severe winter smog & urban pollution** | Live Open-Meteo 24h PM2.5/PM10 mapped to the Indian CPCB AQI scale (0–500) with deterministic health advisories and tiered N95/FFP2 mask guidance.                                                                                                                    | [`backend/app/services/cpcb.py`](backend/app/services/cpcb.py), [`backend/app/services/safety.py`](backend/app/services/safety.py), [`frontend/src/components/AqiGauge.tsx`](frontend/src/components/AqiGauge.tsx)                                                           |
| **Helps families AND communities**                | Household vulnerability awareness (`children`, `elderly`, `respiratory`) plus **"Make it a community effort"** RWA/school/workplace/neighbour cards and a **Scale it to your community** simulator slider (`10–500` homes).                                           | [`frontend/src/components/CommunityActionsSection.tsx`](frontend/src/components/CommunityActionsSection.tsx), [`frontend/src/sections/Simulator.tsx`](frontend/src/sections/Simulator.tsx), [`backend/app/services/fallback_plan.py`](backend/app/services/fallback_plan.py) |
| **Tailored to location and lifestyle**            | Multi-field profile (`city`, size, commute, home, purifier, cooking, budget, EN/HI) plus opt-in **"Use my location"** Geolocation (`POST /api/air-quality` & `POST /api/plan` JSON body coordinates, `"Your location (approx.)"`, zero URL query leakage or storage). | [`frontend/src/sections/ProfileForm.tsx`](frontend/src/sections/ProfileForm.tsx), [`backend/app/routers/air_quality.py`](backend/app/routers/air_quality.py)                                                                                                                 |
| **Low-emission daily routines**                   | Coherent 4-slot routine (`morning`, `midday`, `evening`, `night`) accounting for winter thermal inversions (6–10 AM/PM) and the 1–4 PM cross-ventilation dip.                                                                                                         | [`backend/app/prompts.py`](backend/app/prompts.py), [`frontend/src/components/DashboardPlanCards.tsx`](frontend/src/components/DashboardPlanCards.tsx)                                                                                                                       |
| **Indoor air quality hacks**                      | Budget-ranked Indian hacks (wet mopping, skipping incense/coils, EPDM sealing, DIY box-fan + HEPA, debunking plant myths).                                                                                                                                            | [`backend/app/services/gemini/client.py`](backend/app/services/gemini/client.py), [`frontend/src/components/DashboardPlanCards.tsx`](frontend/src/components/DashboardPlanCards.tsx)                                                                                         |
| **Sustainable alternatives & direct impact**      | Lifestyle swaps paired with bounded PM2.5 (%) and monthly CO2 (kg, nonzero only on emission actions) plus an interactive multiplicative **Impact Simulator** (`1 - Π(1 - rᵢ)`).                                                                                       | [`contract/impact-factors.json`](contract/impact-factors.json), [`frontend/src/lib/impact.ts`](frontend/src/lib/impact.ts), [`backend/app/services/impact.py`](backend/app/services/impact.py)                                                                               |
| **Conversational GenAI follow-up**                | **Ask Saans** grounded in active plan/AQI with `<user_question>` prompt-injection defense, emergency care escalation, and rule fallback.                                                                                                                              | [`backend/app/routers/chat.py`](backend/app/routers/chat.py), [`frontend/src/sections/Chat.tsx`](frontend/src/sections/Chat.tsx)                                                                                                                                             |

---

## Efficiency Benchmarks (Measured Before vs. After Optimization)

Reproducible backend benchmarks live in [`backend/scripts/bench.py`](backend/scripts/bench.py).

| Metric                                               | Before Baseline (`4b3a4db`)                                                           | After Optimization (`ed4c20a`)                                                                    | Improvement / Mechanism                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Initial JS (`index-*.js`)**                        | `394.12 kB` (`115.61 kB` gzip)                                                        | `315.36 kB` (`93.57 kB` gzip)                                                                     | Lazy-loaded `i18n.hi.ts` & mock generators                   |
| **External Font Requests**                           | `4` Google Fonts CDN fonts (`205 kB` incl. `120 kB` Devanagari)                       | `0` external CDNs on English sessions                                                             | Self-hosted subsetted Latin `@fontsource` + preloads         |
| **Live Mobile Lighthouse (Perf / A11y / BP / SEO)**  | `91 / 100 / 100 / 100` (`CLS 0.107`, `LCP 2.2 s`)                                     | `100 / 100 / 100 / 100` (`CLS 0`, `LCP 1.1 s`)                                                    | Self-hosted fonts, preloads, layout reservation              |
| **Live Desktop Lighthouse (Perf / A11y / BP / SEO)** | `95 / 100 / 100 / 100` (`LCP 0.9 s`, `CLS 0.005`)                                     | `100 / 100 / 100 / 100` (`LCP 0.6 s`, `CLS 0.004`)                                                | Brotli precompression + `immutable` `/assets/*`              |
| **Gemini Failover & Prompt Bloat**                   | Walks failing models on every request; `2,477`-char system + `1,171`-char user prompt | `ModelCircuitBreaker` (`60s` 429 / `300s` 503 / `900s` 404); `1,384 + 472`-char prompt (`-49.1%`) | Skips tripped models (`0 ms` overhead) & trims output schema |
| **Stubbed Backend Median Latency**                   | —                                                                                     | `5.12 ms` plan miss / `4.24 ms` plan hit / `4.06 ms` chat                                         | In-flight AQI coalescing + concurrent fact prep              |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DECISIONS.md`](docs/DECISIONS.md) for system diagrams and Architecture Decision Records.

---

## Architecture

```mermaid
flowchart LR
    U["Browser SPA (React 19 + Vite + Tailwind)"] -->|"GET /api/air-quality\nPOST /api/plan\nPOST /api/chat"| API["FastAPI Backend\n(Security Headers, CORS, 20KB Body Cap, Rate Limiter)"]
    API -->|"Geocode + 24h Hourly PM2.5 / PM10\n(10m TTL Cache)"| OM["Open-Meteo APIs"]
    API -->|"Sub-index Interpolation\n(CPCB Breakpoints)"| CPCB["CPCB AQI Engine"]
    API -->|"Grounded Facts + Shared JSON Contract"| IMP["Impact & Grounding Engine\n(contract/impact-factors.json)"]
    API -->|"Structured JSON + Prompt Delimiters"| GEM["Google Gemini SDK\n(google-genai, Auto Flash Selection)"]
    GEM -->|"Post-validation & Banned-phrase Override"| SAF["Deterministic Safety Layer\n(CPCB Tiers + Medical Bounds)"]
    API -->|"On missing key / timeout / error"| FB["Rule-Based Fallback Generator"]
    SAF --> API
    FB --> API
```

---

## Features

- **Live + Demo Air Quality**: Fetches 24-hour PM2.5/PM10 observations from Open-Meteo (no external AQ API key required), prefers Indian geocoding matches when ambiguous, computes CPCB sub-indices, caches for 10 minutes, and falls back gracefully to curated Indian city demo readings (`Sample reading`).
- **GenAI Personalization + Grounded Math**: Uses `google-genai` structured JSON output (`temperature: 0.3`, 20s timeout, single retry, automatic newest `flash` model discovery via `models.list()`).
- **Zero Invented Metrics**: Both frontend and backend load numeric constants from `contract/impact-factors.json`. The backend overwrites/clamps LLM numbers (`pm25ReductionPct` capped at `95%`; `co2SavedKgPerMonth` nonzero strictly on emission-changing swaps).
- **Deterministic Safety Layer**: Enforces CPCB tier + vulnerability rules (`children`, `elderly`, `respiratory`). Never allows claims that outdoor exercise is safe for sensitive groups at AQI ≥ 101 or anyone at AQI ≥ 201, blocks diagnostic/dosing language, and escalates emergency symptoms (`chest pain`, `severe breathlessness`, `blue lips`, `fainting`).
- **Habit-Aware Recommendations**: Never recommends purchasing/adopting a habit the household already practices (metro/bus/walk/WFH commute, induction/PNG cooking, existing air purifier); instead acknowledges and optimizes around it.
- **Export & Print**: Print stylesheet (`@media print` single-column black-on-white), **Download plan (.txt)**, and **Copy plan** with `aria-live="polite"` confirmations.
- **Bilingual & Theme-Aware**: Instant English / हिन्दी (`<html lang>`) switching, Light & Dark modes, and full `prefers-reduced-motion` + in-app Reduce Motion toggle.

---

## How Gemini Is Used & How Numbers Are Grounded

1. **Startup Model Selection, Budget Guard & Automatic Failover**: If `GEMINI_MODEL` is unset and `GEMINI_API_KEY` is provided in root `.env`, the backend calls `client.aio.models.list()` at startup (with a `3.5s` bounded timeout), filters text `flash` models supporting `generateContent`, ranks **Flash-Lite models first** by default via `GEMINI_MODEL_PRIORITY` for maximum free-tier reliability (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-3.6-flash` -> `gemini-3.8-flash`), enforces a UTC daily upstream call budget (`GEMINI_DAILY_CALL_BUDGET`, default `400`, resets at `00:00 UTC`), and promotes whichever active model succeeds. If `GEMINI_MODEL` is set, only that single pinned model is tried before failing over cleanly.
2. **Grounding Before Generation**: `backend/app/services/impact.py` computes household `ProfileFacts` (already-followed habits, vulnerability flags, budget rank, and deterministic swap baselines from [`contract/impact-factors.json`](contract/impact-factors.json)).
3. **Low-Latency Structured Generation**: Gemini writes tailored English or Hindi guidance using `SIMPLE_PLAN_JSON_SCHEMA` (`response_mime_type="application/json"`, `temperature=0.3`, lowest-latency `ThinkingConfig` per model generation).
4. **Post-Generation Enforcement**: `ground_alternatives_numbers()` replaces/clamps all numeric savings against `contract/impact-factors.json` (`0–95%` PM2.5, `0` CO2 for non-emission actions like masks/windows/purifiers/sealing), and `enforce_plan_safety()` validates `healthAdvisory` and `maskGuidance` against deterministic CPCB rules (e.g., never permitting outdoor exercise for vulnerable households at AQI ≥ 101 or anyone at AQI ≥ 201).
5. **Resilient Server-Only Fallback**: There is no fake in-browser sample plan generator in the production bundle; when the server is unreachable, the UI displays an honest error state with **"Try again"** and the waking-up hint. When `GEMINI_API_KEY` is missing, quota-capped, or upstream fails/times out, the server's `services/fallback_plan.py` produces a complete personalized plan tagged `generatedBy: "rules"` with `fallbackReason`.

---

## Safety Design & Known Limitations

- **PM-Based CPCB Estimate**: Open-Meteo air quality readings reflect modeled hourly PM2.5 and PM10 concentrations (averaged over the past 24 observed hours with at least 12 valid hours required), not ground-station gaseous pollutants (O3, NO2, SO2, CO) or local street-canyon spikes.
- **Not Medical Advice**: Saans provides general environmental and low-emission household guidance. Every plan and symptom response reminds users to consult a qualified physician, and severe symptoms prompt immediate emergency care (`108` / nearest ER).
- **Approximate Household Estimates**: Simulator PM2.5 (%) and monthly CO2 (kg) estimates are planning approximations derived from `contract/impact-factors.json`, not clinical or laboratory measurements.

---

## Setup (3 Commands)

```bash
# 1. Install frontend dependencies and build production bundle
cd frontend && npm ci --ignore-scripts && npm run build && cd ..

# 2. Set up Python environment and install backend dependencies
python -m venv .venv && .venv/Scripts/pip install --require-hashes -r backend/requirements-dev.txt  # Linux/macOS: .venv/bin/pip

# 3. Configure environment and launch single-origin server (serves UI + /api)
cp .env.example .env && .venv/Scripts/python -m uvicorn --app-dir backend app.main:app --host 0.0.0.0 --port 8000
```

For local Vite HMR frontend development alongside FastAPI (`http://localhost:8000`):

```bash
cd frontend && npm run dev   # proxies /api -> http://127.0.0.1:8000
```

---

## Environment Variables

See [`.env.example`](.env.example):

| Variable                   | Default                                       | Purpose                                                                                                                                                  |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENVIRONMENT`              | `production`                                  | `production` disables `/docs`, `/redoc`, and `/openapi.json` (set `development` locally to browse docs).                                                 |
| `GEMINI_API_KEY`           | _(unset)_                                     | Server-side Google Gemini API key read from root `.env`. Missing/invalid keys automatically use rule-based fallback.                                     |
| `GEMINI_MODEL`             | _(auto)_                                      | Optional single-model pin (e.g. `gemini-3.5-flash-lite`). Auto-discovers Flash models prioritizing Flash-Lite first when blank.                          |
| `GEMINI_MODEL_PRIORITY`    | `gemini-3.5-flash-lite,...`                   | Comma-separated model preference order for Flash discovery.                                                                                              |
| `GEMINI_DAILY_CALL_BUDGET` | `400`                                         | UTC daily upstream Gemini request cap (`00:00 UTC` reset) to protect free-tier quota.                                                                    |
| `ALLOWED_ORIGINS`          | `http://localhost:5173,http://localhost:4173` | Comma-separated CORS origin allowlist (never `*`).                                                                                                       |
| `TRUST_PROXY_HEADERS`      | `false`                                       | Set `true` behind Render/Cloud Run/nginx so rate limiting extracts client IPs safely from the rightmost `trusted_proxy_hops` entry of `X-Forwarded-For`. |
| `TRUSTED_PROXY_HOPS`       | `1`                                           | Number of trusted proxy hops to strip from the right of `X-Forwarded-For`.                                                                               |
| `VITE_API_BASE_URL`        | `""`                                          | Frontend API base URL; empty string uses same-origin `/api`.                                                                                             |

---

## API Reference

All payloads use camelCase JSON matching [`frontend/src/types/index.ts`](frontend/src/types/index.ts) and [`backend/app/schemas.py`](backend/app/schemas.py).

### `GET /api/health`

Returns service readiness, active healthy model selection, and short commit SHA (`commitSha`, reading `RENDER_GIT_COMMIT[:7]` or `"dev"`).

```json
{
  "status": "ok",
  "geminiConfigured": false,
  "selectedModel": null,
  "commitSha": "dev"
}
```

### `GET /api/air-quality?city=Pune` & `POST /api/air-quality`

Returns live Open-Meteo CPCB-calibrated reading (cached 10 minutes; `Cache-Control: public, max-age=180` for city lookups, `"Your location (approx.)"` with zero URL query leakage or log/disk persistence when coordinates are submitted via `POST /api/air-quality` JSON body `{ "lat": 28.6139, "lon": 77.2090 }`) or `"demo"` fallback.

```json
{
  "city": "Pune",
  "aqi": 84,
  "dominantPollutant": "PM2.5",
  "updatedAt": "2026-11-25T12:00:00+05:30",
  "source": "live",
  "sourceDetail": "Open-Meteo, PM-based CPCB estimate"
}
```

### `POST /api/plan`

Request body (`PlanRequest`, extending `UserProfile` with optional ephemeral `coords: { "lat": ..., "lon": ... }` and `preferCoords`):

```json
{
  "city": "Delhi",
  "householdSize": 4,
  "hasChildren": true,
  "hasElderly": false,
  "hasRespiratoryCondition": true,
  "commuteMode": "car",
  "commuteKm": 18,
  "homeType": "apartment",
  "hasAirPurifier": false,
  "cookingFuel": "lpg",
  "budget": "low",
  "language": "en"
}
```

Response (`PlanResponse`): returns `aqi`, `summary`, `healthAdvisory`, `routine` (4 slots), `indoorHacks` (5–7 items), `alternatives` (3–5 items), optional `communityActions` (3–5 RWA/school/workplace/neighbour items), `maskGuidance`, `disclaimer`, and `generatedBy` (`"gemini" | "rules"`).

<details>
<summary>Sanitized Real Gemini Example Responses (captured live on <code>gemini-3.5-flash-lite</code> + Open-Meteo)</summary>

**Example 1 — Delhi car commuter, high budget (`AQI 236`, `PM2.5`, `generatedBy: "gemini"`):**

```json
{
  "aqi": {
    "city": "Delhi",
    "aqi": 236,
    "dominantPollutant": "PM2.5",
    "updatedAt": "2026-11-25T16:00:00+05:30",
    "source": "live",
    "sourceDetail": "Open-Meteo, PM-based CPCB estimate"
  },
  "summary": "Welcome to your Delhi clean-air plan. With an AQI of 236, heavy smog and thermal inversions trap pollutants, making targeted indoor and commute defenses essential for your 2-person household.",
  "healthAdvisory": "AQI is 236, which is poor. Avoid all outdoor exertion as trapped winter pollutants and PM2.5 severely irritate airways. Keep sensitive family members indoors and rely on clean indoor air.",
  "routine": [
    {
      "timeSlot": "morning",
      "title": "Morning Inversion Defense",
      "detail": "Keep windows shut tightly during the 6 AM to 10 AM thermal inversion peak to prevent outdoor vehicle and fog smog from entering your independent house.",
      "impactNote": "Blocks heavy morning particulate matter from settling indoors while you prepare your breakfast on LPG."
    }
  ],
  "alternatives": [
    {
      "current": "Daily car commute of 22 km",
      "swap": "Switch to public transit or carpooling for part of your daily 22 km journey",
      "why": "Lowers tailpipe emissions on congested urban roads and reduces personal exposure to traffic fumes.",
      "pm25ReductionPct": 14,
      "co2SavedKgPerMonth": 85
    },
    {
      "current": "No bedroom air purification",
      "swap": "Install a dedicated True HEPA air purifier in your bedroom",
      "why": "Provides clean, particulate-free air during sleep when your respiratory system recovers.",
      "pm25ReductionPct": 42,
      "co2SavedKgPerMonth": 0
    }
  ],
  "maskGuidance": "Wear a fitted N95 or FFP2 respirator mask whenever you step outside during your car commute or errands to filter out toxic PM2.5 particles effectively.",
  "generatedBy": "gemini"
}
```

**Example 2 — Pune family with child & respiratory sensitivity, metro + induction + purifier, low budget (`AQI 58`, `PM2.5`, `generatedBy: "gemini"`):**

```json
{
  "aqi": {
    "city": "Pune",
    "aqi": 58,
    "dominantPollutant": "PM2.5",
    "updatedAt": "2026-11-25T16:00:00+05:30",
    "source": "live",
    "sourceDetail": "Open-Meteo, PM-based CPCB estimate"
  },
  "summary": "Hello from Saans! It is wonderful that your Pune family already uses clean electric induction for cooking, relies on public transport for your 14 km commute, and maintains an indoor air purifier.",
  "healthAdvisory": "With Pune AQI at 58, air quality is satisfactory, but sensitive family members like children and those with asthma require mindful protection during peak traffic hours.",
  "indoorHacks": [
    {
      "title": "Optimize Existing Air Purifier",
      "howTo": "Check and gently vacuum the pre-filter of your purifier to ensure maximum airflow and filtration efficiency.",
      "estimatedBenefit": "Maintains peak CADR performance for your apartment.",
      "costLevel": "free"
    }
  ],
  "alternatives": [
    {
      "current": "Using loose cloth face coverings",
      "swap": "Switching to certified fitted N95 masks",
      "why": "Certified N95 respirators create a proper seal around the nose and mouth to block fine particulate matter effectively.",
      "pm25ReductionPct": 35,
      "co2SavedKgPerMonth": 0
    },
    {
      "current": "Burning garden or household waste outdoors",
      "swap": "Composting organic waste and using municipal disposal for trash",
      "why": "Eliminating open burning prevents heavy localized toxic smoke and harmful carbon emissions.",
      "pm25ReductionPct": 16,
      "co2SavedKgPerMonth": 28
    }
  ],
  "generatedBy": "gemini"
}
```

</details>

### `POST /api/chat`

Request body: `{ "question": "...", "profile": UserProfile, "plan": PlanResponse }`

Response (`ChatReply`):

```json
{
  "answer": "At AQI 310 (Very Poor) in Delhi, outdoor play and exertion should be avoided for everyone..."
}
```

---

## Tests, Linting, Typechecking, and Build

See [`docs/TESTING.md`](docs/TESTING.md) for full test layers, coverage reports (**95.93%** frontend lines, **95.34%** backend line+branch), randomized-order runs, and AST mutation summary.

```bash
# Frontend checks (inside frontend/)
cd frontend
npm run format:check
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
npm audit --omit=dev

# Backend checks (inside backend/)
ruff check app tests scripts
mypy app
python scripts/export_contract.py --check
radon cc app -n C
vulture app --min-confidence 80
pytest -m "not live" --cov=app --cov-branch --cov-report=term-missing
pip-audit -r requirements.txt
```

---

## Deployment

### Option 1: Render (60-Second Blueprint Deploy — Free Tier)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Shreyash463/saans-urban-air-quality-assistant)

1. Open `https://render.com/deploy?repo=https://github.com/Shreyash463/saans-urban-air-quality-assistant` and authorize GitHub access for the repository.
2. When prompted by [`render.yaml`](render.yaml), paste your server-side `GEMINI_API_KEY` (leave `GEMINI_MODEL` blank to auto-select the newest Flash model).
3. Click **Deploy Blueprint** — Render builds [`Dockerfile`](Dockerfile), serves the React SPA and FastAPI `/api` on a single HTTPS origin, and monitors `/api/health`.

### Option 2: Google Cloud Run

```bash
gcloud run deploy saans-assistant --source . --region asia-south1 --allow-unauthenticated \
  --set-env-vars ENVIRONMENT=production,TRUST_PROXY_HEADERS=true --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

### Option 3: Vercel (Frontend) + Hosted FastAPI Backend

Deploy the static Vite SPA to Vercel while pointing `VITE_API_BASE_URL` at your Cloud Run or Render backend URL (adding the Vercel domain to `ALLOWED_ORIGINS` on the backend):

```bash
vercel --prod   # Build command: npm run build | Output dir: dist | Env: VITE_API_BASE_URL=https://<backend-url>
```

### Option 4: Local Docker

Multi-stage build (Node 24 builds frontend → slim Python 3.13 non-root runtime serves static `dist/` + `/api` on `$PORT`, defaulting to `8000`):

```bash
docker build -t saans-assistant .
docker run --rm -p 8000:8000 -e ENVIRONMENT=production --env-file .env saans-assistant
```

---

## Security Notes

- `GEMINI_API_KEY` stays strictly server-side in `.env` (gitignored); never logged or returned in API errors.
- Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) and stack traces are disabled in `ENVIRONMENT=production`.
- Strict Pydantic v2 schemas (`extra="forbid"`, city regex/length `<= 60`, `householdSize` `1–20`, `commuteKm` `0–300`, `question` `<= 500`, control-char stripping).
- Prompt-injection defense: user text is sanitized, angle-brackets escaped, enclosed in `<user_question>...</user_question>` delimiters, and post-checked against secret/prompt leakage and medical rules.
- Sliding-window per-IP rate limiter (`20 req/min` on `/api/plan` and `/api/chat`, `60 req/min` on `/api/air-quality`, returning `429` + `Retry-After`) with idle-bucket eviction and trusted-proxy rightmost `X-Forwarded-For` validation to block header spoofing.
- Opt-in browser geolocation (`"Use my location"`) requires explicit click, allows `Permissions-Policy: geolocation=(self)`, and never persists coordinates in `localStorage` or logs coordinates (`httpx`/`httpcore` info logging silenced & access-log query params stripped).
- `20 KB` max request body middleware, strict CORS origin allowlist, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS over HTTPS, and strict CSP (`script-src 'self'; style-src 'self'; font-src 'self'`). See [`SECURITY.md`](SECURITY.md).

---

## Accessibility Notes

- Semantic landmarks (`header`, `nav`, `main`, `footer`), sequential heading hierarchy, skip-to-main link, and `aria-current="true"` scroll-spy.
- Polite `aria-live` status announcements for loading stages, plan readiness, clipboard copy, `.txt` export, and chat replies.
- High-contrast focus rings, ≥44px touch targets, color + icon + text CPCB indicators, WCAG 2.2 AA contrast in Light and Dark modes, `320px` reflow & text-spacing resilience, `forced-colors` support, dynamic EN/HI document titles, clean one-column print layout, full reduced-motion support, and automated `axe-core` verification across all states and viewports. See [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).

---

## License

[MIT](LICENSE)
