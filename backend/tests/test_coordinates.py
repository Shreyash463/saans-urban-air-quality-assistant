"""Tests for ephemeral coordinate lookup privacy, non-logging, and query-param rejection."""

from __future__ import annotations

import logging
from typing import Any

import pytest
from app.services.air_quality import APPROX_LOCATION_LABEL
from fastapi.testclient import TestClient


def test_post_air_quality_coords_omits_coords_from_logs(
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO):
        res = client.post("/api/air-quality", json={"lat": 28.6139, "lon": 77.2090})
    assert res.status_code == 200
    data = res.json()
    assert data["city"] == APPROX_LOCATION_LABEL
    assert data["source"] == "live"
    assert res.headers.get("cache-control") == "no-store"
    logs = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "28.6139" not in logs
    assert "77.209" not in logs


def test_query_coordinates_rejected_with_422(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    assert client.get("/api/air-quality?lat=28.6139&lon=77.2090").status_code == 422
    assert client.post("/api/air-quality", json={"lat": 28.61}).status_code == 422
    assert client.post("/api/plan?lat=28.6139&lon=77.2090", json=sample_profile_dict).status_code == 422


def test_post_plan_coords_omits_coords_from_logs(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO):
        res = client.post("/api/plan", json={**sample_profile_dict, "coords": {"lat": 28.6139, "lon": 77.2090}})
    assert res.status_code == 200
    assert res.json()["aqi"]["city"] == APPROX_LOCATION_LABEL
    assert res.headers.get("cache-control") == "no-store"
    logs = "\n".join(rec.getMessage() for rec in caplog.records)
    assert "28.6139" not in logs
    assert "77.209" not in logs


def test_plan_prefer_coords_false_ignores_coords(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    res = client.post(
        "/api/plan",
        json={**sample_profile_dict, "city": "Pune", "coords": {"lat": 28.6139, "lon": 77.2090}, "preferCoords": False},
    )
    assert res.status_code == 200
    assert res.json()["aqi"]["city"] != APPROX_LOCATION_LABEL
