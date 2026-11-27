# Saans Testing Strategy & Quality Gates

Saans validates behavior across four layers—pure contract math, React/TypeScript unit & accessibility suites, FastAPI/Python backend suites, and Playwright end-to-end tests against the compiled SPA served by FastAPI.

## Test Layers

1. **Cross-Language Contract & Golden Vectors**
   - `contract/golden-vectors.json` verifies identical CPCB AQI classification (`0–500`) and multiplicative household impact math (`calculateImpact` / `calculate_profile_impact`) across Python (`backend/tests/test_p1_efficiency_and_community.py`) and TypeScript (`src/__tests__/contract.test.ts`).
   - `backend/scripts/export_contract.py --check` enforces zero drift between Pydantic schemas, `contract/api.schema.json`, `docs/openapi.json`, and `frontend/src/types/generated.ts`.
   - `frontend/src/__tests__/i18nParity.test.ts` fails if `frontend/src/locales/en.json` and `frontend/src/locales/hi.json` diverge.

2. **Frontend Unit & Component Accessibility (`Vitest` + `axe-core`)**
   - Location: `frontend/src/__tests__/`
   - Coverage threshold: `lines: 90` enforced in `frontend/vitest.config.ts` (current measured: **95.93% lines** overall, **94.84% lines** across `frontend/src/hooks/` across 15 test files / 81 tests).
   - Covers API error propagation & timeouts, CPCB mapping, impact math, locale parity, validation boundaries, hooks (`useDebounce`, `useLocalPrefs`, `useReducedMotion`, `useSmoothScroll`, `useScrollSpy`, `useReveal`, `useGeolocationAqi`, `useChatController`), export formatting, and automated `axe-core` sweeps on all sections.

3. **Backend Unit, Integration & Property Tests (`Pytest` + `Hypothesis`)**
   - Location: `backend/tests/`
   - Coverage threshold: `fail_under = 94` with `--cov-branch` enforced in `backend/pyproject.toml` (current measured: **95.34% combined line + branch coverage** across 191 offline tests; 1 deselected `@pytest.mark.live` test run with `RUN_LIVE_TESTS=1`).
   - Random order verification: `pytest-randomly` runs the offline test suite in randomized order on every local and CI run.
   - Mutation testing: Targeted AST mutation sweep across `cpcb.py`, `impact.py`, and `safety.py` killed **44/56** sampled mutants (`cpcb.py`: 12/16, `impact.py`: 15/20, `safety.py`: 17/20), with remaining 12 documented as mathematically equivalent boundary conditions (`<=` vs `<` at continuous piecewise breakpoints/zero). Note: `mutmut` requires POSIX `os.fork()` (unavailable natively on Windows), so automated AST mutation testing runs in Python directly on Windows without needing WSL.
   - Covers `AirQualityService` caching & in-flight coalescing, CPCB property invariants, Pydantic strictness (`extra="forbid"`), prompt-injection/secret-leak guards, rate limiting & proxy-header spoofing defense, `/.well-known/security.txt`, circuit breaker & daily budget behavior, and offline fallback endpoints.

4. **End-to-End Browser Workflows (`Playwright`)**
   - Location: `frontend/tests/e2e/saans.spec.ts`
   - Boots the production FastAPI + built SPA bundle on `127.0.0.1:8124` and exercises 7 full workflows: EN/HI full journeys, theme/reduced-motion/profile persistence, keyboard navigation, opt-in & denied geolocation handling, print stylesheet (`<= 5` pages), viewport checks (`390`, `768`, `1280`), `503` + `429` error & retry recovery, and `axe-core` scans.

## Static & Code Quality Gates (Enforced Locally & in CI)

- **Formatting & Lint**: `prettier --check`, `eslint src --max-warnings=0` (`complexity <= 10`, `max-lines-per-function <= 50`, `max-lines <= 300`), `ruff check app tests scripts` (`C901 <= 10`).
- **Type Safety**: `tsc --noEmit`, `mypy app`.
- **Duplication & Dead Code**: `jscpd src` (`< 3%` threshold, currently `0.00%`), `knip`, `vulture app --min-confidence 80`, `radon cc app -n C`.
