# Changelog

All notable changes to **Saans — Urban Air Quality Assistant** are documented in this file.

## [1.1.0] - 2026-11-25

### Efficiency & Performance (P1)
- Added `ModelCircuitBreaker` (`backend/app/services/gemini/circuit_breaker.py`) with per-error cooldowns (`429` shorter than `503` and `404`), single-pass failover, and active healthy model reporting on `GET /api/health`.
- Narrowed the Gemini prompt and JSON schema (`SIMPLE_PLAN_JSON_SCHEMA`) to creative narrative fields only (`summary`, `routine`, `indoorHacks`, text-only `alternatives`, `communityActions`) while keeping deterministic backend calculation of `healthAdvisory`, `maskGuidance`, `disclaimer`, and `impact-factors.json` metrics.
- Added aggregate token-usage logging (`gemini_usage` counts only, zero prompt/secret logging).
- Parallelized profile grounding with Open-Meteo AQI fetches (`asyncio.gather`) and added in-flight lookup coalescing in `AirQualityService`.
- Added Brotli `.br` precompression in Vite build, `1y immutable` cache headers on `/assets/*`, `no-cache` + `ETag` + `304 Not Modified` on `index.html`, `public, max-age=180` on city AQI queries, and `no-store` on AI POST routes.
- Self-hosted subsetted `@fontsource` Latin WOFF2 fonts with `<link rel="preload">`, eliminated Google Fonts CDN requests, split Hindi UI copy + Noto Sans Devanagari fonts into lazy chunks loaded on demand, and dynamically imported mock fallback generators.
- Eliminated mobile layout shift (`CLS 0.107 -> 0`) and raised Lighthouse Mobile Performance (`91 -> 99`) and Desktop Performance (`95 -> 100`).

### Problem Statement & Community Features (P2)
- Added `CommunityAction` schema (`rwa`, `school`, `workplace`, `neighbours`) and the **"Make it a community effort"** section in the plan dashboard and exports.
- Added the **"Scale it to your community"** multiplier slider (`10–500` households) in the Impact Simulator.
- Added opt-in **"Use my location"** browser geolocation paired with ephemeral `?lat=...&lon=...` Open-Meteo lookups labeled `"Your location (approx.)"` with zero logging or `localStorage` persistence.

### Testing, Security & Hygiene (P3–P5)
- Added `Vitest` v8 coverage enforcement (`>= 80%`), Playwright end-to-end tests (`tests/e2e/saans.spec.ts`) covering Light/Dark/Hindi `axe-core` audits, keyboard navigation, downloads, and geolocation.
- Added Hypothesis property-based tests (`backend/tests/test_properties.py`), circuit-breaker clock tests, real-Gemini regression fixtures, `@pytest.mark.live` marker, and raised backend coverage gate to `>= 90%`.
- Tightened CSP (`style-src 'self'; font-src 'self'`, removing `'unsafe-inline'` and external CDNs), added CodeQL, Dependabot, CI `gitleaks` secret scan, `SECURITY.md`, ADRs, and architecture documentation.

## [1.0.0] - 2026-11-24
- Initial full-stack FastAPI + Google Gemini + React 19 + Vite release deployed on Render.
