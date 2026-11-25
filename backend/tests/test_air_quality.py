"""Tests for Open-Meteo air quality service, caching, and demo fallbacks."""

from __future__ import annotations

import httpx
import pytest
from app.schemas import AirQualityReading
from app.services.air_quality import DEMO_SOURCE_DETAIL, LIVE_SOURCE_DETAIL, AirQualityService
from app.services.cache import TTLCache
from tests.conftest import build_mock_http_client


@pytest.mark.asyncio
async def test_live_air_quality_prefers_india_and_caches() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if "geocoding-api" in request.url.host:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"name": "Pune", "country_code": "US", "country": "USA", "latitude": 1.0, "longitude": 1.0},
                        {"name": "Pune", "country_code": "IN", "country": "India", "latitude": 18.52, "longitude": 73.85},
                    ]
                },
            )
        assert "18.52" in str(request.url)
        times = [f"2026-11-24T{h:02d}:00" for h in range(24)]
        return httpx.Response(
            200,
            json={
                "utc_offset_seconds": 19800,
                "hourly": {
                    "time": times,
                    "pm2_5": [45.0] * 24,
                    "pm10": [60.0] * 24,
                },
            },
        )

    cache = TTLCache[AirQualityReading](ttl_seconds=600, maxsize=64)
    svc = AirQualityService(cache=cache, timeout_seconds=8.0)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        first = await svc.get_air_quality("Pune", http)
        second = await svc.get_air_quality("pune", http)

    assert first.source == "live"
    assert first.source_detail == LIVE_SOURCE_DETAIL
    assert first.updated_at.endswith("+05:30")
    assert first.aqi > 50
    assert second == first
    assert call_count == 2  # Only 2 HTTP calls total (geocode + aq); second lookup hit cache


@pytest.mark.asyncio
async def test_geocode_miss_falls_back_to_demo() -> None:
    cache = TTLCache[AirQualityReading](ttl_seconds=600)
    svc = AirQualityService(cache=cache)
    async with build_mock_http_client(geo_payload={"results": []}) as http:
        reading = await svc.get_air_quality("Lucknow", http)

    assert reading.source == "demo"
    assert reading.source_detail == DEMO_SOURCE_DETAIL
    assert reading.aqi == 310
    assert reading.updated_at == ""


@pytest.mark.asyncio
async def test_timeout_and_bad_payload_fall_back_to_demo() -> None:
    cache = TTLCache[AirQualityReading](ttl_seconds=600)
    svc = AirQualityService(cache=cache)

    async with build_mock_http_client(error=httpx.ReadTimeout("timeout")) as http:
        timed_out = await svc.get_air_quality("Delhi", http)
    assert timed_out.source == "demo"
    assert timed_out.aqi == 380

    async with build_mock_http_client(aq_payload={"hourly": {"time": ["bad"], "pm2_5": [1.0]}}) as http:
        bad_payload = await svc.get_air_quality("Mumbai", http)
    assert bad_payload.source == "demo"
    assert bad_payload.aqi == 150
