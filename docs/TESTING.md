# Saans Testing Strategy & Quality Gates

Saans validates behavior across four layers—pure contract math, React/TypeScript unit & accessibility suites, FastAPI/Python backend suites, and Playwright end-to-end tests against the compiled SPA served by FastAPI.

## Test Layers

1. **Cross-Language Contract & Golden Vectors**
   - `contract/golden-vectors.json` verifies identical CPCB AQI classification (`0–500`) and multiplicative household impact math (`calculateImpact` / `calculate_profile_impact`) across Python (`backend/tests/test_contract.py`) and TypeScript (`frontend/src/__tests__/contract.test.ts`).
   - `contract/limits.json` enforces identical input bounds (`city`, `question`, `householdSize`, `commuteKm`) across Pydantic schemas (`backend/app/schemas.py`), React validation (`frontend/src/lib/validation.ts`), and UI form controls.
   - `backend/scripts/export_contract.py --check` enforces zero drift between Pydantic schemas, `contract/api.schema.json`, `contract/limits.json`, `docs/openapi.json`, and `frontend/src/types/generated.ts`.
   - `frontend/src/__tests__/i18nParity.test.ts` verifies matching EN/HI keys in `en.json` and `hi.json` and encapsulates lazy loading via `I18nLoader`.

2. **Frontend Unit & Component Accessibility (`Vitest` + `axe-core`)**
   - Location: `frontend/src/__tests__/` (focused per-unit test files using [`frontend/tests/fixtures/samplePlan.ts`](../frontend/tests/fixtures/samplePlan.ts) backed by `contract/plan.sample.json`)
   - Coverage threshold: `lines: 90` enforced in `frontend/vitest.config.ts` (current measured: **96.89% lines** overall, **97.38% lines** across `frontend/src/hooks/` across **18** test files / **70** tests).
   - Covers API timeouts/abort/errors, CPCB mapping, impact math, locale parity & `I18nLoader`, contract validation, custom hooks, plan export formatting, and automated `axe-core` sweeps on all sections.

3. **Backend Unit, Integration & Property Tests (`Pytest` + `Hypothesis`)**
   - Location: `backend/tests/` (`test_*.py` organized per module/concern, every test function `<= 40` lines with shared builders in `backend/tests/helpers.py`)
   - Coverage threshold: `fail_under = 94` with `--cov-branch` enforced in `backend/pyproject.toml` (current measured: **95.38% combined line + branch coverage** across **215** offline tests; 1 deselected `@pytest.mark.live` test run with `RUN_LIVE_TESTS=1`).
   - Random order verification: `pytest-randomly` runs the offline test suite in randomized order on every local and CI run.
   - Historical AST mutation sweep across `cpcb.py`, `impact.py`, and `safety.py` killed **44/56** sampled mutants (`cpcb.py`: 12/16, `impact.py`: 15/20, `safety.py`: 17/20), with remaining 12 documented as mathematically equivalent boundary conditions (`<=` vs `<` at continuous piecewise breakpoints/zero).
   - Covers `AirQualityService` caching & in-flight coalescing, CPCB property invariants, Pydantic strictness (`extra="forbid"`), prompt-injection/secret-leak guards, rate limiting & proxy-header spoofing defense, `/.well-known/security.txt`, circuit breaker & plan cache non-stickiness, typed `AppState` DI, and offline fallback endpoints.

4. **End-to-End Browser Workflows (`Playwright`)**
   - Location: `frontend/tests/e2e/saans.spec.ts`
   - Boots the production FastAPI factory (`uvicorn --factory --app-dir ../backend app.main:create_app`) + built `frontend/dist/` bundle on `127.0.0.1:8124` and exercises **8** full workflows:
     1. EN full journey (`Hero -> Plan -> Community & Simulator -> Chat -> Export -> EN/HI & Theme & Reduce Motion & Axe`)
     2. Keyboard navigation & opt-in geolocation (`"Your location (approx.)"`) without persistence
     3. Print stylesheet (`<= 5` A4 pages) & non-overlapping header across `1280/768/390` in EN/HI
     4. Geolocation -> city chip clears coords -> profile edits -> null optional fields
     5. Forced `/api/plan` failure honest error state & `"Try again"` recovery
     6. Hindi full journey with validation, rate-limit `429` retry recovery, & persistence
     7. Geolocation denied honest notice without crash
     8. WCAG 2.2 AA reflow (`320/390/768/1280`), text-spacing override, `>= 24px` target sizes, & `axe-core` across error/loading/ready states.

## Static & Code Quality Gates (Enforced Locally & in CI)

- **Formatting & Lint**: `prettier --check`, `eslint . --max-warnings=0` (`complexity <= 10`, `max-lines-per-function <= 50`, `max-lines <= 300`), `ruff check app tests scripts` (`C901 <= 10`).
- **Type Safety**: `tsc --noEmit`, `mypy app` (strict mode).
- **Duplication & Dead Code**: `jscpd src` (`< 3%` threshold, currently `0.00%`), `knip`, `vulture app --min-confidence 80`, `radon cc app -n C`.
