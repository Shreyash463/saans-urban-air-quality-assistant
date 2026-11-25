"""Property-based tests (Hypothesis) for CPCB breakpoints and impact math invariants."""

from __future__ import annotations

from app.schemas import UserProfile
from app.services.cpcb import (
    compute_cpcb_aqi_from_means,
    compute_pm10_sub_index,
    compute_pm25_sub_index,
)
from app.services.impact import (
    MAX_PM25_REDUCTION_PCT,
    calculate_multiplicative_pm25_reduction,
    calculate_profile_impact,
)
from hypothesis import given
from hypothesis import strategies as st

_ACTION_IDS = (
    "commute_transit",
    "stop_waste_burning",
    "bedroom_purifier",
    "close_windows_peak",
    "clean_cooking",
    "carpool_three_days",
    "fitted_n95_mask",
    "seal_door_gaps",
)


@given(
    low=st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False),
    delta=st.floats(min_value=0.0, max_value=400.0, allow_nan=False, allow_infinity=False),
)
def test_cpcb_subindices_are_monotonic_and_bounded(low: float, delta: float) -> None:
    high = low + delta
    pm25_lo = compute_pm25_sub_index(low)
    pm25_hi = compute_pm25_sub_index(high)
    pm10_lo = compute_pm10_sub_index(low)
    pm10_hi = compute_pm10_sub_index(high)

    assert 0.0 <= pm25_lo <= pm25_hi <= 500.0
    assert 0.0 <= pm10_lo <= pm10_hi <= 500.0


@given(
    pm25=st.one_of(st.none(), st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False)),
    pm10=st.one_of(st.none(), st.floats(min_value=0.0, max_value=600.0, allow_nan=False, allow_infinity=False)),
)
def test_cpcb_overall_aqi_bounds_and_dominance(pm25: float | None, pm10: float | None) -> None:
    if pm25 is None and pm10 is None:
        return
    aqi, dominant = compute_cpcb_aqi_from_means(pm25, pm10)
    assert 0 <= aqi <= 500
    assert dominant in {"PM2.5", "PM10"}


@given(
    fractions=st.lists(
        st.floats(min_value=0.0, max_value=0.95, allow_nan=False, allow_infinity=False),
        max_size=12,
    ),
    data=st.data(),
)
def test_multiplicative_pm25_stacking_is_bounded_and_order_independent(
    fractions: list[float],
    data: st.DataObject,
) -> None:
    shuffled = data.draw(st.permutations(fractions))
    res_a = calculate_multiplicative_pm25_reduction(fractions)
    res_b = calculate_multiplicative_pm25_reduction(list(shuffled))
    assert res_a == res_b
    assert 0 <= res_a <= MAX_PM25_REDUCTION_PCT


@given(
    selected=st.lists(st.sampled_from(_ACTION_IDS), max_size=8),
    commute_km=st.integers(min_value=0, max_value=120),
    has_purifier=st.booleans(),
)
def test_profile_impact_score_consistency_and_floor(
    selected: list[str],
    commute_km: int,
    has_purifier: bool,
) -> None:
    profile = UserProfile.model_validate(
        {
            "city": "Delhi",
            "householdSize": 4,
            "hasChildren": True,
            "hasElderly": False,
            "hasRespiratoryCondition": False,
            "commuteMode": "car",
            "commuteKm": commute_km,
            "homeType": "apartment",
            "hasAirPurifier": has_purifier,
            "cookingFuel": "lpg",
            "budget": "medium",
            "language": "en",
        }
    )
    impact = calculate_profile_impact(profile, selected)
    assert 5 <= impact["after_exposure_pct"] <= impact["before_exposure_pct"] <= 100
    assert impact["air_friendly_score"] == 100 - impact["after_exposure_pct"]
    assert impact["baseline_score"] == 100 - impact["before_exposure_pct"]
    assert impact["total_exposure_cut_pct"] <= MAX_PM25_REDUCTION_PCT
