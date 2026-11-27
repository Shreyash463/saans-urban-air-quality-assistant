"""Tests for TTLCache eviction/expiry and plan cache fallback non-stickiness."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from app.config import Settings
from app.services.cache import TTLCache
from app.services.gemini import GeminiClient, ModelCircuitBreaker
from fastapi.testclient import TestClient
from tests.helpers import (
    ApiStatusError,
    make_compact_narrative,
    make_profile_dict,
    make_sdk_client,
    make_test_app,
)


def _setup_clock_plan_app(tmp_path: Path, now_ref: list[float], calls_before_ok: int) -> tuple[Any, list[int], TTLCache[Any]]:
    calls = [0]
    narrative = make_compact_narrative()

    def respond(**_kwargs: Any) -> Any:
        calls[0] += 1
        if calls[0] <= calls_before_ok:
            raise ApiStatusError("RESOURCE_EXHAUSTED", 429, details={"retryDelay": "42s"})
        return type("Resp", (), {"text": json.dumps(narrative)})()

    breaker = ModelCircuitBreaker(clock=lambda: now_ref[0])
    client = GeminiClient(
        Settings(gemini_api_key="test-key"),
        sdk_client=make_sdk_client(respond, list_error=TimeoutError("skip")),
        breaker=breaker,
        clock=lambda: now_ref[0],
    )
    app = make_test_app(
        tmp_path,
        settings=Settings(gemini_api_key="test-key", cache_ttl_seconds=600),
        gemini_client=client,
    )
    cache: TTLCache[Any] = TTLCache(ttl_seconds=600.0, clock=lambda: now_ref[0])
    return app, calls, cache


def test_transient_fallback_plan_does_not_stick_in_cache(tmp_path: Path) -> None:
    now_ref = [100.0]
    app, _calls, clock_cache = _setup_clock_plan_app(tmp_path, now_ref, calls_before_ok=6)
    prof = make_profile_dict()

    with TestClient(app) as tc:
        app.state.plan_cache = clock_cache
        r1 = tc.post("/api/plan", json=prof).json()
        assert r1["generatedBy"] == "rules"
        assert r1["fallbackReason"] == "ai_busy"
        assert r1["retryAfterSeconds"] == 42

        now_ref[0] = 125.0
        r2 = tc.post("/api/plan", json=prof).json()
        assert r2["generatedBy"] == "rules"
        assert r2["retryAfterSeconds"] == 17


def test_recovered_gemini_plan_caches_for_full_ttl(tmp_path: Path) -> None:
    now_ref = [100.0]
    app, calls, clock_cache = _setup_clock_plan_app(tmp_path, now_ref, calls_before_ok=6)
    prof = make_profile_dict()

    with TestClient(app) as tc:
        app.state.plan_cache = clock_cache
        assert tc.post("/api/plan", json=prof).json()["generatedBy"] == "rules"

        now_ref[0] = 143.0
        r3 = tc.post("/api/plan", json=prof).json()
        assert r3["generatedBy"] == "gemini"
        assert r3.get("fallbackReason") is None
        calls_after_recovery = calls[0]

        now_ref[0] = 443.0
        r4 = tc.post("/api/plan", json=prof).json()
        assert r4["generatedBy"] == "gemini"
        assert calls[0] == calls_after_recovery


def test_no_key_rules_plan_sets_no_key_without_retry_after(tmp_path: Path) -> None:
    app = make_test_app(tmp_path, settings=Settings(gemini_api_key=""))
    with TestClient(app) as tc:
        res = tc.post("/api/plan", json=make_profile_dict())
        assert res.status_code == 200
        data = res.json()
        assert data["generatedBy"] == "rules"
        assert data["fallbackReason"] == "no_key"
        assert "retryAfterSeconds" not in data


@pytest.mark.asyncio
async def test_ttl_cache_eviction_expiry_zero_ttl_and_clear() -> None:
    now = 100.0
    cache = TTLCache[str](ttl_seconds=10.0, maxsize=2, clock=lambda: now)
    await cache.set("a", "1")
    await cache.set("b", "2")
    assert await cache.get("a") == "1"
    await cache.set("c", "3")
    assert await cache.get("b") is None

    await cache.set("c", "removed", ttl_seconds=0)
    assert await cache.get("c") is None

    now = 200.0
    assert await cache.get("a") is None
    await cache.set("d", "4")
    now = 250.0
    await cache.set("e", "5")
    await cache.clear()
    assert await cache.get("e") is None
