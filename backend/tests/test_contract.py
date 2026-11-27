"""Contract test validating shared fixture and impact constants across Python and TypeScript."""

import json
from pathlib import Path

import pytest
from app.schemas import (
    CITY_MAX_LENGTH,
    COMMUTE_KM_MAX,
    COMMUTE_KM_MIN,
    HOUSEHOLD_SIZE_MAX,
    HOUSEHOLD_SIZE_MIN,
    QUESTION_MAX_LENGTH,
    PlanResponse,
    UserProfile,
)
from app.services.impact import MAX_PM25_REDUCTION_PCT
from pydantic import ValidationError

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_shared_plan_sample_contract() -> None:
    sample_path = REPO_ROOT / "contract" / "plan.sample.json"
    data = json.loads(sample_path.read_text(encoding="utf-8"))
    model = PlanResponse.model_validate(data)
    assert model.aqi.city == "Delhi"
    assert model.generated_by == "gemini"
    assert len(model.routine) == 4


def test_shared_impact_constants_match_contract() -> None:
    factors_path = REPO_ROOT / "contract" / "impact-factors.json"
    data = json.loads(factors_path.read_text(encoding="utf-8"))
    assert data["constants"]["MAX_PM25_REDUCTION_PCT"] == MAX_PM25_REDUCTION_PCT
    assert len(data["actions"]) == 8


def test_shared_limits_contract_matches_backend_schema() -> None:
    limits = json.loads((REPO_ROOT / "contract" / "limits.json").read_text(encoding="utf-8"))
    schema = json.loads((REPO_ROOT / "contract" / "api.schema.json").read_text(encoding="utf-8"))
    props = schema["models"]["UserProfile"]["properties"]
    q_props = schema["models"]["ChatRequest"]["properties"]

    assert limits == {
        "cityMaxLength": CITY_MAX_LENGTH,
        "commuteKmMax": COMMUTE_KM_MAX,
        "commuteKmMin": COMMUTE_KM_MIN,
        "householdSizeMax": HOUSEHOLD_SIZE_MAX,
        "householdSizeMin": HOUSEHOLD_SIZE_MIN,
        "questionMaxLength": QUESTION_MAX_LENGTH,
    }
    assert props["householdSize"]["minimum"] == HOUSEHOLD_SIZE_MIN == 1
    assert props["householdSize"]["maximum"] == HOUSEHOLD_SIZE_MAX == 20
    assert props["commuteKm"]["minimum"] == COMMUTE_KM_MIN == 0
    assert props["commuteKm"]["maximum"] == COMMUTE_KM_MAX == 300
    assert props["city"]["maxLength"] == CITY_MAX_LENGTH == 60
    assert q_props["question"]["maxLength"] == QUESTION_MAX_LENGTH == 500

    base = {
        "city": "Delhi",
        "householdSize": HOUSEHOLD_SIZE_MAX,
        "hasChildren": True,
        "hasElderly": False,
        "hasRespiratoryCondition": False,
        "commuteMode": "car",
        "commuteKm": COMMUTE_KM_MAX,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "low",
        "language": "en",
    }
    assert UserProfile.model_validate(base).commute_km == 300
    with pytest.raises(ValidationError):
        UserProfile.model_validate({**base, "householdSize": HOUSEHOLD_SIZE_MAX + 1})
    with pytest.raises(ValidationError):
        UserProfile.model_validate({**base, "commuteKm": COMMUTE_KM_MAX + 1})
