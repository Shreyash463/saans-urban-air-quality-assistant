"""Tests for rate limiting, CORS allowlist, body cap, security headers, and error hygiene."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient


def test_security_headers_present_on_api_and_spa(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "no-referrer"
    assert "permissions-policy" in health.headers

    spa = client.get("/")
    assert spa.status_code == 200
    assert "content-security-policy" in spa.headers


def test_cors_allows_configured_origin_and_rejects_unlisted(client: TestClient) -> None:
    allowed = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"

    rejected = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert "access-control-allow-origin" not in rejected.headers


def test_oversize_body_rejected_with_413(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    huge = {**sample_profile_dict, "city": "A" * 25_000}
    resp = client.post("/api/plan", json=huge)
    assert resp.status_code == 413


def test_rate_limiter_returns_429_with_retry_after(
    client: TestClient,
    sample_profile_dict: dict[str, Any],
) -> None:
    for _ in range(20):
        ok_resp = client.post("/api/plan", json=sample_profile_dict)
        assert ok_resp.status_code == 200

    blocked = client.post("/api/plan", json=sample_profile_dict)
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1


def test_error_responses_never_leak_stack_traces_or_secrets(client: TestClient) -> None:
    bad = client.get("/api/air-quality?city=Delhi123!")
    assert bad.status_code == 422
    text = bad.text.lower()
    assert "traceback" not in text
    assert "gemini_api_key" not in text

    missing_api = client.get("/api/nonexistent")
    assert missing_api.status_code == 404
    assert "traceback" not in missing_api.text.lower()
