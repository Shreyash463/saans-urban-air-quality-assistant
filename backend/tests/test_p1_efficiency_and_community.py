"""Tests for P1 efficiency (circuit breaker, rate limiter sweep, coalescing, tokens, .br) & P2 location/community."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx
import pytest
from app.config import Settings, get_settings
from app.main import create_app
from app.schemas import AirQualityReading, UserProfile
from app.services.air_quality import APPROX_LOCATION_LABEL, AirQualityService
from app.services.cache import TTLCache
from app.services.fallback_plan import generate_fallback_plan
from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini_client import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter
from fastapi.testclient import TestClient
from tests.conftest import build_mock_http_client


def _sample_profile(lang: str = "en") -> UserProfile:
    return UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 4,
            "hasChildren": True,
            "hasElderly": False,
            "hasRespiratoryCondition": True,
            "commuteMode": "car",
            "commuteKm": 18,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": lang,
        }
    )


def _sample_reading() -> AirQualityReading:
    return AirQualityReading(
        city="Delhi",
        aqi=342,
        dominantPollutant="PM2.5",
        updated_at="2026-11-25T15:00:00+05:30",
        source="live",
        sourceDetail="Open-Meteo",
    )


def test_circuit_breaker_open_half_open_close_with_injected_clock() -> None:
    now = 100.0
    breaker = ModelCircuitBreaker(
        rate_limit_cooldown_s=60.0,
        unavailable_cooldown_s=300.0,
        not_found_cooldown_s=900.0,
        clock=lambda: now,
    )

    assert breaker.state_of("gemini-3.8-flash") == "closed"
    breaker.record_failure("gemini-3.8-flash", "rate_limit")
    breaker.record_failure("gemini-3.5-flash", "unavailable")
    breaker.record_failure("gemini-2.5-flash", "not_found")

    assert breaker.state_of("gemini-3.8-flash") == "open"
    assert not breaker.is_available("gemini-3.8-flash")

    now = 161.0
    assert breaker.state_of("gemini-3.8-flash") == "half_open"
    assert breaker.is_available("gemini-3.8-flash")
    assert breaker.state_of("gemini-3.5-flash") == "open"
    assert breaker.state_of("gemini-2.5-flash") == "open"

    breaker.record_success("gemini-3.8-flash")
    assert breaker.state_of("gemini-3.8-flash") == "closed"

    now = 405.0
    assert breaker.state_of("gemini-3.5-flash") == "half_open"
    breaker.record_failure("gemini-3.5-flash", "unavailable")
    assert breaker.state_of("gemini-3.5-flash") == "open"
    assert breaker.state_of("gemini-2.5-flash") == "open"
    assert breaker.first_healthy(["gemini-3.5-flash", "gemini-2.5-flash"], None) is None

    now = 1001.0
    assert breaker.state_of("gemini-2.5-flash") == "half_open"


@pytest.mark.asyncio
async def test_circuit_breaker_skips_failing_models_and_exposes_healthy_model_in_health(
    tmp_path: Path,
) -> None:
    now = 1000.0
    calls: list[str] = []

    compact_narrative = {
        "summary": "Compact Gemini response for Delhi winter smog.",
        "routine": [
            {"timeSlot": "morning", "title": "Recirculate", "detail": "Shut windows 6-10 AM.", "impactNote": "Cuts peaks."},
            {"timeSlot": "midday", "title": "Ventilate", "detail": "Open 1-4 PM.", "impactNote": "Flushes CO2."},
            {"timeSlot": "evening", "title": "Seal", "detail": "Close by 5:30 PM.", "impactNote": "Blocks haze."},
            {"timeSlot": "night", "title": "Sleep clean", "detail": "Run DIY HEPA.", "impactNote": "Cuts dose."},
        ],
        "indoorHacks": [
            {"title": f"Hack {i}", "howTo": "Daily step.", "estimatedBenefit": "~20% less dust", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": "Car", "swap": "Metro 3x/week", "why": "Lower NO2."},
            {"current": "LPG", "swap": "Kettle boiling", "why": "Cleaner kitchen."},
            {"current": "Unfiltered sleep", "swap": "Box-fan HEPA", "why": "Night recovery."},
            {"current": "Leaf fires", "swap": "Compost", "why": "Stops lane smog."},
        ],
        "communityActions": [
            {"title": "RWA heaters", "who": "rwa", "howTo": "Buy guard heaters.", "estimatedImpact": "Zero fires", "effort": "low"},
            {"title": "Lane alerts", "who": "neighbours", "howTo": "Report trash fires.", "estimatedImpact": "Lower PM2.5", "effort": "low"},
            {"title": "School indoor", "who": "school", "howTo": "Indoor recess >200 AQI.", "estimatedImpact": "Protects kids", "effort": "medium"},
        ],
    }

    class _FakeErr(Exception):
        def __init__(self, msg: str, code: int) -> None:
            super().__init__(msg)
            self.code = code

    class _SdkModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._idx = 0
                    self._items = [
                        type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})(),
                        type("M", (), {"name": "models/gemini-3.5-flash-lite", "supported_actions": ["generateContent"]})(),
                    ]
                    return self

                async def __anext__(self) -> Any:
                    if self._idx >= len(self._items):
                        raise StopAsyncIteration
                    item = self._items[self._idx]
                    self._idx += 1
                    return item

            return _Pager()

        async def generate_content(self, **kwargs: Any) -> Any:
            model = kwargs["model"]
            calls.append(model)
            if model == "gemini-3.8-flash":
                raise _FakeErr("Service Unavailable", 503)
            usage = type("U", (), {"prompt_token_count": 320, "candidates_token_count": 410, "thoughts_token_count": 12, "total_token_count": 742})()
            return type("Resp", (), {"text": json.dumps(compact_narrative), "usage_metadata": usage})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _SdkModels()})()})()
    client = GeminiClient(Settings(gemini_api_key="test-placeholder"), sdk_client=sdk, clock=lambda: now)
    dist = tmp_path / "dist"
    dist.mkdir()
    app = create_app(
        settings=Settings(gemini_api_key="test-placeholder"),
        gemini_client=client,
        http_client=build_mock_http_client(),
        dist_dir=dist,
    )

    with TestClient(app) as tc:
        health_before = tc.get("/api/health").json()
        assert health_before["selectedModel"] == "gemini-3.8-flash"
        assert health_before["commitSha"] == "dev"

        plan = await client.generate_plan(_sample_profile(), _sample_reading())
        assert plan is not None
        assert len(plan.community_actions) == 3
        assert "avoid outdoor exertion" in plan.mask_guidance.lower()

        plan2 = await client.generate_plan(_sample_profile(), _sample_reading())
        assert plan2 is not None
        assert calls == ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]

        health_after = tc.get("/api/health").json()
        assert health_after["selectedModel"] == "gemini-3.5-flash-lite"


@pytest.mark.asyncio
async def test_chat_failover_and_all_open_circuit_fallback() -> None:
    now = 500.0
    attempts: list[tuple[str, bool]] = []

    class _ChatModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._i = 0
                    self._items = [
                        type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})(),
                        type("M", (), {"name": "models/gemini-2.5-flash", "supported_actions": ["generateContent"]})(),
                    ]
                    return self

                async def __anext__(self) -> Any:
                    if self._i >= len(self._items):
                        raise StopAsyncIteration
                    item = self._items[self._i]
                    self._i += 1
                    return item

            return _Pager()

        async def generate_content(self, **kwargs: Any) -> Any:
            model = kwargs["model"]
            has_thinking = getattr(kwargs.get("config"), "thinking_config", None) is not None
            attempts.append((model, has_thinking))
            if model == "gemini-3.8-flash":
                if has_thinking:
                    raise ValueError("Thinking level not supported")
                raise TimeoutError("3.8 overloaded")
            return type("Resp", (), {"text": "Keep kids indoors and use a snugly fitted N95 mask."})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _ChatModels()})()})()
    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=sdk, clock=lambda: now)
    profile = _sample_profile()
    plan = generate_fallback_plan(profile, _sample_reading())

    reply = await client.generate_chat_reply("Can my child jog today?", profile, plan)
    assert reply is not None
    assert "n95" in reply.answer.lower()
    assert attempts[0] == ("gemini-3.8-flash", True)
    assert attempts[1] == ("gemini-3.8-flash", False)

    # All models open in breaker immediately skips generation without upstream calls
    breaker = ModelCircuitBreaker(clock=lambda: now)
    breaker.record_failure("gemini-3.6-flash", "not_found")
    client_all_open = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_model="gemini-3.6-flash"),
        sdk_client=sdk,
        breaker=breaker,
        clock=lambda: now,
    )
    breaker.record_failure("gemini-3.5-flash", "unavailable")
    breaker.record_failure("gemini-3.8-flash", "unavailable")
    breaker.record_failure("gemini-3.7-flash", "unavailable")
    breaker.record_failure("gemini-3.5-flash-lite", "unavailable")
    assert await client_all_open.generate_plan(profile, _sample_reading()) is None
    assert await client_all_open.generate_chat_reply("Hi", profile, plan) is None


@pytest.mark.asyncio
async def test_token_logging_never_logs_prompt_or_secret(caplog: pytest.LogCaptureFixture) -> None:
    compact = {
        "summary": "UniqueSecretPromptMarkerXYZ in Delhi",
        "routine": [
            {"timeSlot": slot, "title": "T", "detail": "D", "impactNote": "I"}
            for slot in ("morning", "midday", "evening", "night")
        ],
        "indoorHacks": [
            {"title": f"H{i}", "howTo": "Do", "estimatedBenefit": "Clean", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": "C", "swap": "S", "why": "W"} for _ in range(3)
        ],
    }

    class _M:
        async def list(self) -> Any:
            raise TimeoutError("skip discovery")

        async def generate_content(self, **_kwargs: Any) -> Any:
            u = type("U", (), {"prompt_token_count": 290, "candidates_token_count": 350, "thoughts_token_count": 0, "total_token_count": 640})()
            return type("Resp", (), {"text": json.dumps(compact), "usage_metadata": u})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _M()})()})()
    g = GeminiClient(Settings(gemini_api_key="AIzaFakeKeyNeverLogged"), sdk_client=sdk)
    with caplog.at_level(logging.INFO):
        plan = await g.generate_plan(_sample_profile(), _sample_reading())
    assert plan is not None
    joined = "\n".join(caplog.messages)
    assert "prompt_tokens=290" in joined
    assert "output_tokens=350" in joined
    assert "AIzaFakeKeyNeverLogged" not in joined
    assert "UniqueSecretPromptMarkerXYZ" not in joined


@pytest.mark.asyncio
async def test_rate_limiter_evicts_expired_idle_buckets() -> None:
    now = 0.0
    limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=10.0, clock=lambda: now)
    assert (await limiter.check("10.0.0.1")) == (True, 0)
    assert (await limiter.check("10.0.0.2")) == (True, 0)
    assert limiter.active_bucket_count == 2

    now = 25.0
    assert (await limiter.check("10.0.0.3")) == (True, 0)
    assert limiter.active_bucket_count == 1
    await limiter.reset()
    assert limiter.active_bucket_count == 0


@pytest.mark.asyncio
async def test_air_quality_coords_endpoint_and_in_flight_coalescing(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="app"):
        r = client.get("/api/air-quality?lat=28.6139&lon=77.2090")
    assert r.status_code == 200
    data = r.json()
    assert data["city"] == APPROX_LOCATION_LABEL
    assert data["source"] == "live"
    assert "max-age=" in r.headers.get("cache-control", "")
    app_logs = "\n".join(rec.getMessage() for rec in caplog.records if not rec.name.startswith("httpx"))
    assert "28.6139" not in app_logs
    assert "77.209" not in app_logs

    assert client.get("/api/air-quality?lat=28.61").status_code == 422

    # Plan endpoint accepts paired coordinates cleanly without leaking to logs
    prof = _sample_profile().model_dump(by_alias=True)
    caplog.clear()
    with caplog.at_level(logging.INFO, logger="app"):
        pr = client.post("/api/plan?lat=28.6139&lon=77.2090", json=prof)
    assert pr.status_code == 200
    assert pr.json()["aqi"]["city"] == APPROX_LOCATION_LABEL
    assert pr.headers.get("cache-control") == "no-store"
    plan_app_logs = "\n".join(rec.getMessage() for rec in caplog.records if not rec.name.startswith("httpx"))
    assert "28.6139" not in plan_app_logs

    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if "geocoding-api" in request.url.host:
            return httpx.Response(200, json={"results": [{"name": "Pune", "country_code": "IN", "latitude": 18.52, "longitude": 73.85}]})
        times = [f"2026-11-24T{h:02d}:00" for h in range(24)]
        return httpx.Response(200, json={"utc_offset_seconds": 19800, "hourly": {"time": times, "pm2_5": [40.0] * 24, "pm10": [55.0] * 24}})

    svc = AirQualityService(cache=TTLCache(ttl_seconds=600))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        res1, res2 = await asyncio.gather(
            svc.get_air_quality("Pune", http),
            svc.get_air_quality("Pune", http),
        )
    assert res1 == res2
    assert calls == 2


def test_spa_cache_headers_brotli_precompression_and_etag_304(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    index_html = dist / "index.html"
    index_html.write_text("<!doctype html><html><body>Saans</body></html>", encoding="utf-8")
    (dist / "index.html.br").write_bytes(b"fake-br-html")
    js_file = assets / "app-123.js"
    js_file.write_text("console.log('saans');", encoding="utf-8")
    (assets / "app-123.js.br").write_bytes(b"fake-br-js")

    app = create_app(settings=Settings(), http_client=build_mock_http_client(), dist_dir=dist)
    with TestClient(app) as tc:
        r_idx = tc.get("/", headers={"Accept-Encoding": "br, gzip"})
        assert r_idx.status_code == 200
        assert r_idx.headers["cache-control"] == "no-cache"
        etag = r_idx.headers["etag"]

        r_304 = tc.get("/", headers={"If-None-Match": etag, "Accept-Encoding": "br"})
        assert r_304.status_code == 304

        r_js = tc.get("/assets/app-123.js", headers={"Accept-Encoding": "br"})
        assert r_js.status_code == 200
        assert r_js.headers["cache-control"] == "public, max-age=31536000, immutable"
        assert r_js.headers.get("content-encoding") == "br"

        r_plain = tc.get("/assets/app-123.js", headers={"Accept-Encoding": "identity"})
        assert r_plain.status_code == 200
        assert "content-encoding" not in r_plain.headers


@pytest.mark.parametrize(
    ("fixture", "lang"),
    [
        (
            {
                "summary": "Pune's live AQI is Satisfactory (58). Since you already ride public transit, cook on induction, and run a purifier, focus on filter maintenance.",
                "routine": [
                    {"timeSlot": "morning", "title": "Mask on metro walk", "detail": "Wear N95 to the station.", "impactNote": "Cuts roadside PM2.5."},
                    {"timeSlot": "midday", "title": "Ventilate 1-4 PM", "detail": "Cross-ventilate flat.", "impactNote": "Refreshes CO2."},
                    {"timeSlot": "evening", "title": "Close balcony", "detail": "Shut windows at dusk.", "impactNote": "Blocks rush haze."},
                    {"timeSlot": "night", "title": "Clean pre-filter", "detail": "Run bedroom purifier.", "impactNote": "Maintains CADR."},
                ],
                "indoorHacks": [
                    {"title": f"Hack {i}", "howTo": "Simple free habit.", "estimatedBenefit": "Lower dust", "costLevel": "free"}
                    for i in range(5)
                ],
                "alternatives": [
                    {"current": "Cloth mask outdoors", "swap": "Fitted N95", "why": "Blocks PM2.5."},
                    {"current": "Unvented frying", "swap": "Run kitchen chimney", "why": "Clears tadka oil."},
                    {"current": "Leaky balcony door", "swap": "EPDM tape", "why": "Stops drafts."},
                    {"current": "Leaf fires", "swap": "Composting", "why": "No street smoke."},
                ],
                "communityActions": [
                    {"title": "RWA compost", "who": "rwa", "howTo": "Collect garden leaves.", "estimatedImpact": "Zero burning", "effort": "low"},
                    {"title": "School indoor", "who": "school", "howTo": "Move play inside on Poor+ days.", "estimatedImpact": "Protects kids", "effort": "medium"},
                    {"title": "Lane alerts", "who": "neighbours", "howTo": "Alert on trash smoke.", "estimatedImpact": "Clean block", "effort": "low"},
                ],
            },
            "en",
        ),
        (
            {
                "summary": "दिल्ली में सर्दियों का स्मॉग अधिक है; यह योजना आपके परिवार और समुदाय की सुरक्षा पर केंद्रित है।",
                "routine": [
                    {"timeSlot": "morning", "title": "सुबह खिड़कियां बंद", "detail": "कार AC रीसर्कुलेट रखें।", "impactNote": "धुआं कम होता है।"},
                    {"timeSlot": "midday", "title": "दोपहर वेंटिलेशन", "detail": "1-4 बजे खिड़कियां खोलें।", "impactNote": "ताज़ी हवा।"},
                    {"timeSlot": "evening", "title": "शाम सीलिंग", "detail": "5:30 बजे बंद करें।", "impactNote": "स्मॉग रुकता है।"},
                    {"timeSlot": "night", "title": "स्वच्छ शयन कक्ष", "detail": "DIY HEPA चलाएं।", "impactNote": "कम संपर्क।"},
                ],
                "indoorHacks": [
                    {"title": f"उपाय {i}", "howTo": "गीला पोंछा लगाएं।", "estimatedBenefit": "धूल कम", "costLevel": "free"}
                    for i in range(5)
                ],
                "alternatives": [
                    {"current": "कार", "swap": "मेट्रो", "why": "कम धुआं"},
                    {"current": "गैस", "swap": "इलेक्ट्रिक केतली", "why": "स्वच्छ रसोई"},
                    {"current": "बिना फ़िल्टर सोना", "swap": "DIY HEPA", "why": "साफ नींद"},
                    {"current": "पत्ते जलाना", "swap": "खाद", "why": "कम प्रदूषण"},
                ],
                "communityActions": [
                    {"title": "RWA हीटर", "who": "rwa", "howTo": "गार्ड के लिए हीटर दें।", "estimatedImpact": "अलाव बंद", "effort": "low"},
                    {"title": "पड़ोसी समूह", "who": "neighbours", "howTo": "कचरा जलने पर रोक।", "estimatedImpact": "साफ हवा", "effort": "low"},
                    {"title": "स्कूल नियम", "who": "school", "howTo": "उच्च AQI पर इनडोर खेल।", "estimatedImpact": "बच्चों की सुरक्षा", "effort": "medium"},
                ],
            },
            "hi",
        ),
    ],
)
@pytest.mark.asyncio
async def test_real_gemini_response_fixtures_assemble_cleanly(
    fixture: dict[str, Any],
    lang: str,
) -> None:
    class _FixtureModels:
        async def list(self) -> Any:
            raise TimeoutError("skip")

        async def generate_content(self, **_kwargs: Any) -> Any:
            return type("Resp", (), {"text": json.dumps(fixture)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _FixtureModels()})()})()
    client = GeminiClient(Settings(gemini_api_key="fixture-key"), sdk_client=sdk)
    plan = await client.generate_plan(_sample_profile(lang=lang), _sample_reading())
    assert plan is not None
    assert plan.generated_by == "gemini"
    assert len(plan.community_actions) == 3
    assert plan.alternatives[2].co2_saved_kg_per_month == 0


def test_vary_header_deduplicated_and_413_has_security_headers(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<html><body>Saans</body></html>", encoding="utf-8")
    settings = Settings(
        gemini_api_key="",
        allowed_origins="https://example.com",
        max_body_bytes=1024,
    )
    app = create_app(settings=settings, http_client=build_mock_http_client(), dist_dir=dist_dir)
    with TestClient(app) as client:
        res_ok = client.get("/", headers={"Origin": "https://example.com", "Accept-Encoding": "gzip"})
        assert res_ok.status_code == 200
        vary_tokens = [v.strip().lower() for v in res_ok.headers.get("vary", "").split(",") if v.strip()]
        assert vary_tokens.count("origin") <= 1

        res_413 = client.post(
            "/api/plan",
            content=b"{" + b"a" * 1200 + b"}",
            headers={"Content-Type": "application/json", "Origin": "https://example.com"},
        )
        assert res_413.status_code == 413
        assert res_413.headers.get("x-content-type-options") == "nosniff"
        assert res_413.headers.get("x-frame-options") == "DENY"


def test_retry_hint_extraction_clamping_and_daily_quota_detection() -> None:
    from app.services.gemini.model_selection import (
        extract_retry_after_seconds,
        is_daily_quota_exhausted,
    )

    class _RateErr(Exception):
        def __init__(self, msg: str, code: int = 429, details: Any = None, headers: Any = None) -> None:
            super().__init__(msg)
            self.code = code
            self.details = details
            self.response = type("R", (), {"headers": headers})() if headers else None

    assert extract_retry_after_seconds(_RateErr("Retry", details={"retryDelay": "42s"})) == 42.0
    assert extract_retry_after_seconds(_RateErr("Please retry in 2s")) == 10.0  # clamped min 10s
    assert extract_retry_after_seconds(_RateErr("Please retry in 3000s")) == 900.0  # clamped max 15m
    assert extract_retry_after_seconds(_RateErr("Limit", headers={"Retry-After": "75"})) == 75.0
    assert is_daily_quota_exhausted(_RateErr("Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel"))
    assert not is_daily_quota_exhausted(_RateErr("Too many requests per minute"))


@pytest.mark.asyncio
async def test_fallback_plans_do_not_stick_and_breaker_recovery_calls_gemini(tmp_path: Path) -> None:
    now = 100.0
    gemini_calls = 0

    class _Err429(Exception):
        def __init__(self, msg: str, details: Any = None) -> None:
            super().__init__(msg)
            self.code = 429
            self.details = details

    compact_narrative = {
        "summary": "Recovered Gemini plan for Delhi.",
        "routine": [
            {"timeSlot": slot, "title": "T", "detail": "D", "impactNote": "I"}
            for slot in ("morning", "midday", "evening", "night")
        ],
        "indoorHacks": [
            {"title": f"H{i}", "howTo": "Step.", "estimatedBenefit": "~20% less dust", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": "Car", "swap": "Metro", "why": "Cleaner air."} for _ in range(4)
        ],
        "communityActions": [
            {"title": "RWA heaters", "who": "rwa", "howTo": "Electric heaters.", "estimatedImpact": "Zero fires", "effort": "low"}
        ],
    }

    class _ToggleModels:
        async def list(self) -> Any:
            raise TimeoutError("skip")

        async def generate_content(self, **_kwargs: Any) -> Any:
            nonlocal gemini_calls
            gemini_calls += 1
            if gemini_calls <= 5:
                raise _Err429("RESOURCE_EXHAUSTED", details={"retryDelay": "42s"})
            return type("Resp", (), {"text": json.dumps(compact_narrative)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _ToggleModels()})()})()
    breaker = ModelCircuitBreaker(clock=lambda: now)
    client = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_model="gemini-3.8-flash"),
        sdk_client=sdk,
        breaker=breaker,
        clock=lambda: now,
    )
    app = create_app(
        settings=Settings(gemini_api_key="test-key", cache_ttl_seconds=600),
        gemini_client=client,
        http_client=build_mock_http_client(),
        dist_dir=tmp_path,
    )
    # Inject clock-backed plan cache so we test exact TTL behavior deterministically
    clock_cache: TTLCache[Any] = TTLCache(ttl_seconds=600.0, clock=lambda: now)

    prof = _sample_profile().model_dump(by_alias=True)
    with TestClient(app) as tc:
        app.state.plan_cache = clock_cache
        # 1. Upstream 429 across 5 fallback models -> returns rules + ai_busy + retryAfterSeconds=42
        r1 = tc.post("/api/plan", json=prof)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["generatedBy"] == "rules"
        assert d1["fallbackReason"] == "ai_busy"
        assert d1["retryAfterSeconds"] == 42

        # 2. Even 25s later (still < 42s), fallback plan was NOT stuck in cache; retries / skips open breaker cleanly
        now = 125.0
        r2 = tc.post("/api/plan", json=prof)
        assert r2.json()["generatedBy"] == "rules"
        assert r2.json()["retryAfterSeconds"] == 17

        # 3. After 42s cooldown closes breaker, request goes straight to Gemini and succeeds!
        now = 143.0
        r3 = tc.post("/api/plan", json=prof)
        d3 = r3.json()
        assert d3["generatedBy"] == "gemini"
        assert d3.get("fallbackReason") is None
        calls_before_cached = gemini_calls

        # 4. Real Gemini plan IS cached for full TTL (no extra Gemini call at +300s)
        now = 443.0
        r4 = tc.post("/api/plan", json=prof)
        assert r4.json()["generatedBy"] == "gemini"
        assert gemini_calls == calls_before_cached


def test_no_key_rules_plan_sets_no_key_and_caches_normally(tmp_path: Path) -> None:
    app = create_app(
        settings=Settings(gemini_api_key=""),
        http_client=build_mock_http_client(),
        dist_dir=tmp_path,
    )
    with TestClient(app) as tc:
        res = tc.post("/api/plan", json=_sample_profile().model_dump(by_alias=True))
        assert res.status_code == 200
        data = res.json()
        assert data["generatedBy"] == "rules"
        assert data["fallbackReason"] == "no_key"
        assert "retryAfterSeconds" not in data


def test_contract_sample_json_with_nulls_and_exclude_none(client: TestClient) -> None:
    import json
    from pathlib import Path

    from app.schemas import PlanResponse

    sample_path = Path(__file__).resolve().parents[2] / "contract" / "plan.sample.json"
    raw = json.loads(sample_path.read_text(encoding="utf-8"))
    validated = PlanResponse.model_validate(raw)
    assert validated.generated_by == "gemini"
    assert validated.fallback_reason is None
    assert validated.retry_after_seconds is None

    # /api/health omits selectedModel when None
    health = client.get("/api/health").json()
    assert "selectedModel" not in health or isinstance(health["selectedModel"], str)


def test_plan_prefer_coords_false_uses_city_and_offline_sample_chat_omits_sample_aqi(
    client: TestClient,
) -> None:
    from app.prompts import build_chat_user_prompt
    from app.schemas import PlanResponse
    from app.services.fallback_chat import generate_fallback_chat_reply

    pune_profile = _sample_profile().model_copy(update={"city": "Pune"})
    prof = pune_profile.model_dump(by_alias=True)
    res = client.post("/api/plan?lat=28.6139&lon=77.2090&preferCoords=false", json=prof)
    assert res.status_code == 200
    body = res.json()
    # Mocked geocoder returns city name ("Delhi") rather than APPROX_LOCATION_LABEL
    assert body["aqi"]["city"] != "Your location (approx.)"

    offline_plan = PlanResponse.model_validate(
        {
            **body,
            "aqi": {**body["aqi"], "city": "Pune", "aqi": 130, "source": "demo"},
            "summary": "Pune shows a sample demo AQI of 130 (Moderate).",
            "isOfflineSample": True,
        }
    )
    prompt = build_chat_user_prompt("Is it safe to walk?", pune_profile, offline_plan)
    assert "130" not in prompt
    assert "offline sample" in prompt.lower()

    reply = generate_fallback_chat_reply("Is it safe to walk?", pune_profile, offline_plan)
    assert "130" not in reply.answer
    assert "offline sample" in reply.answer.lower()


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_gemini_smoke_optional() -> None:
    settings = get_settings()
    if not settings.effective_gemini_api_key or not os.environ.get("RUN_LIVE_TESTS"):
        pytest.skip("Set RUN_LIVE_TESTS=1 with GEMINI_API_KEY to run live API smoke test.")
    client = GeminiClient(settings)
    await client.initialize_models()
    plan = await client.generate_plan(_sample_profile(), _sample_reading())
    assert plan is None or plan.generated_by == "gemini"
