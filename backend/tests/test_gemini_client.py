"""Unit tests for Gemini model discovery, schema fallback, and single retry."""

from __future__ import annotations

import json
from typing import Any

import pytest
from app.config import Settings
from app.schemas import AirQualityReading, UserProfile
from app.services.gemini_client import GeminiClient, select_best_flash_models


def test_select_best_flash_models_ranks_newest_text_flash_first() -> None:
    models = [
        type("M", (), {"name": "models/gemini-2.5-flash", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.8-flash-tts", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.5-flash-lite", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-3.8-flash", "supported_actions": ["generateContent"]})(),
        type("M", (), {"name": "models/gemini-4.0-flash", "supported_actions": ["embedContent"]})(),
    ]
    ranked = select_best_flash_models(models)
    assert ranked[0] == "gemini-3.8-flash"
    assert "gemini-3.8-flash-tts" not in ranked
    assert "gemini-4.0-flash" not in ranked


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
            if model == "gemini-3.8-flash":
                raise TimeoutError("gemini-3.8-flash overloaded")
            return type("Resp", (), {"text": json.dumps(valid_payload)})()

    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _FailoverModels()})()})()
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
    assert calls_by_model == ["gemini-3.8-flash", "gemini-3.6-flash"]
    assert client.selected_model == "gemini-3.6-flash"

    # Subsequent call uses promoted working model first without retrying timed-out model
    plan2 = await client.generate_plan(profile, reading)
    assert plan2 is not None
    assert calls_by_model == ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.6-flash"]


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
    assert client_q.selected_model == "gemini-3.6-flash"

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
