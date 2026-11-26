"""Unit tests for Gemini model discovery, schema fallback, and single retry."""

from __future__ import annotations

import json
from typing import Any

import pytest
from app.config import Settings
from app.schemas import AirQualityReading, UserProfile
from app.services.gemini_client import GeminiClient, select_best_flash_models


def test_select_best_flash_models_ranks_flash_lite_first_and_respects_priority() -> None:
    models = [
        type("M", (), {"name": "models/gemini-2.5-flash", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.8-flash-tts", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.5-flash-lite", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-4.0-flash", "supported_actions": ["embedContent"]})(),
    ]
    ranked = select_best_flash_models(models)
    assert ranked[0] == "gemini-3.5-flash-lite"
    assert "gemini-3.8-flash-tts" not in ranked
    assert "gemini-4.0-flash" not in ranked

    custom = select_best_flash_models(models, priority=["gemini-3.8-flash", "gemini-3.5-flash-lite"])
    assert custom[:2] == ["gemini-3.8-flash", "gemini-3.5-flash-lite"]


@pytest.mark.asyncio
async def test_gemini_client_simplifies_schema_and_retries_invalid_json() -> None:
    calls = 0
    valid_payload = {
        "summary": "Clean summary",
        "healthAdvisory": "Avoid outdoor exertion.",
        "routine": [
            {"timeSlot": "morning", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "midday", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "evening", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "night", "title": "M", "detail": "D", "impactNote": "I"},
        ],
        "indoorHacks": [
            {"title": f"H{i}", "howTo": "Do", "estimatedBenefit": "Good", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": f"C{i}", "swap": f"S{i}", "why": "W", "pm25ReductionPct": 15, "co2SavedKgPerMonth": 0}
            for i in range(3)
        ],
        "maskGuidance": "Wear N95 mask.",
    }

    class _FakeModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._done = False
                    return self

                async def __anext__(self) -> Any:
                    if self._done:
                        raise StopAsyncIteration
                    self._done = True
                    return type(
                        "M",
                        (),
                        {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]},
                    )()

            return _Pager()

        async def generate_content(self, **_kwargs: Any) -> Any:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise ValueError("Unsupported response_schema $defs")
            return type("Resp", (), {"text": json.dumps(valid_payload)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _FakeModels()})()})()
    client = GeminiClient(Settings(gemini_api_key="test-placeholder-for-mock"), sdk_client=sdk)
    await client.initialize_models()
    assert client.selected_model == "gemini-3.8-flash"

    profile = UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 2,
            "hasChildren": False,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "car",
            "commuteKm": 16,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": "en",
        }
    )
    reading = AirQualityReading(
        city="Delhi",
        aqi=310,
        dominantPollutant="PM2.5",
        updated_at="2026-11-25T12:00:00+05:30",
        source="live",
    )
    plan = await client.generate_plan(profile, reading)
    assert plan is not None
    assert plan.generated_by == "gemini"
    assert calls == 2


@pytest.mark.asyncio
async def test_gemini_client_fails_over_from_overloaded_model_and_promotes_working_model() -> None:
    calls_by_model: list[str] = []
    valid_payload = {
        "summary": "Clean summary",
        "healthAdvisory": "Avoid outdoor exertion.",
        "routine": [
            {"timeSlot": "morning", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "midday", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "evening", "title": "M", "detail": "D", "impactNote": "I"},
            {"timeSlot": "night", "title": "M", "detail": "D", "impactNote": "I"},
        ],
        "indoorHacks": [
            {"title": f"H{i}", "howTo": "Do", "estimatedBenefit": "Good", "costLevel": "free"}
            for i in range(5)
        ],
        "alternatives": [
            {"current": f"C{i}", "swap": f"S{i}", "why": "W", "pm25ReductionPct": 15, "co2SavedKgPerMonth": 0}
            for i in range(3)
        ],
        "maskGuidance": "Wear N95 mask.",
    }

    class _FailoverModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._idx = 0
                    self._items = [
                        type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})(),
                        type("M", (), {"name": "models/gemini-3.6-flash", "supported_actions": ["generateContent"]})(),
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
            calls_by_model.append(model)
            if model == "gemini-3.6-flash":
                raise TimeoutError("gemini-3.6-flash overloaded")
            return type("Resp", (), {"text": json.dumps(valid_payload)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _FailoverModels()})()})()
    client = GeminiClient(Settings(gemini_api_key="test-placeholder-for-mock"), sdk_client=sdk)
    await client.initialize_models()
    assert client.selected_model == "gemini-3.6-flash"

    profile = UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 2,
            "hasChildren": False,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "car",
            "commuteKm": 16,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": "en",
        }
    )
    reading = AirQualityReading(
        city="Delhi",
        aqi=310,
        dominantPollutant="PM2.5",
        updated_at="2026-11-25T12:00:00+05:30",
        source="live",
    )
    plan = await client.generate_plan(profile, reading)
    assert plan is not None
    assert plan.generated_by == "gemini"
    assert calls_by_model == ["gemini-3.6-flash", "gemini-3.8-flash"]
    assert client.selected_model == "gemini-3.8-flash"

    # Subsequent call uses promoted working model first without retrying timed-out model
    plan2 = await client.generate_plan(profile, reading)
    assert plan2 is not None
    assert calls_by_model == ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.8-flash"]


