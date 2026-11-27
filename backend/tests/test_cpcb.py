"""Tests for Indian CPCB AQI sub-index computation and missing-data rules."""

import pytest
from app.services.cpcb import (
    compute_cpcb_aqi_from_hourly,
    compute_cpcb_aqi_from_means,
    compute_pm10_sub_index,
    compute_pm25_sub_index,
    compute_sub_index,
    get_aqi_category,
)


@pytest.mark.parametrize(
    ("pm25", "expected"),
    [
        (0, 0),
        (30, 50),
        (31, 51),
        (60, 100),
        (61, 101),
        (90, 200),
        (91, 201),
        (120, 300),
        (121, 301),
        (250, 400),
        (251, 401),
        (380, 500),
        (900, 500),
    ],
)
def test_pm25_boundary_values_and_cap(pm25: float, expected: int) -> None:
    assert round(compute_pm25_sub_index(pm25)) == expected


@pytest.mark.parametrize(
    ("pm10", "expected"),
    [
        (0, 0),
        (50, 50),
        (51, 51),
        (100, 100),
        (101, 101),
        (250, 200),
        (251, 201),
        (350, 300),
        (351, 301),
        (430, 400),
        (431, 401),
        (510, 500),
        (950, 500),
    ],
)
def test_pm10_boundary_values_and_cap(pm10: float, expected: int) -> None:
    assert round(compute_pm10_sub_index(pm10)) == expected


def test_continuous_transition_between_integer_breakpoints() -> None:
    val = compute_pm25_sub_index(30.5)
    assert 50.0 <= val <= 51.0


def test_max_of_subindices_selects_dominant_pollutant() -> None:
    aqi_pm25, dom_pm25 = compute_cpcb_aqi_from_means(pm25_mean=120.0, pm10_mean=100.0)
    assert aqi_pm25 == 300
    assert dom_pm25 == "PM2.5"

    aqi_pm10, dom_pm10 = compute_cpcb_aqi_from_means(pm25_mean=30.0, pm10_mean=350.0)
    assert aqi_pm10 == 300
    assert dom_pm10 == "PM10"


def test_missing_hourly_values_require_at_least_12_valid_hours() -> None:
    # 11 valid hours -> insufficient
    insufficient = [50.0] * 11 + [None] * 13
    assert compute_cpcb_aqi_from_hourly(insufficient, [None] * 24) is None

    # 12 valid hours -> valid (mean of 12 values of 60 -> 100)
    sufficient = [60.0] * 12 + [None] * 12
    res = compute_cpcb_aqi_from_hourly(sufficient, [40.0] * 24)
    assert res == (100, "PM2.5")


def test_cpcb_category_boundaries() -> None:
    assert get_aqi_category(50).key == "good"
    assert get_aqi_category(51).key == "satisfactory"
    assert get_aqi_category(101).key == "moderate"
    assert get_aqi_category(201).key == "poor"
    assert get_aqi_category(301).key == "very_poor"
    assert get_aqi_category(401).key == "severe"


def test_cpcb_single_pollutant_tiebreak_and_negative_filtering() -> None:
    assert compute_cpcb_aqi_from_means(30.0, None) == (50, "PM2.5")
    assert compute_cpcb_aqi_from_means(None, 100.0) == (100, "PM10")
    assert compute_cpcb_aqi_from_means(30.0, 50.0) == (50, "PM2.5")

    assert compute_cpcb_aqi_from_hourly([50.0] * 11, [100.0] * 12) == (100, "PM10")
    assert compute_cpcb_aqi_from_hourly([-1.0] * 12 + [30.0] * 12, [None] * 24) == (50, "PM2.5")


def test_cpcb_subindex_degenerate_and_invalid_hourly_edges() -> None:
    assert compute_sub_index(0.0, ((0.0, 30.0, 0.0, 50.0),)) == 0.0
    assert compute_sub_index(5.0, ((10.0, 5.0, 0.0, 50.0),)) == 50.0
    with pytest.raises(ValueError):
        compute_cpcb_aqi_from_means(None, None)
    assert compute_cpcb_aqi_from_hourly(["bad", None, -1.0, float("nan")], [None]) is None  # type: ignore[list-item]
