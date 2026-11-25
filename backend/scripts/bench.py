"""Backend micro-benchmark for /api/plan (uncached & cached), /api/chat, /api/air-quality, and CPCB math.

Usage:
    python scripts/bench.py           # Stubbed zero-network benchmark (fast, deterministic)
    python scripts/bench.py --live    # Optional real Gemini + Open-Meteo latency & token check
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Settings, get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.cpcb import compute_cpcb_aqi_from_means  # noqa: E402
from app.services.gemini_client import GeminiClient  # noqa: E402

SAMPLE_PROFILE: dict[str, Any] = {
    "city": "Delhi",
    "householdSize": 4,
    "hasChildren": True,
    "hasElderly": False,
    "hasRespiratoryCondition": False,
    "commuteMode": "car",
    "commuteKm": 18,
    "homeType": "apartment",
    "hasAirPurifier": False,
    "cookingFuel": "lpg",
    "budget": "medium",
    "language": "en",
}


def _build_stub_http() -> httpx.AsyncClient:
    times = [f"2026-11-24T{h:02d}:00" for h in range(24)]

    def handler(request: httpx.Request) -> httpx.Response:
        if "geocoding-api" in request.url.host:
            return httpx.Response(
                200,
                json={"results": [{"name": "Delhi", "country_code": "IN", "country": "India", "latitude": 28.65, "longitude": 77.23}]},
            )
        return httpx.Response(
            200,
            json={"utc_offset_seconds": 19800, "hourly": {"time": times, "pm2_5": [115.0] * 24, "pm10": [160.0] * 24}},
        )

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _build_stub_gemini() -> GeminiClient:
    payload = {
        "summary": "Delhi shows elevated winter PM2.5; prioritize closed windows early/late and midday ventilation.",
        "routine": [
            {"timeSlot": "morning", "title": "Recirculate cabin AC", "detail": "Set AC inside traffic.", "impactNote": "Cuts in-cabin spikes."},
            {"timeSlot": "midday", "title": "1-4 PM vent", "detail": "Cross-ventilate 20 min.", "impactNote": "Flushes CO2."},
            {"timeSlot": "evening", "title": "Seal by 5:30 PM", "detail": "Shut windows + exhaust.", "impactNote": "Blocks inversion."},
            {"timeSlot": "night", "title": "Sealed bedroom", "detail": "Use draft stopper + HEPA.", "impactNote": "Cleaner sleep."},
        ],
        "indoorHacks": [
            {"title": f"Hack {i}", "howTo": "Practice daily.", "estimatedBenefit": "~20% less dust", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": "Car", "swap": "Metro 3x/wk", "why": "Cuts exhaust."},
            {"current": "LPG", "swap": "Electric kettle", "why": "Cleaner kitchen."},
            {"current": "Unfiltered room", "swap": "DIY HEPA fan", "why": "Lower night dose."},
            {"current": "Leaf fires", "swap": "Compost", "why": "Prevents block spikes."},
        ],
        "communityActions": [
            {"title": "RWA heater", "who": "rwa", "howTo": "Provide cabin heaters.", "estimatedImpact": "Zero bonfires.", "effort": "low"},
            {"title": "Lane alerts", "who": "neighbours", "howTo": "Report open burning.", "estimatedImpact": "Less street smoke.", "effort": "low"},
            {"title": "School indoor rule", "who": "school", "howTo": "Move play indoors.", "estimatedImpact": "Protects kids.", "effort": "medium"},
        ],
    }

    class _StubModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._sent = False
                    return self

                async def __anext__(self) -> Any:
                    if self._sent:
                        raise StopAsyncIteration
                    self._sent = True
                    return type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})()

            return _Pager()

        async def generate_content(self, **_kwargs: Any) -> Any:
            if "contents" in _kwargs and "<user_question>" in str(_kwargs["contents"]):
                return type("Resp", (), {"text": "Keep outdoor play indoors today in Delhi and prefer fitted N95 masks."})()
            return type("Resp", (), {"text": json.dumps(payload)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _StubModels()})()})()
    return GeminiClient(Settings(gemini_api_key="stub-benchmark-key"), sdk_client=sdk)


def run_stub_benchmarks() -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        dist = Path(tmp) / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("<!doctype html><html><body>Saans</body></html>", encoding="utf-8")

        app = create_app(
            settings=Settings(gemini_api_key="stub-benchmark-key"),
            gemini_client=_build_stub_gemini(),
            http_client=_build_stub_http(),
            dist_dir=dist,
        )
        with TestClient(app) as client:
            t_aq0 = time.perf_counter()
            for _ in range(10):
                client.get("/api/air-quality?city=Delhi")
            aq_ms = (time.perf_counter() - t_aq0) * 100.0

            plan_misses: list[float] = []
            plan_hits: list[float] = []
            for idx in range(5):
                prof = {**SAMPLE_PROFILE, "commuteKm": 10 + idx}
                t0 = time.perf_counter()
                r1 = client.post("/api/plan", json=prof)
                if r1.status_code != 200:
                    raise RuntimeError(f"Expected 200 from /api/plan, got {r1.status_code}")
                plan_misses.append((time.perf_counter() - t0) * 1000.0)

                t1 = time.perf_counter()
                r2 = client.post("/api/plan", json=prof)
                if r2.status_code != 200:
                    raise RuntimeError(f"Expected 200 from cached /api/plan, got {r2.status_code}")
                plan_hits.append((time.perf_counter() - t1) * 1000.0)

            sample_plan = client.post("/api/plan", json=SAMPLE_PROFILE).json()
            t_chat0 = time.perf_counter()
            for _ in range(5):
                rc = client.post(
                    "/api/chat",
                    json={"question": "Can kids play outside?", "profile": SAMPLE_PROFILE, "plan": sample_plan},
                )
                if rc.status_code != 200:
                    raise RuntimeError(f"Expected 200 from /api/chat, got {rc.status_code}")
            chat_ms = (time.perf_counter() - t_chat0) * 200.0

    t_cpcb0 = time.perf_counter()
    for pm in range(1, 350):
        compute_cpcb_aqi_from_means(float(pm), float(pm) * 1.3)
    cpcb_us = ((time.perf_counter() - t_cpcb0) * 1_000_000.0) / 349.0

    return {
        "stub_air_quality_avg_ms": round(aq_ms, 2),
        "stub_plan_uncached_median_ms": round(statistics.median(plan_misses), 2),
        "stub_plan_cached_median_ms": round(statistics.median(plan_hits), 2),
        "stub_chat_avg_ms": round(chat_ms, 2),
        "cpcb_calc_us_per_call": round(cpcb_us, 2),
    }


async def run_live_probe() -> dict[str, Any]:
    settings = get_settings()
    if not settings.effective_gemini_api_key:
        return {"live_skipped": "No GEMINI_API_KEY configured"}
    with tempfile.TemporaryDirectory() as tmp:
        dist = Path(tmp) / "dist"
        dist.mkdir()
        app = create_app(settings=settings, dist_dir=dist)
        with TestClient(app) as client:
            t0 = time.perf_counter()
            r1 = client.post("/api/plan", json=SAMPLE_PROFILE)
            cold_ms = (time.perf_counter() - t0) * 1000.0
            body = r1.json()
            t1 = time.perf_counter()
            r2 = client.post("/api/plan", json=SAMPLE_PROFILE)
            cached_ms = (time.perf_counter() - t1) * 1000.0
            if r2.status_code != 200:
                raise RuntimeError(f"Expected 200 from live cached /api/plan, got {r2.status_code}")
            return {
                "live_plan_status": r1.status_code,
                "live_generated_by": body.get("generatedBy"),
                "live_cold_ms": round(cold_ms, 1),
                "live_cached_ms": round(cached_ms, 1),
                "live_healthy_model": client.get("/api/health").json().get("selectedModel"),
                "live_community_actions": len(body.get("communityActions", [])),
            }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="Also run one live Gemini plan probe.")
    args = parser.parse_args()
    results = run_stub_benchmarks()
    if args.live:
        results.update(asyncio.run(run_live_probe()))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