@pytest.mark.asyncio
async def test_gemini_client_degrades_without_retry_storm_on_timeout_or_429() -> None:
    # 1. Quota / 429 tries at most 2 distinct models once each (zero double-retry storm)
    quota_models: list[str] = []

    class _QuotaModels:
        async def list(self) -> Any:
            raise TimeoutError("discovery slow")

        async def generate_content(self, **kwargs: Any) -> Any:
            quota_models.append(kwargs["model"])
            raise RuntimeError("429 RESOURCE_EXHAUSTED: quota exceeded")

    sdk_quota = type("Sdk", (), {"aio": type("Aio", (), {"models": _QuotaModels()})()})()
    client_q = GeminiClient(
        Settings(gemini_api_key="test-placeholder-for-mock", gemini_discovery_timeout_seconds=0.5),
        sdk_client=sdk_quota,
    )
    await client_q.initialize_models()
    assert client_q.selected_model == "gemini-3.5-flash-lite"

    profile = UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 2,
            "hasChildren": False,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "car",
            "commuteKm": 16,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": "en",
        }
    )
    reading = AirQualityReading(
        city="Delhi",
        aqi=310,
        dominantPollutant="PM2.5",
        updated_at="2026-11-25T12:00:00+05:30",
        source="live",
    )
    assert await client_q.generate_plan(profile, reading) is None
    assert len(quota_models) <= 6
    assert len(quota_models) == len(set(quota_models))

    quota_models.clear()
    assert (
        await client_q.generate_chat_reply(
            "Can kids play outside?", profile, _dummy_plan(profile, reading)
        )
        is None
    )
    assert len(quota_models) <= 6
    assert len(quota_models) == len(set(quota_models))

    # 2. Auth failure (401/403) aborts immediately on first call
    auth_calls = 0

    class _AuthModels:
        async def list(self) -> Any:
            raise TimeoutError("discovery slow")

        async def generate_content(self, **_kwargs: Any) -> Any:
            nonlocal auth_calls
            auth_calls += 1
            raise RuntimeError("API key not valid")

    client_auth = GeminiClient(
        Settings(gemini_api_key="test-placeholder-for-mock", gemini_discovery_timeout_seconds=0.5),
        sdk_client=type("Sdk", (), {"aio": type("Aio", (), {"models": _AuthModels()})()})(),
    )
    assert await client_auth.generate_plan(profile, reading) is None
    assert auth_calls == 1

    # 3. Slow timeouts never double-retry per model and respect overall budget cleanly
    timeout_models: list[str] = []

    class _TimeoutModels:
        async def list(self) -> Any:
            raise TimeoutError("discovery slow")

        async def generate_content(self, **kwargs: Any) -> Any:
            timeout_models.append(kwargs["model"])
            raise TimeoutError("timed out")

    sdk_to = type("Sdk", (), {"aio": type("Aio", (), {"models": _TimeoutModels()})()})()
    client_to = GeminiClient(
        Settings(
            gemini_api_key="test-placeholder-for-mock",
            gemini_discovery_timeout_seconds=0.5,
            gemini_timeout_seconds=5.0,
        ),
        sdk_client=sdk_to,
    )
    assert await client_to.generate_plan(profile, reading) is None
    assert len(timeout_models) == len(set(timeout_models))


def _dummy_plan(profile: UserProfile, reading: AirQualityReading) -> Any:
    from app.services.fallback_plan import generate_fallback_plan

    return generate_fallback_plan(profile, reading)


