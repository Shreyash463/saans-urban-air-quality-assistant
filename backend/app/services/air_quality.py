"""Live air quality service backed by Open-Meteo Geocoding + Air Quality APIs."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.schemas import AirQualityReading, strip_control_chars
from app.services.air_quality_parse import (
    DEMO_SOURCE_DETAIL as DEMO_SOURCE_DETAIL,
)
from app.services.air_quality_parse import (
    DEVANAGARI_CITY_MAP,
    parse_hourly_series,
    select_geocode_result,
)
from app.services.air_quality_parse import (
    LIVE_SOURCE_DETAIL as LIVE_SOURCE_DETAIL,
)
from app.services.air_quality_parse import (
    get_demo_air_quality as get_demo_air_quality,
)
from app.services.cache import TTLCache

logger = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
APPROX_LOCATION_LABEL = "Your location (approx.)"


class AirQualityService:
    """Fetches, computes, coalesces, and caches city/coordinate air quality readings."""

    def __init__(self, cache: TTLCache[AirQualityReading], timeout_seconds: float = 8.0) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds
        self._in_flight: dict[str, asyncio.Task[AirQualityReading]] = {}

    async def get_air_quality(self, city: str, http_client: httpx.AsyncClient) -> AirQualityReading:
        """Fetches live Open-Meteo AQI for city (cached & coalesced) or falls back to demo."""
        cleaned = strip_control_chars(city) or "Delhi"
        cache_key = f"city:{cleaned.lower()}"
        cached = await self._cache.get(cache_key)
        if cached is not None:
            return cached
        return await self._coalesced_fetch(
            cache_key=cache_key,
            cache_on_live=True,
            fetcher=lambda: self._fetch_city_with_fallback(cleaned, http_client),
        )

    async def get_air_quality_by_coords(
        self,
        lat: float,
        lon: float,
        http_client: httpx.AsyncClient,
    ) -> AirQualityReading:
        """Fetches live Open-Meteo AQI directly for coordinates without logging/storing coords."""
        try:
            reading = await self._fetch_aq_at_coords(lat, lon, APPROX_LOCATION_LABEL, http_client)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Coordinate air quality lookup failed (%s); using demo", type(exc).__name__)
            return get_demo_air_quality("Delhi").model_copy(update={"city": APPROX_LOCATION_LABEL})
        if reading is None:
            return get_demo_air_quality("Delhi").model_copy(update={"city": APPROX_LOCATION_LABEL})
        return reading

    async def _coalesced_fetch(self, cache_key: str, cache_on_live: bool, fetcher: Any) -> AirQualityReading:
        task = self._in_flight.get(cache_key)
        if task is None:
            task = asyncio.create_task(fetcher())
            self._in_flight[cache_key] = task
        try:
            reading = await task
        finally:
            if self._in_flight.get(cache_key) is task and task.done():
                self._in_flight.pop(cache_key, None)
        if cache_on_live and reading.source == "live":
            await self._cache.set(cache_key, reading)
        return reading

    async def _fetch_city_with_fallback(
        self,
        cleaned_city: str,
        http_client: httpx.AsyncClient,
    ) -> AirQualityReading:
        try:
            reading = await self._fetch_live(cleaned_city, http_client)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            logger.warning("Air quality lookup failed for city=%r (%s); using demo", cleaned_city, type(exc).__name__)
            return get_demo_air_quality(cleaned_city)
        return reading if reading is not None else get_demo_air_quality(cleaned_city)

    async def _fetch_live(self, city: str, http_client: httpx.AsyncClient) -> AirQualityReading | None:
        query_city = DEVANAGARI_CITY_MAP.get(city, city)
        geo_resp = await http_client.get(
            GEOCODING_URL,
            params={"name": query_city, "count": 10, "language": "en", "format": "json"},
            timeout=self._timeout_seconds,
        )
        geo_resp.raise_for_status()
        geo_data = geo_resp.json()
        results = geo_data.get("results") if isinstance(geo_data, dict) else None
        if not isinstance(results, list) or not results:
            return None
        match = select_geocode_result(results)
        if match is None:
            return None
        lat, lon = match.get("latitude"), match.get("longitude")
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            return None
        resolved_name = str(match.get("name") or city).strip() or city
        return await self._fetch_aq_at_coords(float(lat), float(lon), resolved_name, http_client)

    async def _fetch_aq_at_coords(
        self,
        lat: float,
        lon: float,
        label: str,
        http_client: httpx.AsyncClient,
    ) -> AirQualityReading | None:
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
        parsed = parse_hourly_series(aq_data) if isinstance(aq_data, dict) else None
        if parsed is None:
            return None
        aqi, dominant, updated_at = parsed
        return AirQualityReading(
            city=label,
            aqi=aqi,
            dominant_pollutant=dominant,
            updated_at=updated_at,
            source="live",
            source_detail=LIVE_SOURCE_DETAIL,
        )
