"""Tests for POST /api/plan endpoint, Gemini integration, validation, and rule fallback."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import Settings
from app.main import create_app
from app.services.gemini_client import GeminiClient
from fastapi.testclient import TestClient
from tests.conftest import build_mock_http_client


class _FakeAsyncModels:
    def __init__(self, text_or_exc: str | Exception) -> None:
        self._text_or_exc = text_or_exc

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
        if isinstance(self._text_or_exc, Exception):
            raise self._text_or_exc
        return type("Resp", (), {"text": self._text_or_exc})()


class _FakeSdkClient:
    def __init__(self, text_or_exc: str | Exception) -> None:
        self.aio = type("Aio", (), {"models": _FakeAsyncModels(text_or_exc)})()


def test_plan_endpoint_falls_back_to_rules_without_gemini_key(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    resp = client.post("/api/plan", json=sample_profile_dict)
    assert resp.status_code == 200
    data = resp.json()
    assert data["generatedBy"] == "rules"
    assert data["aqi"]["source"] == "live"
    assert data["aqi"]["sourceDetail"] == "Open-Meteo, PM-based CPCB estimate"
    assert len(data["routine"]) == 4
    assert 5 <= len(data["indoorHacks"]) <= 7
    assert "Not medical advice" in data["disclaimer"]


def test_plan_endpoint_rejects_invalid_inputs_with_422(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    bad_city = {**sample_profile_dict, "city": "<script>alert(1)</script>"}
    assert client.post("/api/plan", json=bad_city).status_code == 422

    extra_field = {**sample_profile_dict, "unexpected": "bad"}
    assert client.post("/api/plan", json=extra_field).status_code == 422

    bad_size = {**sample_profile_dict, "householdSize": 25}
    assert client.post("/api/plan", json=bad_size).status_code == 422

    bad_km = {**sample_profile_dict, "commuteKm": 350}
    assert client.post("/api/plan", json=bad_km).status_code == 422


def test_plan_endpoint_with_mocked_gemini_grounds_numbers_and_enforces_safety(
    tmp_path: Path,
    sample_profile_dict: dict[str, Any],
) -> None:
    gemini_payload = {
        "summary": "Personalized Delhi winter smog plan for 4 members.",
        "healthAdvisory": "Outdoor exercise is safe for everyone today!",  # intentionally unsafe -> should be replaced!
        "routine": [
            {"timeSlot": "morning", "title": "Recirculate AC", "detail": "Set car AC.", "impactNote": "Cuts exhaust."},
            {"timeSlot": "midday", "title": "1-4 PM vent", "detail": "Open windows.", "impactNote": "Flushes CO2."},
            {"timeSlot": "evening", "title": "Seal by 5:30 PM", "detail": "Run exhaust.", "impactNote": "Blocks smoke."},
            {"timeSlot": "night", "title": "Bedroom seal", "detail": "DIY HEPA fan.", "impactNote": "Cleaner sleep."},
        ],
        "indoorHacks": [
            {"title": "Wet mop", "howTo": "Mop daily", "estimatedBenefit": "25% less dust", "costLevel": "free"},
            {"title": "Skip incense", "howTo": "No coils", "estimatedBenefit": "No spikes", "costLevel": "free"},
            {"title": "Seal doors", "howTo": "Foam tape", "estimatedBenefit": "15% less leak", "costLevel": "low"},
            {"title": "DIY HEPA", "howTo": "Box fan + filter", "estimatedBenefit": "60% drop", "costLevel": "low"},
            {"title": "Avoid plant myth", "howTo": "Plants don't filter smog", "estimatedBenefit": "Real cuts", "costLevel": "free"},
        ],
        "alternatives": [
            {"current": "Car", "swap": "Metro 3x/week", "why": "Lower emissions", "pm25ReductionPct": 99, "co2SavedKgPerMonth": 999},
            {"current": "LPG boiling", "swap": "Electric kettle", "why": "Cleaner kitchen", "pm25ReductionPct": 99, "co2SavedKgPerMonth": 999},
            {"current": "Open bedroom", "swap": "DIY HEPA fan", "why": "Cleaner sleep", "pm25ReductionPct": 99, "co2SavedKgPerMonth": 999},
            {"current": "Leaf burning", "swap": "Compost leaves", "why": "No block smoke", "pm25ReductionPct": 99, "co2SavedKgPerMonth": 999},
        ],
        "maskGuidance": "No mask needed today.",  # intentionally unsafe -> should be replaced!
    }
    settings = Settings(gemini_api_key="test-placeholder-for-mock")
    g_client = GeminiClient(settings, sdk_client=_FakeSdkClient(json.dumps(gemini_payload)))
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    app = create_app(
        settings=settings,
        gemini_client=g_client,
        http_client=build_mock_http_client(),
        dist_dir=dist_dir,
    )

    with TestClient(app) as tc:
        resp = tc.post("/api/plan", json=sample_profile_dict)
        assert resp.status_code == 200
        data = resp.json()
        assert data["generatedBy"] == "gemini"
        # Safety replaced unsafe advisory and maskGuidance
        assert "outdoor exercise is safe" not in data["healthAdvisory"].lower()
        assert "n95" in data["maskGuidance"].lower()
        # Grounded numbers overrode 99/999; non-emission DIY HEPA CO2 forced to 0
        assert all(alt["pm25ReductionPct"] <= 95 for alt in data["alternatives"])
        assert data["alternatives"][2]["co2SavedKgPerMonth"] == 0

        # Second identical call hits plan cache
        resp2 = tc.post("/api/plan", json=sample_profile_dict)
        assert resp2.status_code == 200
        assert resp2.json()["summary"] == data["summary"]


def test_plan_endpoint_falls_back_when_gemini_returns_invalid_json(
    tmp_path: Path,
    sample_profile_dict: dict[str, Any],
) -> None:
    settings = Settings(gemini_api_key="test-placeholder-for-mock")
    g_client = GeminiClient(settings, sdk_client=_FakeSdkClient("{not valid json"))
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    app = create_app(
        settings=settings,
        gemini_client=g_client,
        http_client=build_mock_http_client(),
        dist_dir=dist_dir,
    )
    with TestClient(app) as tc:
        resp = tc.post("/api/plan", json=sample_profile_dict)
    assert resp.status_code == 200
    assert resp.json()["generatedBy"] == "rules"