@pytest.mark.asyncio
async def test_pinned_gemini_model_tries_single_model_and_falls_back_to_rules() -> None:
    attempted: list[str] = []

    class _Err503(Exception):
        code = 503

    class _FailModels:
        async def list(self) -> Any:
            return []

        async def generate_content(self, **kwargs: Any) -> Any:
            attempted.append(kwargs["model"])
            raise _Err503("UNAVAILABLE")

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _FailModels()})()})()
    client = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_model="gemini-3.8-flash"),
        sdk_client=sdk,
    )
    profile = UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 2,
            "hasChildren": False,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "car",
            "commuteKm": 16,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": "en",
        }
    )
    reading = AirQualityReading(
        city="Delhi",
        aqi=310,
        dominantPollutant="PM2.5",
        updated_at="2026-11-25T12:00:00+05:30",
        source="live",
    )
    plan, reason, retry = await client.generate_plan_with_status(profile, reading)
    assert plan is None
    assert reason == "ai_busy"
    assert retry is not None and retry > 0
    assert attempted == ["gemini-3.8-flash"]


@pytest.mark.asyncio
async def test_daily_call_budget_guard_counts_upstream_calls_and_resets_at_utc_midnight() -> None:
    from datetime import UTC, datetime

    from app.main import create_app
    from fastapi.testclient import TestClient

    # 2026-11-26 23:55:00 UTC
    now_utc = datetime(2026, 11, 26, 23, 55, 0, tzinfo=UTC).timestamp()
    upstream_calls = 0

    class _CountingModels:
        async def list(self) -> Any:
            class _Pager:
                def __aiter__(self) -> _Pager:
                    self._done = False
                    return self

                async def __anext__(self) -> Any:
                    if self._done:
                        raise StopAsyncIteration
                    self._done = True
                    return type(
                        "M",
                        (),
                        {"name": "models/gemini-3.5-flash-lite", "supported_actions": ["generateContent"]},
                    )()

            return _Pager()

        async def generate_content(self, **_kwargs: Any) -> Any:
            nonlocal upstream_calls
            upstream_calls += 1
            payload = {
                "summary": "Clean summary",
                "routine": [
                    {"timeSlot": slot, "title": "M", "detail": "D", "impactNote": "I"}
                    for slot in ("morning", "midday", "evening", "night")
                ],
                "indoorHacks": [
                    {"title": f"H{i}", "howTo": "Do", "estimatedBenefit": "Good", "costLevel": "free"}
                    for i in range(5)
                ],
                "alternatives": [
                    {"current": "Car", "swap": "Metro", "why": "Less PM2.5"}
                    for _ in range(3)
                ],
            }
            return type("Resp", (), {"text": json.dumps(payload)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _CountingModels()})()})()
    client = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_daily_call_budget=1),
        sdk_client=sdk,
        utc_clock=lambda: now_utc,
    )
    await client.initialize_models()
    assert client.remaining_daily_budget == 1
    assert client.daily_budget_limit == 1

    app = create_app(settings=Settings(gemini_api_key="test-key"), gemini_client=client)
    profile_payload = {
        "city": "Pune",
        "householdSize": 2,
        "hasChildren": False,
        "hasElderly": False,
        "hasRespiratoryCondition": False,
        "commuteMode": "car",
        "commuteKm": 16,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "low",
        "language": "en",
    }

    with TestClient(app) as tc:
        # 1st plan uses the 1 allowed upstream call
        p1 = tc.post("/api/plan", json=profile_payload)
        assert p1.status_code == 200
        assert p1.json()["generatedBy"] == "gemini"
        assert upstream_calls == 1

        health1 = tc.get("/api/health").json()
        assert health1["remainingDailyBudget"] == 0
        assert health1["dailyBudgetLimit"] == 1

        # 2nd different profile exceeds daily budget -> labeled rules fallback with ai_busy, 0 extra calls
        p2 = tc.post("/api/plan", json={**profile_payload, "city": "Mumbai"})
        assert p2.status_code == 200
        d2 = p2.json()
        assert d2["generatedBy"] == "rules"
        assert d2["fallbackReason"] == "ai_busy"
        assert upstream_calls == 1

        # Advance past 00:00 UTC -> budget resets to 1
        now_utc = datetime(2026, 11, 27, 0, 1, 0, tzinfo=UTC).timestamp()
        health2 = tc.get("/api/health").json()
        assert health2["remainingDailyBudget"] == 1
        p3 = tc.post("/api/plan", json={**profile_payload, "city": "Kolkata"})
        assert p3.status_code == 200
        assert p3.json()["generatedBy"] == "gemini"
        assert upstream_calls == 2
