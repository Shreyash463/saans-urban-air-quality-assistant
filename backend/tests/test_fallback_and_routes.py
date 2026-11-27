"""Additional tests covering all commute/fuel/Hindi fallback paths and route limits."""

from __future__ import annotations

from typing import Any

import pytest
from app.schemas import AirQualityReading, UserProfile
from app.services.fallback_chat import generate_fallback_chat_reply
from app.services.fallback_plan import generate_fallback_plan
from fastapi.testclient import TestClient


@pytest.mark.parametrize("language", ["en", "hi"])
@pytest.mark.parametrize(
    "commute_mode",
    ["car", "two_wheeler", "public_transport", "walk_cycle", "work_from_home"],
)
@pytest.mark.parametrize("cooking_fuel", ["lpg", "induction_electric", "biomass_wood"])
def test_fallback_plan_variants_are_coherent_and_exclude_existing_habits(
    language: str,
    commute_mode: str,
    cooking_fuel: str,
) -> None:
    profile = UserProfile.model_validate(
        {
            "city": "Lucknow",
            "householdSize": 4,
            "hasChildren": True,
            "hasElderly": True,
            "hasRespiratoryCondition": True,
            "commuteMode": commute_mode,
            "commuteKm": 0 if commute_mode == "work_from_home" else 16,
            "homeType": "independent_house",
            "hasAirPurifier": commute_mode == "public_transport",
            "cookingFuel": cooking_fuel,
            "budget": "high",
            "language": language,
        }
    )
    reading = AirQualityReading(
        city="Lucknow",
        aqi=310,
        dominantPollutant="PM2.5",
        updated_at="",
        source="demo",
        sourceDetail="Sample reading",
    )
    plan = generate_fallback_plan(profile, reading)
    assert plan.generated_by == "rules"
    assert len(plan.routine) == 4
    assert [r.time_slot for r in plan.routine] == ["morning", "midday", "evening", "night"]
    assert 5 <= len(plan.indoor_hacks) <= 7
    assert 3 <= len(plan.alternatives) <= 5

    # Public transport morning routine should not claim eliminating private tailpipe emissions
    morning = plan.routine[0]
    if commute_mode == "public_transport" and language == "en":
        assert "metro/bus" in morning.title.lower()
        assert "private tailpipe" not in morning.impact_note.lower()

    # Induction cooking must not get a cooking fuel switch with >0 CO2
    if cooking_fuel == "induction_electric":
        assert plan.alternatives[1].co2_saved_kg_per_month == 0


@pytest.mark.parametrize("language", ["en", "hi"])
@pytest.mark.parametrize(
    "question",
    [
        "Which N95 mask should I wear?",
        "Should I buy a HEPA purifier or DIY box fan?",
        "What is the cheapest indoor way?",
        "How to manage cooking smoke and tadka?",
        "Tips for my daily commute?",
        "When should I open windows for ventilation?",
        "Is it safe for kids to play outside?",
        "What about my pet bird indoors?",
    ],
)
def test_fallback_chat_intents_en_and_hi(language: str, question: str) -> None:
    profile = UserProfile.model_validate(
        {
            "city": "Pune",
            "householdSize": 3,
            "hasChildren": True,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "two_wheeler",
            "commuteKm": 14,
            "homeType": "apartment",
            "hasAirPurifier": False,
            "cookingFuel": "lpg",
            "budget": "low",
            "language": language,
        }
    )
    reading = AirQualityReading(
        city="Pune",
        aqi=130,
        dominantPollutant="PM10",
        updated_at="2026-11-25T12:00:00+05:30",
        source="live",
    )
    plan = generate_fallback_plan(profile, reading)
    reply = generate_fallback_chat_reply(question, profile, plan)
    assert len(reply.answer) > 20


def test_air_quality_and_chat_rate_limits_and_validation(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    for _ in range(60):
        resp = client.get("/api/air-quality?city=Delhi")
        assert resp.status_code == 200

    limited = client.get("/api/air-quality?city=Delhi")
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1

    plan = client.post("/api/plan", json=sample_profile_dict).json()
    for _ in range(20):
        chat_ok = client.post(
            "/api/chat",
            json={"question": "Hello", "profile": sample_profile_dict, "plan": plan},
        )
        assert chat_ok.status_code == 200

    chat_limited = client.post(
        "/api/chat",
        json={"question": "Hello", "profile": sample_profile_dict, "plan": plan},
    )
    assert chat_limited.status_code == 429
    assert int(chat_limited.headers["retry-after"]) >= 1
