# Saans System Architecture

## Overview

Saans runs as a single-origin containerized web service (FastAPI serving compiled static Vite/React assets plus JSON `/api/*` endpoints).

```mermaid
flowchart LR
    B["Browser SPA (React 19, Lazy Hindi & Code-Split Sections, Self-Hosted WOFF2)"]
    B -->|"GET / (ETag, no-cache, br/gzip)"| GW["FastAPI Static + Security Middleware\n(CSP, HSTS, XFO, 20KB Cap, Rate Limiter)"]
    B -->|"GET /assets/* (1y immutable, .br)"| GW
    B -->|"GET /api/air-quality?city or POST /api/air-quality (coords)"| AQ["AirQualityService\n(In-Flight Coalescing + 10m TTL Cache)"]
    AQ -->|"India-Preferred Geocode + 24h PM2.5/PM10"| OM["Open-Meteo APIs"]
    AQ -->|"Piecewise Interpolation"| CPCB["Indian CPCB AQI Engine"]
    B -->|"POST /api/plan & /api/chat (no-store)"| PLAN["Plan & Chat Routers\n(Grounded Facts + SHA-256 Plan Cache)"]
    PLAN --> IMP["Grounded Impact Engine\n(contract/impact-factors.json)"]
    PLAN --> GEM["GeminiClient\n(Flash-Lite Priority + Daily Budget + Breaker)"]
    GEM -->|"Validated Narrative + Deterministic Numbers"| SAF["Safety & Medical Boundary Layer"]
    PLAN -->|"On missing key / open circuit / error"| FB["Deterministic Rule Fallback"]
    SAF --> B
    FB --> B
```

## Request Lifecycle (`POST /api/plan`)

```mermaid
sequenceDiagram
    participant U as Browser
    participant API as FastAPI Plan Router
    participant AQ as AirQualityService
    participant CB as ModelCircuitBreaker
    participant G as Google Gemini API
    participant S as Safety & Grounding

    U->>API: POST /api/plan (+ optional JSON body coords)
    API->>AQ: get_air_quality (cache -> coalesced -> Open-Meteo)
    AQ-->>API: AirQualityReading (CPCB AQI)
    API->>API: build_profile_facts(profile)
    API->>API: Lookup SHA-256 plan_cache(profile, aqiBucket)
    alt Cache Miss
        API->>CB: filter_candidates(model_chain)
        alt Healthy Candidate Available
            API->>G: generate_content(compact prompt & schema)
            G-->>API: narrative JSON + usage_metadata tokens
            API->>CB: record_success(model)
            API->>S: inject deterministic healthAdvisory, maskGuidance & contract numbers
            API->>API: Store Gemini plan in TTL plan_cache
        else All Open / Error
            API->>CB: record_failure(429/503/404)
            API->>S: generate_fallback_plan(profile, aqi)
        end
    end
    API-->>U: PlanResponse (Cache-Control: no-store)
```

## Module Boundaries

- **Shared Grounding & Codegen Contract**: [`contract/api.schema.json`](../contract/api.schema.json), [`contract/limits.json`](../contract/limits.json), [`contract/aqi-categories.json`](../contract/aqi-categories.json), [`contract/impact-factors.json`](../contract/impact-factors.json), [`contract/demo-cities.json`](../contract/demo-cities.json), and [`contract/golden-vectors.json`](../contract/golden-vectors.json) act as the single source of truth across FastAPI (`backend/scripts/export_contract.py`) and React TypeScript (`frontend/src/types/generated.ts`, `frontend/src/lib/validation.ts`).
- **Gemini Isolation**: `backend/app/services/gemini/` isolates daily call budgeting (`budget.py`), circuit breaking (`circuit_breaker.py`), model ranking & `ThinkingConfig` (`model_selection.py`), compact output schema (`schema.py`), plan response assembly (`assembler.py`), single-attempt execution (`attempts.py`), and async failover (`client.py`).
- **Single Network Boundary**: All browser `fetch` calls live strictly in `frontend/src/services/api.ts`, with localized copy separated into lazy JSON locales (`frontend/src/locales/en.json`, `frontend/src/locales/hi.json`).
