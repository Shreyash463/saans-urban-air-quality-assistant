"""Contract test validating shared fixture and impact constants across Python and TypeScript."""

import json
from pathlib import Path

from app.schemas import PlanResponse
from app.services.impact import MAX_PM25_REDUCTION_PCT

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
