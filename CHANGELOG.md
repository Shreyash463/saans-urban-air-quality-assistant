# Changelog

All notable changes to **Saans — Urban Air Quality Assistant** are documented in this file.

## [1.2.0] - 2026-11-27

### API & Validation
- Exported numeric input limits (`householdSize`, `commuteKm`, `city`, `question`) from `backend/app/schemas.py` into `contract/limits.json` and `frontend/src/types/generated.ts` as a single source of truth across backend and frontend.
- Fixed cache-miss `latency_ms` logging in `POST /api/plan` to measure elapsed time after plan generation completes, and removed redundant Pydantic dump/re-validate copies.

### Frontend State & Accessibility
- Surface bilingual language-sync failures clearly with retry status banners while preserving active plan context, and cancel stale in-flight requests via `AbortController`.
- Replaced inline font-family declarations with Tailwind font utilities and tightened mobile layout sizing.

### Backend Hygiene & Operations
- Standardized static SPA resolution on `frontend/dist/` across the Docker runtime and FastAPI application factory, extracted shared 404 helper responses, and promoted cache size and per-route rate limits to typed `Settings` fields.

## [1.1.0] - 2026-11-25

### Gemini Resilience & Latency
- Added `ModelCircuitBreaker` (`backend/app/services/gemini/circuit_breaker.py`) with per-error cooldowns (`429` shorter than `503` and `404`), single-pass failover, and active healthy model reporting on `GET /api/health`.
- Narrowed the Gemini prompt and JSON schema (`SIMPLE_PLAN_JSON_SCHEMA`) to creative narrative fields while keeping deterministic backend calculation of `healthAdvisory`, `maskGuidance`, `disclaimer`, and `impact-factors.json` metrics.
- Added aggregate token-usage logging (`gemini_usage` counts only, zero prompt/secret logging), parallel profile grounding + Open-Meteo lookups via `asyncio.gather`, and in-flight request coalescing in `AirQualityService`.

### Frontend Bundle & Caching Performance
- Added Brotli `.br` precompression in Vite build, `1y immutable` cache headers on `/assets/*`, `no-cache` + `ETag` + `304 Not Modified` on `index.html`, `public, max-age=180` on city AQI queries, and `no-store` on AI POST routes.
- Self-hosted subsetted `@fontsource` Latin WOFF2 fonts with `<link rel="preload">`, eliminated Google Fonts CDN requests, and split Hindi UI copy + Noto Sans Devanagari fonts into lazy chunks loaded on demand.
- Eliminated mobile layout shift and tuned critical-path rendering for mobile and desktop Lighthouse performance.

### Community Actions & Privacy-Preserving Geolocation
- Added `CommunityAction` schema (`rwa`, `school`, `workplace`, `neighbours`) and the **"Make it a community effort"** section in the plan dashboard and exports.
- Added the **"Scale it to your community"** multiplier slider (`10–500` households) in the Impact Simulator.
- Added opt-in **"Use my location"** browser geolocation paired with ephemeral JSON POST `coords` Open-Meteo lookups labeled `"Your location (approx.)"`, rejecting URL query-string `lat`/`lon` parameters and omitting coordinates from cache keys, logs, and `localStorage`.

### Security & Verification
- Tightened CSP (`style-src 'self'; font-src 'self'`, zero external CDNs), added CodeQL, CI `gitleaks` secret scan, `SECURITY.md`, `docs/THREAT_MODEL.md`, ADRs, and architecture documentation.
- Expanded automated coverage with Vitest coverage thresholds, Playwright end-to-end tests (`axe-core` Light/Dark/Hindi audits, keyboard navigation, downloads, geolocation), and Hypothesis property-based tests.

## [1.0.0] - 2026-11-24
- Initial full-stack FastAPI + Google Gemini + React 19 + Vite release deployed on Render.
