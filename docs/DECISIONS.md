# Architecture Decision Records

## ADR-001: PM-Based Indian CPCB AQI Calibration via Open-Meteo
- **Context**: Users need real-time local AQI across Indian cities without configuring extra third-party API keys or exposing credentials client-side.
- **Decision**: Query Open-Meteo Geocoding (preferring `IN` matches) + 24-hour hourly PM2.5/PM10 series, compute sub-indices using CPCB piecewise linear breakpoints (`backend/app/services/cpcb.py`), and fall back gracefully to deterministic curated city values when offline.
- **Consequence**: Zero external AQI API key required; readings reflect PM-based estimates (disclosed honestly in UI tooltips and README).

## ADR-002: Per-Model Circuit Breaker & Narrative-Only Gemini Schema
- **Context**: Upstream Gemini Flash capacity varies by model generation (`503 UNAVAILABLE` / `429` burst rate limits / `404` deprecations). Walking dead models on every request previously wasted multiple seconds per call, and asking the LLM for fields overwritten deterministically inflated output tokens.
- **Decision**: Introduce `ModelCircuitBreaker` with differentiated cooldowns (`60s` on `429`, `300s` on `503`/timeout, `900s` on `404`) and half-open single-probe recovery. Trim Gemini's JSON schema to creative narrative fields (`summary`, `routine`, `indoorHacks`, text-only `alternatives`, `communityActions`), generating `healthAdvisory`, `maskGuidance`, `disclaimer`, and numeric savings deterministically in Python.
- **Consequence**: Lower prompt/output tokens, predictable safety guarantees even if LLM text drifts, and immediate fail-fast to healthy models or rule fallback.

## ADR-003: Multiplicative Impact Stacking & Non-Emission CO2 Discipline
- **Context**: Additive stacking of protective habits can produce impossible `> 100%` reductions, and personal shields (masks, purifiers, sealing) do not directly reduce tailpipe/combustion CO2.
- **Decision**: Model PM2.5 reduction multiplicatively (`1 - prod(1 - r_i)`, hard cap `95%`, residual floor `5%`), lock `airFriendlyScore = round(100 - afterExposurePct)`, and force `co2SavedKgPerMonth = 0` on non-emission actions. Community scale multiplies household CO2 linearly (`10–500` homes) as a transparent planning approximation.

## ADR-004: Self-Hosted Subsetted Fonts, Lazy Hindi, & Strict `style-src 'self'` CSP
- **Context**: External Google Fonts requests downloaded a 120 KB Devanagari font even for English sessions and contributed to mobile CLS (`0.107`). Inline style allowances weakened CSP.
- **Decision**: Bundle Latin WOFF2 subsets via `@fontsource` with `font-display: swap` + `<link rel="preload">`, lazy-load `@fontsource/noto-sans-devanagari` + `src/locales/hi.json` through `I18nLoader` (`src/lib/i18n.ts`) only when Hindi is active, precompress assets with Brotli at Vite build time, and enforce `style-src 'self'; font-src 'self'`.

## ADR-005: Ephemeral Opt-In Geolocation
- **Context**: Users outside preset cities or unsure of neighborhood station names benefit from one-tap local AQI without surveillance.
- **Decision**: Provide an opt-in **"Use my location"** button gated by user gesture, forward coordinates ephemerally in `POST /api/air-quality` and `POST /api/plan` JSON bodies (never query strings), display `"Your location (approx.)"`, allow `Permissions-Policy: geolocation=(self)`, and never log coordinates server-side or store them in `localStorage`.

## ADR-006: Removal of In-Browser Mock Generator & Honest Error Recovery
- **Context**: A fallback browser mock risked masking real backend failures as plausible live guidance during network outages or server cold starts, while inflating the initial JS bundle.
- **Decision**: Move mock fixtures strictly under `tests/fixtures/` for unit tests, remove `VITE_USE_MOCK` and in-browser fallbacks from `src/`, throw typed `ApiRequestError` failures in `src/services/api.ts`, and render explicit error/retry states (`PlanErrorState`, Hero retry) while keeping server-side deterministic rules (`services/fallback_plan.py`) for upstream AI interruptions.

## ADR-007: Flash-Lite Priority Chain & UTC Daily Upstream Budget
- **Context**: Experimental Flash models exhibit sporadic `503`/`429` limits on free-tier keys, and uncontrolled traffic spikes can exhaust daily quota.
- **Decision**: Prioritize Flash-Lite models (`GEMINI_MODEL_PRIORITY`) ahead of larger Flash generations during model discovery, honor single-model pinning when `GEMINI_MODEL` is explicitly configured, and enforce an in-memory UTC daily upstream budget (`GEMINI_DAILY_CALL_BUDGET`, default `400`) resetting cleanly at `00:00 UTC`.

## ADR-008: Single-Source Schema Codegen & Golden Cross-Language Vectors
- **Context**: Manually duplicating CPCB breakpoints, Pydantic/TypeScript interfaces, and demo city tables across Python and TypeScript invited drift between frontend validation and backend serialization.
- **Decision**: Generate `contract/api.schema.json`, `contract/limits.json`, `docs/openapi.json`, and `src/types/generated.ts` directly from Pydantic models (`backend/scripts/export_contract.py`), validate runtime browser payloads in `src/lib/validation.ts`, verify full JSON Schema + enum parity in `frontend/src/__tests__/contract.test.ts`, share CPCB ranges and demo cities via `contract/*.json`, and assert parity in both Vitest and Pytest using `contract/golden-vectors.json` verified in CI (`--check`).
