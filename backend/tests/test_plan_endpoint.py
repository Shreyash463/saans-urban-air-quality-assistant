"""Tests for POST /api/plan endpoint, Gemini integration, validation, latency logging, and rule fallback."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.config import Settings
from app.services.gemini import GeminiClient
from fastapi.testclient import TestClient
from tests.helpers import FakeAsyncModels, make_full_gemini_payload, make_sdk_client, make_test_app


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
    assert len(data["routine"]) == 4 and 5 <= len(data["indoorHacks"]) <= 7
    assert "Not medical advice" in data["disclaimer"]


def test_plan_endpoint_rejects_invalid_inputs_with_422(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    assert client.post("/api/plan", json={**sample_profile_dict, "city": "<script>alert(1)</script>"}).status_code == 422
    assert client.post("/api/plan", json={**sample_profile_dict, "unexpected": "bad"}).status_code == 422
    assert client.post("/api/plan", json={**sample_profile_dict, "householdSize": 25}).status_code == 422
    assert client.post("/api/plan", json={**sample_profile_dict, "commuteKm": 350}).status_code == 422


def test_plan_endpoint_with_mocked_gemini_grounds_numbers_and_enforces_safety(
    tmp_path: Path,
    sample_profile_dict: dict[str, Any],
) -> None:
    settings = Settings(gemini_api_key="test-key")
    g_client = GeminiClient(settings, sdk_client=make_sdk_client(make_full_gemini_payload(unsafe=True)))
    app = make_test_app(tmp_path, settings=settings, gemini_client=g_client)

    with TestClient(app) as tc:
        data = tc.post("/api/plan", json=sample_profile_dict).json()
        assert data["generatedBy"] == "gemini"
        assert "outdoor exercise is safe" not in data["healthAdvisory"].lower()
        assert "n95" in data["maskGuidance"].lower()
        assert all(alt["pm25ReductionPct"] <= 95 for alt in data["alternatives"])
        assert data["alternatives"][2]["co2SavedKgPerMonth"] == 0

        resp2 = tc.post("/api/plan", json=sample_profile_dict)
        assert resp2.status_code == 200 and resp2.json()["summary"] == data["summary"]


def test_plan_endpoint_falls_back_when_gemini_returns_invalid_json(
    tmp_path: Path,
    sample_profile_dict: dict[str, Any],
) -> None:
    settings = Settings(gemini_api_key="test-key")
    g_client = GeminiClient(settings, sdk_client=make_sdk_client("{not valid json"))
    app = make_test_app(tmp_path, settings=settings, gemini_client=g_client)
    with TestClient(app) as tc:
        resp = tc.post("/api/plan", json=sample_profile_dict)
    assert resp.status_code == 200 and resp.json()["generatedBy"] == "rules"


def test_plan_cache_miss_logs_post_generation_latency_with_injected_clock(
    tmp_path: Path,
    sample_profile_dict: dict[str, Any],
    caplog: Any,
) -> None:
    now = 100.0
    sample_plan = json.loads((Path(__file__).resolve().parents[2] / "contract" / "plan.sample.json").read_text(encoding="utf-8"))
    sample_plan["communityActions"] = []
    fake_json = json.dumps({k: sample_plan[k] for k in ("summary", "healthAdvisory", "routine", "indoorHacks", "alternatives", "maskGuidance")})

    class _AdvancingModels(FakeAsyncModels):
        async def generate_content(self, **_kwargs: Any) -> Any:
            nonlocal now
            now += 0.5
            return type("Resp", (), {"text": fake_json})()

    settings = Settings(gemini_api_key="test-key")
    sdk = type("Sdk", (), {"aio": type("Aio", (), {"models": _AdvancingModels(fake_json)})()})()
    app = make_test_app(tmp_path, settings=settings, gemini_client=GeminiClient(settings, sdk_client=sdk))

    with caplog.at_level("INFO", logger="saans"), TestClient(app) as tc:
        app.state.clock = lambda: now
        resp = tc.post("/api/plan", json={**sample_profile_dict, "householdSize": 20, "commuteKm": 300})
    assert resp.status_code == 200
    miss_logs = [rec.getMessage() for rec in caplog.records if "route=/api/plan cache=miss" in rec.getMessage()]
    assert len(miss_logs) == 1 and "latency_ms=500" in miss_logs[0]
