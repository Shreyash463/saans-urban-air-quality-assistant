"""Targeted unit and branch coverage tests for core infrastructure and parser edge cases."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.config import Settings
from app.dependencies import _parse_ip_token, get_client_ip
from app.exceptions import (
    InvalidInputError,
    RateLimitExceededError,
    SaansError,
    UpstreamServiceError,
    log_route_event,
)
from app.main import create_app
from app.schemas import AirQualityReading, ChatReply, PlanResponse, UserProfile
from app.services.air_quality_parse import (
    _parse_dt_with_tz,
    _pick_latest_timestamp,
    get_demo_air_quality,
    parse_hourly_series,
    select_geocode_result,
)
from app.services.cache import TTLCache
from app.services.cpcb import (
    compute_cpcb_aqi_from_hourly,
    compute_cpcb_aqi_from_means,
    compute_sub_index,
)
from app.services.fallback_chat import generate_fallback_chat_reply
from app.services.gemini.circuit_breaker import ModelCircuitBreaker
from app.services.gemini.model_selection import (
    _is_eligible_flash_model,
    _unit_to_seconds,
    classify_api_failure,
    extract_retry_after_seconds,
    is_auth_error,
    is_not_found_404,
    strip_json_fences,
    thinking_config_for_model,
)
from app.services.rate_limit import SlidingWindowRateLimiter
from fastapi.testclient import TestClient
from starlette.requests import Request


def _fake_request(
    headers: list[tuple[bytes, bytes]] | None = None,
    trust_proxy_headers: bool = True,
    trusted_proxy_hops: int = 1,
) -> Request:
    app = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                trust_proxy_headers=trust_proxy_headers,
                trusted_proxy_hops=trusted_proxy_hops,
            )
        )
    )
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/health",
        "headers": headers or [],
        "client": ("127.0.0.1", 12345),
        "app": app,
    }
    return Request(scope)


def _sample_profile(lang: str = "en", **overrides: object) -> UserProfile:
    base = {
        "city": "Delhi",
        "householdSize": 3,
        "hasChildren": True,
        "hasElderly": False,
        "hasRespiratoryCondition": True,
        "commuteMode": "car",
        "commuteKm": 12,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "low",
        "language": lang,
    }
    base.update(overrides)
    return UserProfile.model_validate(base)


def _sample_plan(aqi: int = 145) -> PlanResponse:
    reading = AirQualityReading(
        city="Delhi",
        aqi=aqi,
        dominantPollutant="PM2.5",
        updated_at="2026-11-26T12:00:00+05:30",
        source="live",
    )
    return PlanResponse.model_validate(
        {
            "aqi": reading.model_dump(by_alias=True),
            "summary": "S",
            "healthAdvisory": "This is not medical advice.",
            "routine": [{"timeSlot": s, "title": s, "detail": s, "impactNote": s} for s in ("morning", "midday", "evening", "night")],
            "indoorHacks": [{"title": "H", "howTo": "D", "estimatedBenefit": "B", "costLevel": "free"}],
            "alternatives": [{"current": "C", "swap": "S", "why": "W", "pm25ReductionPct": 10, "co2SavedKgPerMonth": 5}],
            "maskGuidance": "N95",
            "disclaimer": "Not medical advice.",
            "generatedBy": "rules",
        }
    )


def test_exceptions_and_structured_log_event(caplog: pytest.LogCaptureFixture) -> None:
    base = SaansError("boom")
    assert base.code == "INTERNAL_ERROR"
    assert base.status_code == 500
    rate = RateLimitExceededError("slow down", retry_after_seconds=45)
    assert rate.status_code == 429 and rate.retry_after_seconds == 45
    assert InvalidInputError("bad").status_code == 422
    assert UpstreamServiceError("down").status_code == 502

    logger = logging.getLogger("saans.test")
    with caplog.at_level(logging.INFO, logger="saans.test"):
        log_route_event(logger, "/api/plan", cache="hit", latency_ms=12)
    assert "route=/api/plan cache=hit latency_ms=12" in caplog.text


@pytest.mark.asyncio
async def test_app_error_handlers_and_missing_dist_spa(tmp_path: Path) -> None:
    missing_dist = tmp_path / "does_not_exist"
    app = create_app(
        settings=Settings(environment="production", gemini_api_key=""),
        dist_dir=missing_dist,
    )
    req = _fake_request()
    saans_resp = await app.exception_handlers[SaansError](req, InvalidInputError("Bad param test"))
    assert saans_resp.status_code == 422
    assert b"INVALID_INPUT" in saans_resp.body

    unhandled = await app.exception_handlers[Exception](req, RuntimeError("sensitive internal detail"))
    assert unhandled.status_code == 500
    assert b"sensitive" not in unhandled.body

    with TestClient(app) as tc:
        assert tc.get("/").status_code == 404


def test_parse_ip_token_and_x_real_ip_fallback() -> None:
    assert _parse_ip_token("") is None
    assert _parse_ip_token("unknown") is None
    assert _parse_ip_token("[2001:db8::1]:8080") == "2001:db8::1"
    assert _parse_ip_token("198.51.100.7:443") == "198.51.100.7"
    assert _parse_ip_token("not-an-ip") is None

    req = _fake_request(
        headers=[
            (b"x-forwarded-for", b"unknown, bad-host"),
            (b"x-real-ip", b"203.0.113.55:9000"),
        ]
    )
    assert get_client_ip(req) == "203.0.113.55"

    req_bad_real = _fake_request(headers=[(b"x-real-ip", b"invalid")])
    assert get_client_ip(req_bad_real) == "127.0.0.1"


@pytest.mark.asyncio
async def test_ttl_cache_eviction_expiry_zero_ttl_and_clear() -> None:
    now = 100.0
    cache = TTLCache[str](ttl_seconds=10.0, maxsize=2, clock=lambda: now)
    await cache.set("a", "1")
    await cache.set("b", "2")
    assert await cache.get("a") == "1"
    await cache.set("c", "3")  # evicts "b" via LRU
    assert await cache.get("b") is None
    assert await cache.get("c") == "3"

    await cache.set("c", "removed", ttl_seconds=0)
    assert await cache.get("c") is None

    now = 200.0
    assert await cache.get("a") is None
    await cache.set("d", "4")
    now = 250.0
    await cache.set("e", "5")  # triggers _purge_expired_locked loop over expired "d"
    await cache.clear()
    assert await cache.get("e") is None


@pytest.mark.asyncio
async def test_rate_limiter_sweep_max_buckets_and_reset() -> None:
    now = 0.0
    limiter = SlidingWindowRateLimiter(
        max_requests=2,
        window_seconds=10.0,
        max_tracked_ips=16,
        clock=lambda: now,
    )
    for i in range(20):
        ok, _ = await limiter.check(f"198.51.100.{i}")
        assert ok is True
    assert limiter.active_bucket_count == 16

    now = 30.0
    ok, _ = await limiter.check("203.0.113.1")
    assert ok is True
    assert limiter.active_bucket_count == 1
    await limiter.reset()
    assert limiter.active_bucket_count == 0


def test_cpcb_and_air_quality_parse_edge_cases() -> None:
    assert compute_sub_index(0.0, ((0.0, 30.0, 0.0, 50.0),)) == 0.0
    assert compute_sub_index(5.0, ((10.0, 5.0, 0.0, 50.0),)) == 50.0
    with pytest.raises(ValueError):
        compute_cpcb_aqi_from_means(None, None)
    assert compute_cpcb_aqi_from_hourly(["bad", None, -1.0, float("nan")], [None]) is None  # type: ignore[list-item]

    unknown = get_demo_air_quality("Jaipur")
    assert unknown.city == "Jaipur" and unknown.source == "demo"
    assert select_geocode_result([{"name": "Delhi", "country": "India"}]) == {"name": "Delhi", "country": "India"}
    assert select_geocode_result([{"name": "Paris", "country_code": "FR"}]) == {"name": "Paris", "country_code": "FR"}
    assert select_geocode_result([]) is None
    assert _parse_dt_with_tz(123, UTC) is None
    assert _parse_dt_with_tz("bad-date", UTC) is None
    assert _pick_latest_timestamp([(datetime(2026, 11, 26, tzinfo=UTC), None, None)]) is None
    assert parse_hourly_series({"hourly": "invalid"}) is None

    times_14 = [f"2026-11-26T{h:02d}:00" for h in range(14)]
    assert parse_hourly_series(
        {"hourly": {"time": ["bad", *times_14], "pm2_5": [None] * 15, "pm10": [None] * 15}},
        now_utc=datetime(2026, 11, 26, 20, tzinfo=UTC),
    ) is None


def test_fallback_chat_circuit_breaker_and_model_selection_branches() -> None:
    hi_plan = _sample_plan(aqi=145)
    for lang in ("hi", "en"):
        prof = _sample_profile(lang=lang)
        for q in (
            "Hello there" if lang == "en" else "नमस्ते",
            "I have mild throat cough and wheezing" if lang == "en" else "मुझे खांसी और घरघराहट है",
            "Do indoor snake plants clean PM2.5?" if lang == "en" else "क्या स्नेक प्लांट हवा साफ करते हैं?",
            "Which N95 mask should we wear?" if lang == "en" else "कौन सा N95 मास्क पहनें?",
            "Cheapest indoor hacks?" if lang == "en" else "घर की हवा साफ करने के सस्ते उपाय",
            "When to open windows for ventilation?" if lang == "en" else "खिड़की कब खोलें वेंटिलेशन के लिए?",
            "What about kids playing outdoors?" if lang == "en" else "क्या बच्चे बाहर खेल सकते हैं?",
            "Random custom topic about smog",
        ):
            reply = generate_fallback_chat_reply(q, prof, hi_plan)
            assert isinstance(reply, ChatReply) and reply.answer

    # Test good AQI sensitive/non-sensitive branch and adult mask branch
    good_reply = generate_fallback_chat_reply(
        "Can kids play outdoors?",
        _sample_profile("en", hasChildren=False, hasRespiratoryCondition=False),
        _sample_plan(aqi=40),
    )
    assert "comfortable" in good_reply.answer.lower()

    assert _is_eligible_flash_model(SimpleNamespace(name="")) is None
    assert _is_eligible_flash_model(SimpleNamespace(name="models/gemini-2.5-flash", supported_actions=[])) is None
    assert strip_json_fences("```json\n{\"ok\": true}\n```") == '{"ok": true}'
    assert thinking_config_for_model("gemini-2.5-flash") is not None
    assert thinking_config_for_model("custom-model") is None
    assert is_auth_error(SimpleNamespace(code=401)) is True
    assert is_not_found_404(SimpleNamespace(code=404)) is True
    assert _unit_to_seconds(5.0, "ms") == 0.005
    assert _unit_to_seconds(2.0, "m") == 120.0
    assert extract_retry_after_seconds(SimpleNamespace(response=SimpleNamespace(headers={"retry-after": "bad"}), details=None)) is None
    assert classify_api_failure(SimpleNamespace(code=404)) == "not_found"
    assert classify_api_failure(SimpleNamespace(code=500)) == "unavailable"
    assert classify_api_failure(ValueError("generic")) is None

    now = 10.0
    breaker = ModelCircuitBreaker(clock=lambda: now)
    assert breaker.min_retry_after_seconds([]) is None
    breaker.record_failure("m1", "rate_limit", cooldown_seconds=20.0)
    assert breaker.min_retry_after_seconds(["m1"]) == 20
    assert breaker.first_healthy(["m1"]) is None
    assert breaker.min_retry_after_seconds(["m1", "m2"]) is None
