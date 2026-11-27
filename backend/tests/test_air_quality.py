"""Tests for Open-Meteo air quality service, coalescing, parser edges, and demo fallbacks."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import httpx
import pytest
from app.schemas import AirQualityReading
from app.services.air_quality import AirQualityService
from app.services.air_quality_parse import (
    DEMO_SOURCE_DETAIL,
    LIVE_SOURCE_DETAIL,
    _parse_dt_with_tz,
    _pick_latest_timestamp,
    get_demo_air_quality,
    parse_hourly_series,
    select_geocode_result,
)
from app.services.cache import TTLCache
from tests.conftest import build_mock_http_client


def _pune_handler(counter: list[int]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        counter[0] += 1
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
        return httpx.Response(200, json={"utc_offset_seconds": 19800, "hourly": {"time": times, "pm2_5": [45.0] * 24, "pm10": [60.0] * 24}})

    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_live_air_quality_prefers_india_and_caches() -> None:
    calls = [0]
    svc = AirQualityService(cache=TTLCache[AirQualityReading](ttl_seconds=600, maxsize=64), timeout_seconds=8.0)
    async with httpx.AsyncClient(transport=_pune_handler(calls)) as http:
        first = await svc.get_air_quality("Pune", http)
        second = await svc.get_air_quality("pune", http)

    assert first.source == "live" and first.source_detail == LIVE_SOURCE_DETAIL
    assert first.updated_at.endswith("+05:30") and first.aqi > 50
    assert second == first and calls[0] == 2


@pytest.mark.asyncio
async def test_air_quality_coalesces_concurrent_lookups() -> None:
    calls = [0]
    svc = AirQualityService(cache=TTLCache(ttl_seconds=600))
    async with httpx.AsyncClient(transport=_pune_handler(calls)) as http:
        res1, res2 = await asyncio.gather(svc.get_air_quality("Pune", http), svc.get_air_quality("Pune", http))
    assert res1 == res2 and calls[0] == 2


@pytest.mark.asyncio
async def test_geocode_miss_falls_back_to_demo() -> None:
    svc = AirQualityService(cache=TTLCache[AirQualityReading](ttl_seconds=600))
    async with build_mock_http_client(geo_payload={"results": []}) as http:
        reading = await svc.get_air_quality("Lucknow", http)
    assert reading.source == "demo" and reading.source_detail == DEMO_SOURCE_DETAIL
    assert reading.aqi == 310 and reading.updated_at == ""


@pytest.mark.asyncio
async def test_timeout_and_bad_payload_fall_back_to_demo() -> None:
    svc = AirQualityService(cache=TTLCache[AirQualityReading](ttl_seconds=600))
    async with build_mock_http_client(error=httpx.ReadTimeout("timeout")) as http:
        timed_out = await svc.get_air_quality("Delhi", http)
    assert timed_out.source == "demo" and timed_out.aqi == 380

    async with build_mock_http_client(aq_payload={"hourly": {"time": ["bad"], "pm2_5": [1.0]}}) as http:
        bad_payload = await svc.get_air_quality("Mumbai", http)
    assert bad_payload.source == "demo" and bad_payload.aqi == 150


def test_air_quality_parse_edge_cases() -> None:
    unknown = get_demo_air_quality("Jaipur")
    assert unknown.city == "Jaipur" and unknown.source == "demo"
    assert select_geocode_result([{"name": "Delhi", "country": "India"}]) == {"name": "Delhi", "country": "India"}
    assert select_geocode_result([{"name": "Paris", "country_code": "FR"}]) == {"name": "Paris", "country_code": "FR"}
    assert select_geocode_result([]) is None
    assert _parse_dt_with_tz(123, UTC) is None
    assert _parse_dt_with_tz("bad-date", UTC) is None
    assert _pick_latest_timestamp([(datetime(2026, 11, 26, tzinfo=UTC), None, None)]) is None
    assert parse_hourly_series({"hourly": "invalid"}) is None
    times_14 = [f"2026-11-26T{h:02d}:00" for h in range(14)]
    assert parse_hourly_series({"hourly": {"time": ["bad", *times_14], "pm2_5": [None] * 15, "pm10": [None] * 15}}, now_utc=datetime(2026, 11, 26, 20, tzinfo=UTC)) is None
