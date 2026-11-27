"""Unit tests for ModelCircuitBreaker state transitions, failover, and health reporting."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from app.config import Settings
from app.services.gemini import GeminiClient, ModelCircuitBreaker
from fastapi.testclient import TestClient
from tests.helpers import (
    ApiStatusError,
    make_compact_narrative,
    make_profile,
    make_reading,
    make_sdk_client,
    make_test_app,
)


def test_circuit_breaker_transitions_with_injected_clock() -> None:
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
    breaker.record_success("gemini-3.8-flash")
    assert breaker.state_of("gemini-3.8-flash") == "closed"

    now = 405.0
    assert breaker.state_of("gemini-3.5-flash") == "half_open"
    breaker.record_failure("gemini-3.5-flash", "unavailable")
    assert breaker.first_healthy(["gemini-3.5-flash", "gemini-2.5-flash"], None) is None

    now = 1001.0
    assert breaker.state_of("gemini-2.5-flash") == "half_open"


@pytest.mark.asyncio
async def test_circuit_breaker_failover_updates_health_model(tmp_path: Path) -> None:
    now = 1000.0
    calls: list[str] = []
    narrative = make_compact_narrative()

    def respond(**kwargs: Any) -> Any:
        calls.append(kwargs["model"])
        if kwargs["model"] == "gemini-3.5-flash-lite":
            raise ApiStatusError("Service Unavailable", 503)
        import json

        return type("Resp", (), {"text": json.dumps(narrative)})()

    sdk = make_sdk_client(respond, ["models/gemini-3.8-flash", "models/gemini-3.5-flash-lite"])
    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=sdk, clock=lambda: now)
    app = make_test_app(tmp_path, settings=Settings(gemini_api_key="test-key"), gemini_client=client)

    with TestClient(app) as tc:
        assert tc.get("/api/health").json()["selectedModel"] == "gemini-3.5-flash-lite"
        plan = await client.generate_plan(make_profile(), make_reading(aqi=342))
        plan2 = await client.generate_plan(make_profile(), make_reading(aqi=342))
        assert plan is not None and plan2 is not None
        assert len(plan.community_actions) == 3
        assert calls == ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.8-flash"]
        assert tc.get("/api/health").json()["selectedModel"] == "gemini-3.8-flash"


@pytest.mark.asyncio
async def test_circuit_breaker_all_open_short_circuits_generation() -> None:
    from app.services.fallback_plan import generate_fallback_plan

    now = 500.0
    breaker = ModelCircuitBreaker(clock=lambda: now)
    for model in (
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.5-flash-lite",
    ):
        breaker.record_failure(model, "unavailable")

    client = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_model="gemini-3.6-flash"),
        sdk_client=make_sdk_client(RuntimeError("should not run")),
        breaker=breaker,
        clock=lambda: now,
    )
    profile = make_profile()
    plan = generate_fallback_plan(profile, make_reading())
    assert await client.generate_plan(profile, make_reading()) is None
    assert await client.generate_chat_reply("Hi", profile, plan) is None


def test_circuit_breaker_min_retry_after_bounds() -> None:
    now = 10.0
    breaker = ModelCircuitBreaker(clock=lambda: now)
    assert breaker.min_retry_after_seconds([]) is None
    breaker.record_failure("m1", "rate_limit", cooldown_seconds=20.0)
    assert breaker.min_retry_after_seconds(["m1"]) == 20
    assert breaker.first_healthy(["m1"]) is None
    assert breaker.min_retry_after_seconds(["m1", "m2"]) is None
