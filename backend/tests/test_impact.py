"""Tests for shared impact math, multiplicative cap, CO2 rules, and grounding."""

from app.schemas import Alternative, UserProfile
from app.services.impact import (
    MAX_PM25_REDUCTION_PCT,
    build_profile_facts,
    calculate_multiplicative_pm25_reduction,
    calculate_profile_impact,
    ground_alternatives_numbers,
)


def _profile(**overrides: object) -> UserProfile:
    base = {
        "city": "Delhi",
        "householdSize": 4,
        "hasChildren": True,
        "hasElderly": False,
        "hasRespiratoryCondition": False,
        "commuteMode": "car",
        "commuteKm": 20,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "medium",
        "language": "en",
    }
    base.update(overrides)
    return UserProfile.model_validate(base)


def test_multiplicative_stacking_and_95_cap() -> None:
    assert calculate_multiplicative_pm25_reduction([0.5, 0.5]) == 75
    assert calculate_multiplicative_pm25_reduction([0.4, 0.3]) == 58
    assert calculate_multiplicative_pm25_reduction([0.9, 0.9, 0.9]) <= MAX_PM25_REDUCTION_PCT


def test_already_doing_excluded_from_additional_savings_and_co2_scoped() -> None:
    green = _profile(
        commuteMode="public_transport",
        cookingFuel="induction_electric",
        hasAirPurifier=True,
    )
    facts = build_profile_facts(green)
    assert len(facts.already_doing) == 3

    # Non-emission actions must yield 0 CO2
    res_non_emission = calculate_profile_impact(
        _profile(),
        ["close_windows_peak", "fitted_n95_mask", "seal_door_gaps", "bedroom_purifier"],
    )
    assert res_non_emission["co2_saved_kg_per_month"] == 0
    assert res_non_emission["additional_exposure_cut_pct"] > 0

    # Attempting to pass already_doing actions yields 0 additional cut
    res_double = calculate_profile_impact(
        green,
        ["commute_transit", "clean_cooking", "bedroom_purifier", "carpool_three_days"],
    )
    assert res_double["additional_exposure_cut_pct"] == 0
    assert res_double["co2_saved_kg_per_month"] == 0


def test_ground_alternatives_numbers_clamps_and_zeros_non_emission_co2() -> None:
    prof = _profile(commuteMode="public_transport", cookingFuel="induction_electric", hasAirPurifier=True)
    raw_alts = [
        Alternative(
            current="Cloth mask",
            swap="Wear fitted N95 mask",
            why="Blocks fine PM2.5",
            pm25ReductionPct=95,
            co2SavedKgPerMonth=99,
        ),
        Alternative(
            current="No exhaust",
            swap="Run kitchen exhaust fan",
            why="Vents frying smoke",
            pm25ReductionPct=88,
            co2SavedKgPerMonth=50,
        ),
    ]
    grounded = ground_alternatives_numbers(raw_alts, prof)
    assert grounded[0].co2_saved_kg_per_month == 0
    assert grounded[1].co2_saved_kg_per_month == 0
    assert 0 <= grounded[0].pm25_reduction_pct <= MAX_PM25_REDUCTION_PCT
