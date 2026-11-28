# Saans Performance & Efficiency Engineering

Reproducible backend benchmarks live in [`backend/scripts/bench.py`](../backend/scripts/bench.py).

## Frontend Bundle & Rendering Optimizations

| Optimization                                 | Measured Result                                                                                         | Mechanism                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Initial JS (`index-*.js`)**                | **`300.45 kB`** raw (**`93.10 kB`** Vite gzip; single entry chunk with inlined `HowItWorks`/`Footer`)    | Inlined above-the-fold sections, removed imperative canvas/scroll hooks, lazy-loaded `Dashboard`/`Simulator`/`Chat` and Hindi locales |
| **External Font Requests (English)**         | **`0`** external requests                                                                               | Self-hosted subsetted `@fontsource` Latin WOFF2 files with `<link rel="preload">` and `font-display: swap`                         |
| **Devanagari Fonts & Hindi Copy**            | **`0 B`** on English sessions (`26.29 kB` `hi-*.js` chunk loaded on demand)                             | Dynamic import triggered only when switching language to `hi`                                                                       |
| **Hero Layout & Scroll Rendering**           | Desktop CLS **`0.0168`**, Mobile CLS **`0.0`**, Mobile/Desktop Perf **`100`** (local median)            | Stabilized `HeroAqiPanel` height (`min-h-[428px]`), static CSS gradient `.saans-hero-haze`, native CSS `scroll-behavior` & `scroll()` |
| **Static Compression & Cache Headers**       | Quality-11 `.br` precompression at build time                                                           | `Cache-Control: public, max-age=31536000, immutable` on `/assets/*`; `no-cache` + `ETag` + `304` on `index.html`                  |

## Backend & Gemini Optimizations

- **Model Circuit Breaker (`ModelCircuitBreaker`)**: Differentiated cooldowns (`60s` on `429`, `300s` on `503`/timeout, `900s` on `404`) skip degraded models with zero upstream retry overhead until cooldown recovery.
- **Transient Fallback Non-Stickiness**: Rule fallback plans generated during transient `ai_busy`/`ai_error` outages are not written into the 10-minute `plan_cache` so recovery requests hit Gemini immediately after cooldown; only real Gemini plans and intentional `no_key` fallbacks populate `plan_cache`.
- **Compact Gemini Narrative Schema (`SIMPLE_PLAN_JSON_SCHEMA`)**: Generates creative narrative text (`summary`, `routine`, `indoorHacks`, text-only `alternatives`, `communityActions`) while calculating `healthAdvisory`, `maskGuidance`, `disclaimer`, and `contract/impact-factors.json` metrics deterministically in Python (`-49.1%` prompt size from baseline).
- **Zero-Network Stub Benchmark (`backend/scripts/bench.py`)**:
  - `GET /api/air-quality` avg: **`5.19 ms`**
  - `POST /api/plan` cache miss median: **`7.15 ms`**
  - `POST /api/plan` cache hit median: **`4.99 ms`**
  - `POST /api/chat` avg: **`5.14 ms`**
  - `compute_cpcb_aqi_from_means` per call: **`0.88 µs`**

Live mobile & desktop Lighthouse metrics are verified against `https://saans-urban-air-quality-assistant.onrender.com` after each release.
