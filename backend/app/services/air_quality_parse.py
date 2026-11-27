"""Open-Meteo geocoding/hourly payload parsers and CPCB demo-city fallback loader."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

from app.config import PROJECT_ROOT
from app.schemas import AirQualityReading, strip_control_chars
from app.services.cpcb import compute_cpcb_aqi_from_hourly

LIVE_SOURCE_DETAIL = "Open-Meteo, PM-based CPCB estimate"
DEMO_SOURCE_DETAIL = "Sample reading"

DEVANAGARI_CITY_MAP: MappingProxyType[str, str] = MappingProxyType(
    {
        "दिल्ली": "Delhi",
        "नई दिल्ली": "New Delhi",
        "लखनऊ": "Lucknow",
        "कोलकाता": "Kolkata",
        "मुंबई": "Mumbai",
        "पुणे": "Pune",
        "नोएडा": "Noida",
        "गुरुग्राम": "Gurugram",
        "पटना": "Patna",
        "बेंगलुरु": "Bengaluru",
        "चेन्नई": "Chennai",
    }
)


@lru_cache(maxsize=1)
def _demo_cities() -> tuple[MappingProxyType[str, tuple[str, int, str]], int]:
    raw = json.loads((Path(PROJECT_ROOT) / "contract" / "demo-cities.json").read_text(encoding="utf-8"))
    table = {
        key: (str(val["displayName"]), int(val["aqi"]), str(val["dominantPollutant"]))
        for key, val in raw["cities"].items()
    }
    return MappingProxyType(table), int(raw["unknownCityAqi"])


def get_demo_air_quality(city: str) -> AirQualityReading:
    table, unknown_aqi = _demo_cities()
    cleaned = strip_control_chars(city) or "Delhi"
    entry = table.get(cleaned.lower())
    if entry is not None:
        display_name, aqi, dominant = entry
    else:
        display_name, aqi, dominant = cleaned, unknown_aqi, "PM2.5"
    return AirQualityReading(
        city=display_name,
        aqi=aqi,
        dominant_pollutant=dominant,
        updated_at="",
        source="demo",
        source_detail=DEMO_SOURCE_DETAIL,
    )


def select_geocode_result(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Prefers India results when ambiguous; otherwise returns the first match."""
    for item in results:
        if str(item.get("country_code", "")).upper() == "IN" or str(item.get("country", "")).lower() == "india":
            return item
    return results[0] if results else None


def _to_float_or_none(raw: object) -> float | None:
    return float(raw) if isinstance(raw, (int, float)) else None


def _parse_dt_with_tz(raw_ts: object, tz: timezone) -> datetime | None:
    if not isinstance(raw_ts, str):
        return None
    try:
        dt = datetime.fromisoformat(raw_ts)
    except ValueError:
        return None
    return dt.replace(tzinfo=tz) if dt.tzinfo is None else dt


def _collect_hourly_points(
    times: list[Any],
    pm25_raw: list[Any],
    pm10_raw: list[Any],
    tz: timezone,
    reference_now: datetime,
) -> list[tuple[datetime, float | None, float | None]]:
    filtered: list[tuple[datetime, float | None, float | None]] = []
    all_parsed: list[tuple[datetime, float | None, float | None]] = []
    for idx, raw_ts in enumerate(times):
        dt = _parse_dt_with_tz(raw_ts, tz)
        if dt is None:
            continue
        pm25_num = _to_float_or_none(pm25_raw[idx]) if idx < len(pm25_raw) else None
        pm10_num = _to_float_or_none(pm10_raw[idx]) if idx < len(pm10_raw) else None
        point = (dt, pm25_num, pm10_num)
        all_parsed.append(point)
        if dt <= reference_now:
            filtered.append(point)
    return filtered if len(filtered) >= 12 else all_parsed


def _pick_latest_timestamp(series: list[tuple[datetime, float | None, float | None]]) -> datetime | None:
    for dt, p25, p10 in reversed(series[-24:]):
        if (p25 is not None and p25 >= 0) or (p10 is not None and p10 >= 0):
            return dt
    return None


def _extract_hourly_arrays(payload: dict[str, Any]) -> tuple[list[Any], list[Any], list[Any]] | None:
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        return None
    times, pm25_raw, pm10_raw = hourly.get("time"), hourly.get("pm2_5"), hourly.get("pm10")
    if isinstance(times, list) and isinstance(pm25_raw, list) and isinstance(pm10_raw, list):
        return times, pm25_raw, pm10_raw
    return None


def parse_hourly_series(
    payload: dict[str, Any],
    now_utc: datetime | None = None,
) -> tuple[int, str, str] | None:
    """Extracts up to 24 observed hourly PM values up to current time and computes CPCB AQI."""
    arrays = _extract_hourly_arrays(payload)
    if arrays is None:
        return None
    times, pm25_raw, pm10_raw = arrays
    tz = timezone(timedelta(seconds=int(payload.get("utc_offset_seconds", 0) or 0)))
    reference_now = (now_utc or datetime.now(UTC)).astimezone(tz)
    series = _collect_hourly_points(times, pm25_raw, pm10_raw, tz, reference_now)
    if len(series) < 12:
        return None
    computed = compute_cpcb_aqi_from_hourly([r[1] for r in series], [r[2] for r in series])
    if computed is None:
        return None
    latest_dt = _pick_latest_timestamp(series)
    return (computed[0], computed[1], latest_dt.isoformat()) if latest_dt is not None else None
