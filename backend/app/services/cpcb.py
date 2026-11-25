"""Indian CPCB National Air Quality Index (NAQI) calculation helpers."""

from __future__ import annotations

from dataclasses import dataclass

# Breakpoint tuples: (bp_lo, bp_hi, idx_lo, idx_hi)
# Includes continuous 1-unit transition bridges between integer CPCB tiers so
# decimal 24-hour means never fall into a gap while exact integer boundaries
# match the official CPCB table precisely.
PM25_BREAKPOINTS: tuple[tuple[float, float, float, float], ...] = (
    (0.0, 30.0, 0.0, 50.0),
    (30.0, 31.0, 50.0, 51.0),
    (31.0, 60.0, 51.0, 100.0),
    (60.0, 61.0, 100.0, 101.0),
    (61.0, 90.0, 101.0, 200.0),
    (90.0, 91.0, 200.0, 201.0),
    (91.0, 120.0, 201.0, 300.0),
    (120.0, 121.0, 300.0, 301.0),
    (121.0, 250.0, 301.0, 400.0),
    (250.0, 251.0, 400.0, 401.0),
    (251.0, 380.0, 401.0, 500.0),
)

PM10_BREAKPOINTS: tuple[tuple[float, float, float, float], ...] = (
    (0.0, 50.0, 0.0, 50.0),
    (50.0, 51.0, 50.0, 51.0),
    (51.0, 100.0, 51.0, 100.0),
    (100.0, 101.0, 100.0, 101.0),
    (101.0, 250.0, 101.0, 200.0),
    (250.0, 251.0, 200.0, 201.0),
    (251.0, 350.0, 201.0, 300.0),
    (350.0, 351.0, 300.0, 301.0),
    (351.0, 430.0, 301.0, 400.0),
    (430.0, 431.0, 400.0, 401.0),
    (431.0, 510.0, 401.0, 500.0),
)

MIN_VALID_HOURS = 12


@dataclass(frozen=True)
class AqiCategoryMeta:
    """CPCB category descriptor for English and Hindi prompts and safety tiers."""

    key: str
    label_en: str
    label_hi: str
    min_aqi: int
    max_aqi: int


CPCB_CATEGORIES: tuple[AqiCategoryMeta, ...] = (
    AqiCategoryMeta("good", "Good", "अच्छा", 0, 50),
    AqiCategoryMeta("satisfactory", "Satisfactory", "संतोषजनक", 51, 100),
    AqiCategoryMeta("moderate", "Moderate", "मध्यम", 101, 200),
    AqiCategoryMeta("poor", "Poor", "खराब", 201, 300),
    AqiCategoryMeta("very_poor", "Very Poor", "बहुत खराब", 301, 400),
    AqiCategoryMeta("severe", "Severe", "गंभीर", 401, 500),
)


def compute_sub_index(
    concentration: float,
    breakpoints: tuple[tuple[float, float, float, float], ...],
) -> float:
    """Computes a CPCB sub-index using piecewise linear interpolation, capped at 500."""
    if concentration <= 0:
        return 0.0
    for bp_lo, bp_hi, idx_lo, idx_hi in breakpoints:
        if concentration <= bp_hi:
            span = bp_hi - bp_lo
            if span <= 0:
                return min(500.0, idx_hi)
            sub = ((idx_hi - idx_lo) / span) * (concentration - bp_lo) + idx_lo
            return min(500.0, max(0.0, sub))
    return 500.0


def compute_pm25_sub_index(pm25: float) -> float:
    """Computes CPCB sub-index for 24-hour mean PM2.5 (ug/m3)."""
    return compute_sub_index(pm25, PM25_BREAKPOINTS)


def compute_pm10_sub_index(pm10: float) -> float:
    """Computes CPCB sub-index for 24-hour mean PM10 (ug/m3)."""
    return compute_sub_index(pm10, PM10_BREAKPOINTS)


def compute_cpcb_aqi_from_means(pm25_mean: float | None, pm10_mean: float | None) -> tuple[int, str]:
    """Computes overall CPCB AQI (rounded, capped at 500) and dominant pollutant."""
    if pm25_mean is None and pm10_mean is None:
        raise ValueError("At least one pollutant mean is required.")

    pm25_sub = compute_pm25_sub_index(pm25_mean) if pm25_mean is not None else -1.0
    pm10_sub = compute_pm10_sub_index(pm10_mean) if pm10_mean is not None else -1.0

    if pm25_sub >= pm10_sub:
        dominant = "PM2.5"
        raw_aqi = pm25_sub
    else:
        dominant = "PM10"
        raw_aqi = pm10_sub

    return min(500, max(0, int(round(raw_aqi)))), dominant


def compute_cpcb_aqi_from_hourly(
    pm25_values: list[float | None],
    pm10_values: list[float | None],
) -> tuple[int, str] | None:
    """Computes CPCB AQI from up to 24 hourly PM2.5/PM10 observations.

    Skips None/negative/non-finite entries and requires at least 12 valid hours
    for at least one pollutant (preferring the last 24 hours). Returns None if
    data is insufficient.
    """
    valid_pm25 = _clean_recent_values(pm25_values)
    valid_pm10 = _clean_recent_values(pm10_values)

    pm25_mean = sum(valid_pm25) / len(valid_pm25) if len(valid_pm25) >= MIN_VALID_HOURS else None
    pm10_mean = sum(valid_pm10) / len(valid_pm10) if len(valid_pm10) >= MIN_VALID_HOURS else None

    if pm25_mean is None and pm10_mean is None:
        return None

    return compute_cpcb_aqi_from_means(pm25_mean, pm10_mean)


def _clean_recent_values(values: list[float | None]) -> list[float]:
    recent = values[-24:]
    cleaned: list[float] = []
    for v in recent:
        if v is None:
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        if fv >= 0 and fv == fv:  # filters NaN without math import
            cleaned.append(fv)
    return cleaned


def get_aqi_category(aqi: int) -> AqiCategoryMeta:
    """Maps a numeric AQI [0, 500] to its CPCB category descriptor."""
    clamped = min(500, max(0, int(round(aqi))))
    for cat in CPCB_CATEGORIES:
        if cat.min_aqi <= clamped <= cat.max_aqi:
            return cat
    return CPCB_CATEGORIES[-1]
