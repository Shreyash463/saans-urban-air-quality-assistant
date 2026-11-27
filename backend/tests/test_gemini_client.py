"""Unit tests for Gemini client execution, failover, budgets, token hygiene, and EN/HI fixture assembly."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from app.config import Settings, get_settings
from app.services.fallback_plan import generate_fallback_plan
from app.services.gemini import GeminiClient
from fastapi.testclient import TestClient
from tests.helpers import (
    ApiStatusError,
    make_compact_narrative,
    make_full_gemini_payload,
    make_profile,
    make_profile_dict,
    make_reading,
    make_sdk_client,
    make_test_app,
)

_EN_FIXTURE = make_compact_narrative(include_community=True)
_HI_FIXTURE = {
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
}


@pytest.mark.asyncio
async def test_gemini_client_simplifies_schema_and_retries_invalid_json() -> None:
    calls = 0
    payload = make_full_gemini_payload(unsafe=False)

    def respond(**_kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise ValueError("Unsupported response_schema $defs")
        return type("Resp", (), {"text": payload})()

    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=make_sdk_client(respond))
    await client.initialize_models()
    plan = await client.generate_plan(make_profile(hasChildren=False, hasRespiratoryCondition=False), make_reading())
    assert client.selected_model == "gemini-3.8-flash"
    assert plan is not None and plan.generated_by == "gemini" and calls == 2


@pytest.mark.asyncio
async def test_gemini_client_fails_over_and_promotes_working_model() -> None:
    calls_by_model: list[str] = []
    payload = make_full_gemini_payload(unsafe=False)

    def respond(**kwargs: Any) -> Any:
        calls_by_model.append(kwargs["model"])
        if kwargs["model"] == "gemini-3.6-flash":
            raise TimeoutError("gemini-3.6-flash overloaded")
        return type("Resp", (), {"text": payload})()

    sdk = make_sdk_client(respond, ["models/gemini-3.8-flash", "models/gemini-3.6-flash"])
    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=sdk)
    await client.initialize_models()
    assert client.selected_model == "gemini-3.6-flash"

    plan1 = await client.generate_plan(make_profile(), make_reading())
    plan2 = await client.generate_plan(make_profile(), make_reading())
    assert plan1 is not None and plan2 is not None
    assert client.selected_model == "gemini-3.8-flash"
    assert calls_by_model == ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.8-flash"]


@pytest.mark.asyncio
async def test_gemini_client_avoids_duplicate_retries_on_429() -> None:
    tried_models: list[str] = []

    def respond(**kwargs: Any) -> Any:
        tried_models.append(kwargs["model"])
        raise RuntimeError("429 RESOURCE_EXHAUSTED: quota exceeded")

    sdk = make_sdk_client(respond, list_error=TimeoutError("discovery slow"))
    client = GeminiClient(Settings(gemini_api_key="test-key", gemini_discovery_timeout_seconds=0.5), sdk_client=sdk)
    await client.initialize_models()
    profile, reading = make_profile(), make_reading()

    assert await client.generate_plan(profile, reading) is None
    assert len(tried_models) == len(set(tried_models)) and len(tried_models) <= 6

    tried_models.clear()
    assert await client.generate_chat_reply("Can kids play?", profile, generate_fallback_plan(profile, reading)) is None
    assert len(tried_models) == len(set(tried_models)) and len(tried_models) <= 6


@pytest.mark.asyncio
async def test_gemini_client_aborts_immediately_on_auth_error() -> None:
    calls = 0

    def respond(**_kwargs: Any) -> Any:
        nonlocal calls
        calls += 1
        raise RuntimeError("API key not valid")

    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=make_sdk_client(respond, list_error=TimeoutError("skip")))
    assert await client.generate_plan(make_profile(), make_reading()) is None
    assert calls == 1


@pytest.mark.asyncio
async def test_gemini_client_never_double_retries_on_timeout() -> None:
    timeout_models: list[str] = []

    def respond(**kwargs: Any) -> Any:
        timeout_models.append(kwargs["model"])
        raise TimeoutError("timed out")

    settings = Settings(gemini_api_key="test-key", gemini_discovery_timeout_seconds=0.5, gemini_timeout_seconds=5.0)
    client = GeminiClient(settings, sdk_client=make_sdk_client(respond, list_error=TimeoutError("skip")))
    assert await client.generate_plan(make_profile(), make_reading()) is None
    assert len(timeout_models) == len(set(timeout_models))


@pytest.mark.asyncio
async def test_pinned_gemini_model_tries_single_model_and_falls_back() -> None:
    attempted: list[str] = []

    def respond(**kwargs: Any) -> Any:
        attempted.append(kwargs["model"])
        raise ApiStatusError("UNAVAILABLE", 503)

    client = GeminiClient(
        Settings(gemini_api_key="test-key", gemini_model="gemini-3.8-flash"),
        sdk_client=make_sdk_client(respond, model_names=[]),
    )
    plan, reason, retry = await client.generate_plan_with_status(make_profile(), make_reading())
    assert plan is None and reason == "ai_busy" and retry is not None and retry > 0
    assert attempted == ["gemini-3.8-flash"]


@pytest.mark.asyncio
async def test_daily_call_budget_limits_and_resets_at_utc_midnight(tmp_path: Path) -> None:
    now_utc = datetime(2026, 11, 26, 23, 55, 0, tzinfo=UTC).timestamp()
    upstream_calls = 0
    payload = json.dumps(make_compact_narrative(include_community=False))

    def respond(**_kwargs: Any) -> Any:
        nonlocal upstream_calls
        upstream_calls += 1
        return type("Resp", (), {"text": payload})()

    sdk = make_sdk_client(respond, ["models/gemini-3.5-flash-lite"])
    client = GeminiClient(Settings(gemini_api_key="test-key", gemini_daily_call_budget=1), sdk_client=sdk, utc_clock=lambda: now_utc)
    await client.initialize_models()
    app = make_test_app(tmp_path, settings=Settings(gemini_api_key="test-key"), gemini_client=client)
    prof = make_profile_dict(city="Pune")

    with TestClient(app) as tc:
        assert tc.post("/api/plan", json=prof).json()["generatedBy"] == "gemini"
        assert tc.get("/api/health").json()["remainingDailyBudget"] == 0
        over = tc.post("/api/plan", json={**prof, "city": "Mumbai"}).json()
        assert over["generatedBy"] == "rules" and over["fallbackReason"] == "ai_busy" and upstream_calls == 1

        now_utc = datetime(2026, 11, 27, 0, 1, 0, tzinfo=UTC).timestamp()
        assert tc.get("/api/health").json()["remainingDailyBudget"] == 1
        assert tc.post("/api/plan", json={**prof, "city": "Kolkata"}).json()["generatedBy"] == "gemini"
        assert upstream_calls == 2


@pytest.mark.asyncio
async def test_chat_thinking_fallback_and_model_failover() -> None:
    attempts: list[tuple[str, bool]] = []

    def respond(**kwargs: Any) -> Any:
        has_thinking = getattr(kwargs.get("config"), "thinking_config", None) is not None
        attempts.append((kwargs["model"], has_thinking))
        if kwargs["model"] == "gemini-3.8-flash":
            if has_thinking:
                raise ValueError("Thinking level not supported")
            raise TimeoutError("3.8 overloaded")
        return type("Resp", (), {"text": "Keep kids indoors and use a snugly fitted N95 mask."})()

    sdk = make_sdk_client(respond, ["models/gemini-3.8-flash", "models/gemini-2.5-flash"])
    client = GeminiClient(Settings(gemini_api_key="test-key"), sdk_client=sdk, clock=lambda: 500.0)
    plan = generate_fallback_plan(make_profile(), make_reading())
    reply = await client.generate_chat_reply("Can my child jog today?", make_profile(), plan)
    assert reply is not None and "n95" in reply.answer.lower()
    assert attempts[:2] == [("gemini-3.8-flash", True), ("gemini-3.8-flash", False)]


@pytest.mark.asyncio
async def test_token_logging_never_logs_prompt_or_secret(caplog: pytest.LogCaptureFixture) -> None:
    compact = make_compact_narrative(include_community=False)
    compact["summary"] = "UniqueSecretPromptMarkerXYZ in Delhi"

    def respond(**_kwargs: Any) -> Any:
        usage = type("U", (), {"prompt_token_count": 290, "candidates_token_count": 350, "thoughts_token_count": 0, "total_token_count": 640})()
        return type("Resp", (), {"text": json.dumps(compact), "usage_metadata": usage})()

    client = GeminiClient(Settings(gemini_api_key="AIzaFakeKeyNeverLogged"), sdk_client=make_sdk_client(respond, list_error=TimeoutError("skip")))
    with caplog.at_level(logging.INFO):
        plan = await client.generate_plan(make_profile(), make_reading())
    assert plan is not None
    joined = "\n".join(caplog.messages)
    assert "prompt_tokens=290" in joined and "output_tokens=350" in joined
    assert "AIzaFakeKeyNeverLogged" not in joined and "UniqueSecretPromptMarkerXYZ" not in joined


@pytest.mark.parametrize(("fixture", "lang"), [(_EN_FIXTURE, "en"), (_HI_FIXTURE, "hi")])
@pytest.mark.asyncio
async def test_real_gemini_response_fixtures_assemble_cleanly(fixture: dict[str, Any], lang: str) -> None:
    sdk = make_sdk_client(json.dumps(fixture), list_error=TimeoutError("skip"))
    client = GeminiClient(Settings(gemini_api_key="fixture-key"), sdk_client=sdk)
    plan = await client.generate_plan(make_profile(lang=lang), make_reading())
    assert plan is not None and plan.generated_by == "gemini"
    assert len(plan.community_actions) == 3 and plan.alternatives[2].co2_saved_kg_per_month == 0


@pytest.mark.live
@pytest.mark.asyncio
async def test_live_gemini_smoke_optional() -> None:
    settings = get_settings()
    if not settings.effective_gemini_api_key or not os.environ.get("RUN_LIVE_TESTS"):
        pytest.skip("Set RUN_LIVE_TESTS=1 with GEMINI_API_KEY to run live API smoke test.")
    client = GeminiClient(settings)
    await client.initialize_models()
    plan = await client.generate_plan(make_profile(), make_reading())
    assert plan is None or plan.generated_by == "gemini"
