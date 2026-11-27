"""Additional tests covering all commute/fuel/Hindi fallback paths and route limits."""

from __future__ import annotations

from typing import Any

import pytest
from app.services.fallback_chat import generate_fallback_chat_reply
from app.services.fallback_plan import generate_fallback_plan
from fastapi.testclient import TestClient
from tests.helpers import make_profile, make_reading


@pytest.mark.parametrize("language", ["en", "hi"])
@pytest.mark.parametrize(
    "commute_mode",
    ["car", "two_wheeler", "public_transport", "walk_cycle", "work_from_home"],
)
@pytest.mark.parametrize("cooking_fuel", ["lpg", "induction_electric", "biomass_wood"])
def test_fallback_plan_variants_exclude_existing_habits(
    language: str,
    commute_mode: str,
    cooking_fuel: str,
) -> None:
    profile = make_profile(
        lang=language,
        city="Lucknow",
        hasElderly=True,
        commuteMode=commute_mode,
        commuteKm=0 if commute_mode == "work_from_home" else 16,
        homeType="independent_house",
        hasAirPurifier=commute_mode == "public_transport",
        cookingFuel=cooking_fuel,
        budget="high",
    )
    reading = make_reading(city="Lucknow", aqi=310, updated_at="", source="demo", sourceDetail="Sample reading")
    plan = generate_fallback_plan(profile, reading)
    assert plan.generated_by == "rules"
    assert [r.time_slot for r in plan.routine] == ["morning", "midday", "evening", "night"]
    assert 5 <= len(plan.indoor_hacks) <= 7 and 3 <= len(plan.alternatives) <= 5
    if commute_mode == "public_transport" and language == "en":
        assert "metro/bus" in plan.routine[0].title.lower()
        assert "private tailpipe" not in plan.routine[0].impact_note.lower()
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
        "I have mild throat cough and wheezing",
        "नमस्ते",
        "Random custom topic about smog",
    ],
)
def test_fallback_chat_intents_en_and_hi(language: str, question: str) -> None:
    profile = make_profile(lang=language, city="Pune", householdSize=3, commuteMode="two_wheeler", commuteKm=14)
    plan = generate_fallback_plan(profile, make_reading(city="Pune", aqi=130, dominantPollutant="PM10"))
    reply = generate_fallback_chat_reply(question, profile, plan)
    assert len(reply.answer) > 20


def test_fallback_chat_good_aqi_non_sensitive_branch() -> None:
    profile = make_profile(city="Pune", hasChildren=False, hasRespiratoryCondition=False)
    plan = generate_fallback_plan(profile, make_reading(city="Pune", aqi=40))
    reply = generate_fallback_chat_reply("Can kids play outdoors?", profile, plan)
    assert "comfortable" in reply.answer.lower()


def test_air_quality_and_chat_rate_limits_and_validation(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    for _ in range(60):
        assert client.get("/api/air-quality?city=Delhi").status_code == 200
    limited = client.get("/api/air-quality?city=Delhi")
    assert limited.status_code == 429 and int(limited.headers["retry-after"]) >= 1

    plan = client.post("/api/plan", json=sample_profile_dict).json()
    for _ in range(20):
        assert client.post("/api/chat", json={"question": "Hello", "profile": sample_profile_dict, "plan": plan}).status_code == 200
    chat_limited = client.post("/api/chat", json={"question": "Hello", "profile": sample_profile_dict, "plan": plan})
    assert chat_limited.status_code == 429 and int(chat_limited.headers["retry-after"]) >= 1
