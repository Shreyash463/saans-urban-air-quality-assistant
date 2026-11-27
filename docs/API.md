# Saans API Reference

All endpoints use camelCase JSON validated against Pydantic v2 schemas (`backend/app/schemas.py`) and synchronized via [`contract/api.schema.json`](../contract/api.schema.json) and [`openapi.json`](openapi.json).

---

## `GET /api/health`

Returns service readiness, active healthy Gemini model selection, UTC daily quota status, and short commit SHA (`commitSha`, reading `RENDER_GIT_COMMIT[:7]` or `"dev"`). Sets `Cache-Control: no-cache`.

```json
{
  "status": "ok",
  "geminiConfigured": false,
  "selectedModel": null,
  "commitSha": "dev"
}
```

_(When `geminiConfigured` is `false` or fields are `None`, optional nullable keys may be omitted by `response_model_exclude_none=True`.)_

---

## `GET /api/air-quality?city=Pune` & `POST /api/air-quality`

Fetches live Open-Meteo 24-hour hourly PM2.5 and PM10 observations calibrated to the Indian CPCB AQI scale (10-minute TTL cache + in-flight coalescing), or falls back cleanly to curated `"demo"` city readings when offline.

- **City lookup (`GET /api/air-quality?city=Pune`)**: `Cache-Control: public, max-age=180`. Rejects `lat`/`lon` URL query parameters with HTTP `422`.
- **Coordinate lookup (`POST /api/air-quality`)**: Accepts JSON body `{ "lat": 28.6139, "lon": 77.2090 }`, returns `"Your location (approx.)"`, sets `Cache-Control: no-store`, and never logs or persists coordinates.

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

---

## `POST /api/plan`

Generates a personalized clean-air plan (`Cache-Control: no-store`).

### Request (`PlanRequest`)

Extends `UserProfile` with optional ephemeral `coords: { "lat": ..., "lon": ... }` and `preferCoords`:

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

Validation limits are exported from `backend/app/schemas.py` into [`contract/limits.json`](../contract/limits.json): `city` `1–60`, `householdSize` `1–20`, `commuteKm` `0–300`, `question` `1–500`.

### Response (`PlanResponse`)

Returns `aqi`, `summary`, deterministic `healthAdvisory`, 4-slot `routine`, `indoorHacks` (`5–7` items), grounded `alternatives` (`3–5` items, capped via `contract/impact-factors.json`), optional `communityActions`, deterministic `maskGuidance`, `disclaimer`, and provenance (`generatedBy`: `"gemini" | "rules"`, optional `fallbackReason`, optional `retryAfterSeconds`).

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

---

## `POST /api/chat`

Answers grounded follow-up questions (`Cache-Control: no-store`).

- **Request (`ChatRequest`)**: `{ "question": "...", "profile": UserProfile, "plan": PlanResponse }`
- **Response (`ChatReply`)**: `{ "answer": "..." }`
- Applies `<user_question>` delimiter isolation, prompt-injection & medical emergency screening (`108` / emergency escalation), and deterministic fallback replies if Gemini is unavailable.

---

## OpenAPI Specification

The committed OpenAPI 3.1 contract generated from `app.main:create_app()` lives at [`docs/openapi.json`](openapi.json) (`ENVIRONMENT=development` also enables `/docs` and `/redoc` locally).
