"""Unit tests for Gemini model ranking, retry hint parsing, and thinking config selection."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.gemini import select_best_flash_models
from app.services.gemini.model_selection import (
    _is_eligible_flash_model,
    _unit_to_seconds,
    classify_api_failure,
    extract_retry_after_seconds,
    is_auth_error,
    is_daily_quota_exhausted,
    is_not_found_404,
    strip_json_fences,
    thinking_config_for_model,
)
from tests.helpers import ApiStatusError


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


def test_retry_hint_extraction_clamping_and_daily_quota_detection() -> None:
    assert extract_retry_after_seconds(ApiStatusError("Retry", 429, details={"retryDelay": "42s"})) == 42.0
    assert extract_retry_after_seconds(ApiStatusError("Please retry in 2s", 429)) == 10.0
    assert extract_retry_after_seconds(ApiStatusError("Please retry in 3000s", 429)) == 900.0
    assert extract_retry_after_seconds(ApiStatusError("Limit", 429, headers={"Retry-After": "75"})) == 75.0
    assert extract_retry_after_seconds(ApiStatusError("Bad", 429, headers={"retry-after": "bad"})) is None
    assert is_daily_quota_exhausted(ApiStatusError("GenerateRequestsPerDayPerProjectPerModel", 429))
    assert not is_daily_quota_exhausted(ApiStatusError("Too many requests per minute", 429))


def test_model_selection_helpers_edges() -> None:
    assert _is_eligible_flash_model(SimpleNamespace(name="")) is None
    assert _is_eligible_flash_model(SimpleNamespace(name="models/gemini-2.5-flash", supported_actions=[])) is None
    assert strip_json_fences('```json\n{"ok": true}\n```') == '{"ok": true}'
    assert thinking_config_for_model("gemini-2.5-flash") is not None
    assert thinking_config_for_model("custom-model") is None
    assert is_auth_error(SimpleNamespace(code=401)) is True
    assert is_not_found_404(SimpleNamespace(code=404)) is True
    assert _unit_to_seconds(5.0, "ms") == 0.005
    assert _unit_to_seconds(2.0, "m") == 120.0
    assert classify_api_failure(SimpleNamespace(code=404)) == "not_found"
    assert classify_api_failure(SimpleNamespace(code=500)) == "unavailable"
    assert classify_api_failure(ValueError("generic")) is None
