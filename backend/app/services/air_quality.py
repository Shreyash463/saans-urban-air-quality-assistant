"""Live air quality service backed by Open-Meteo Geocoding + Air Quality APIs."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

import httpx

from app.schemas import AirQualityReading, strip_control_chars
from app.services.cache import TTLCache
from app.services.cpcb import compute_cpcb_aqi_from_hourly

logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

DEMO_CITY_TABLE: dict[str, tuple[str, int, str]] = {
    "delhi": ("Delhi", 380, "PM2.5"),
    "new delhi": ("New Delhi", 380, "PM2.5"),
    "lucknow": ("Lucknow", 310, "PM2.5"),
    "kolkata": ("Kolkata", 240, "PM2.5"),
    "mumbai": ("Mumbai", 150, "PM10"),
    "pune": ("Pune", 130, "PM10"),
    "noida": ("Noida", 365, "PM2.5"),
    "gurugram": ("Gurugram", 350, "PM2.5"),
    "patna": ("Patna", 295, "PM2.5"),
    "bengaluru": ("Bengaluru", 95, "PM10"),
    "chennai": ("Chennai", 110, "PM10"),
}

_DEVANAGARI_CITY_MAP: dict[str, str] = {
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

UNKNOWN_CITY_AQI = 160
LIVE_SOURCE_DETAIL = "Open-Meteo, PM-based CPCB estimate"
DEMO_SOURCE_DETAIL = "Sample reading"


def get_demo_air_quality(city: str) -> AirQualityReading:
    """Returns deterministic demo AQI reading matching frontend mock table."""
    cleaned = strip_control_chars(city) or "Delhi"
    normalized = cleaned.lower()
    entry = DEMO_CITY_TABLE.get(normalized)
    if entry is not None:
        display_name, aqi, dominant = entry
        return AirQualityReading(
            city=display_name,
            aqi=aqi,
            dominant_pollutant=dominant,
            updated_at="",
            source="demo",
            source_detail=DEMO_SOURCE_DETAIL,
        )
    return AirQualityReading(
        city=cleaned,
        aqi=UNKNOWN_CITY_AQI,
        dominant_pollutant="PM2.5",
        updated_at="",
        source="demo",
        source_detail=DEMO_SOURCE_DETAIL,
    )


def _select_geocode_result(results: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Prefers India results when ambiguous; otherwise returns the first match."""
    if not results:
        return None
    for item in results:
        code = str(item.get("country_code", "")).upper()
        country = str(item.get("country", "")).lower()
        if code == "IN" or country == "india":
            return item
    return results[0]


def _parse_hourly_series(
    payload: dict[str, Any],
    now_utc: datetime | None = None,
) -> tuple[int, str, str] | None:
    """Extracts up to 24 observed hourly PM values up to current time and computes CPCB AQI."""
    hourly = payload.get("hourly")
    if not isinstance(hourly, dict):
        return None

    times = hourly.get("time")
    pm25_raw = hourly.get("pm2_5")
    pm10_raw = hourly.get("pm10")

    if not isinstance(times, list) or not times:
        return None
    if not isinstance(pm25_raw, list):
        pm25_raw = [None] * len(times)
    if not isinstance(pm10_raw, list):
        pm10_raw = [None] * len(times)

    offset_seconds = int(payload.get("utc_offset_seconds") or 0)
    tz = timezone(timedelta(seconds=offset_seconds))
    reference_now = (now_utc or datetime.now(UTC)).astimezone(tz)

    filtered: list[tuple[datetime, float | None, float | None]] = []
    all_parsed: list[tuple[datetime, float | None, float | None]] = []

    for idx, raw_ts in enumerate(times):
        if not isinstance(raw_ts, str):
            continue
        try:
            dt = datetime.fromisoformat(raw_ts)
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)

        pm25_val = pm25_raw[idx] if idx < len(pm25_raw) else None
        pm10_val = pm10_raw[idx] if idx < len(pm10_raw) else None

        pm25_num = float(pm25_val) if isinstance(pm25_val, (int, float)) else None
        pm10_num = float(pm10_val) if isinstance(pm10_val, (int, float)) else None

        all_parsed.append((dt, pm25_num, pm10_num))
        if dt <= reference_now:
            filtered.append((dt, pm25_num, pm10_num))

    series = filtered if len(filtered) >= 12 else all_parsed
    if len(series) < 12:
        return None

    pm25_list = [row[1] for row in series]
    pm10_list = [row[2] for row in series]
    computed = compute_cpcb_aqi_from_hourly(pm25_list, pm10_list)
    if computed is None:
        return None

    aqi, dominant = computed

    latest_dt: datetime | None = None
    for dt, p25, p10 in reversed(series[-24:]):
        if (p25 is not None and p25 >= 0) or (p10 is not None and p10 >= 0):
            latest_dt = dt
            break

    if latest_dt is None:
        return None

    return aqi, dominant, latest_dt.isoformat()


class AirQualityService:
    """Fetches, computes, caches, and falls back for city air quality readings."""

    def __init__(
        self,
        cache: TTLCache[AirQualityReading],
        timeout_seconds: float = 8.0,
    ) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds

    async def get_air_quality(
        self,
        city: str,
        http_client: httpx.AsyncClient,
    ) -> AirQualityReading:
        """Fetches live Open-Meteo AQI for city (cached 10 min) or falls back to demo."""
        cleaned = strip_control_chars(city) or "Delhi"
        cache_key = cleaned.lower()

        cached = await self._cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            reading = await self._fetch_live(cleaned, http_client)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Air quality lookup failed for city=%r (%s); using demo", cleaned, type(exc).__name__)
            return get_demo_air_quality(cleaned)

        if reading is None:
            return get_demo_air_quality(cleaned)

        await self._cache.set(cache_key, reading)
        return reading

    async def _fetch_live(
        self,
        city: str,
        http_client: httpx.AsyncClient,
    ) -> AirQualityReading | None:
        query_city = _DEVANAGARI_CITY_MAP.get(city, city)
        geo_resp = await http_client.get(
            GEOCODING_URL,
            params={
                "name": query_city,
                "count": 10,
                "language": "en",
                "format": "json",
            },
            timeout=self._timeout_seconds,
        )
        geo_resp.raise_for_status()
        geo_data = geo_resp.json()
        results = geo_data.get("results") if isinstance(geo_data, dict) else None
        if not isinstance(results, list) or not results:
            return None

        match = _select_geocode_result(results)
        if match is None:
            return None

        lat = match.get("latitude")
        lon = match.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return None

        resolved_name = str(match.get("name") or city).strip() or city

        aq_resp = await http_client.get(
            AIR_QUALITY_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "pm10,pm2_5",
                "past_days": 1,
                "forecast_days": 1,
                "timezone": "auto",
            },
            timeout=self._timeout_seconds,
        )
        aq_resp.raise_for_status()
        aq_data = aq_resp.json()
        if not isinstance(aq_data, dict):
            return None

        parsed = _parse_hourly_series(aq_data)
        if parsed is None:
            return None

        aqi, dominant, updated_at = parsed
        return AirQualityReading(
            city=resolved_name,
            aqi=aqi,
            dominant_pollutant=dominant,
            updated_at=updated_at,
            source="live",
            source_detail=LIVE_SOURCE_DETAIL,
        )
