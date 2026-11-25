"""Shared pytest fixtures for Saans backend tests (all outbound calls mocked)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


@pytest.fixture
def sample_profile_dict() -> dict[str, Any]:
    return {
        "city": "Delhi",
        "householdSize": 4,
        "hasChildren": True,
        "hasElderly": False,
        "hasRespiratoryCondition": True,
        "commuteMode": "car",
        "commuteKm": 18,
        "homeType": "apartment",
        "hasAirPurifier": False,
        "cookingFuel": "lpg",
        "budget": "low",
        "language": "en",
    }


@pytest.fixture
def test_settings() -> Settings:
    return Settings(
        gemini_api_key=None,
        gemini_model=None,
        allowed_origins="http://localhost:5173,http://localhost:4173",
        max_body_bytes=20_480,
        cache_ttl_seconds=600,
    )


def build_mock_http_client(
    geo_payload: dict[str, Any] | None = None,
    aq_payload: dict[str, Any] | None = None,
    error: Exception | None = None,
) -> httpx.AsyncClient:
    """Builds an httpx.AsyncClient backed by MockTransport (zero real network)."""

    def handler(request: httpx.Request) -> httpx.Response:
        if error is not None:
            raise error
        host = request.url.host
        if "geocoding-api" in host:
            data = geo_payload if geo_payload is not None else {
                "results": [
                    {
                        "name": "Delhi",
                        "country_code": "IN",
                        "country": "India",
                        "latitude": 28.65195,
                        "longitude": 77.23149,
                    }
                ]
            }
            return httpx.Response(200, json=data)
        if "air-quality-api" in host:
            if aq_payload is not None:
                return httpx.Response(200, json=aq_payload)
            times = [f"2026-11-24T{h:02d}:00" for h in range(24)]
            return httpx.Response(
                200,
                json={
                    "utc_offset_seconds": 19800,
                    "hourly": {
                        "time": times,
                        "pm2_5": [110.0] * 24,
                        "pm10": [150.0] * 24,
                    },
                },
            )
        return httpx.Response(404, json={"error": "unexpected host"})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture
def client(test_settings: Settings, tmp_path: Path) -> Iterator[TestClient]:
    """FastAPI TestClient with mocked HTTP transport and temporary SPA dist dir."""
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<!doctype html><html><body>Saans</body></html>", encoding="utf-8")

    mock_http = build_mock_http_client()
    app = create_app(
        settings=test_settings,
        http_client=mock_http,
        dist_dir=dist_dir,
    )
    with TestClient(app) as tc:
        yield tc
