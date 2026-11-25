"""Tests for rate limiting, CORS allowlist, body cap, security headers, and error hygiene."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient
from tests.conftest import build_mock_http_client


def test_security_headers_present_on_api_and_spa(client: TestClient) -> None:
    health = client.get("/api/health", headers={"x-forwarded-proto": "https, http"})
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "no-referrer"
    assert "permissions-policy" in health.headers
    assert "max-age=31536000" in health.headers["strict-transport-security"]

    spa = client.get("/")
    assert spa.status_code == 200
    assert "content-security-policy" in spa.headers

    # Production mode disables interactive API docs by default
    assert client.get("/docs").status_code == 404
    assert client.get("/redoc").status_code == 404
    assert client.get("/openapi.json").status_code == 404


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


def test_trusted_proxy_ip_extraction_prevents_xff_spoofing(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()

    # With trust_proxy_headers=False, attacker X-Forwarded-For rotation cannot bypass limits
    direct_app = create_app(
        settings=Settings(trust_proxy_headers=False),
        http_client=build_mock_http_client(),
        dist_dir=dist_dir,
    )
    with TestClient(direct_app) as tc:
        for idx in range(60):
            resp = tc.get("/api/air-quality?city=Delhi", headers={"X-Forwarded-For": f"1.2.3.{idx}"})
            assert resp.status_code == 200
        blocked = tc.get("/api/air-quality?city=Delhi", headers={"X-Forwarded-For": "9.9.9.9"})
        assert blocked.status_code == 429

    # With trust_proxy_headers=True & hops=1, proxy-appended rightmost IP is used, spoofing left side ignored
    proxied_app = create_app(
        settings=Settings(trust_proxy_headers=True, trusted_proxy_hops=1),
        http_client=build_mock_http_client(),
        dist_dir=dist_dir,
    )
    with TestClient(proxied_app) as tc:
        for idx in range(60):
            resp = tc.get(
                "/api/air-quality?city=Delhi",
                headers={"X-Forwarded-For": f"bad-ip, 198.51.100.{idx}, 203.0.113.42"},
            )
            assert resp.status_code == 200
        # Different spoofed left IP still hits the same 203.0.113.42 quota
        blocked = tc.get(
            "/api/air-quality?city=Delhi",
            headers={"X-Forwarded-For": "8.8.8.8, 203.0.113.42"},
        )
        assert blocked.status_code == 429
        # Genuine different real client IP appended by proxy has its own quota
        other = tc.get(
            "/api/air-quality?city=Delhi",
            headers={"X-Forwarded-For": "8.8.8.8, 203.0.113.99"},
        )
        assert other.status_code == 200


def test_docs_exposed_in_development_and_hidden_in_production(tmp_path: Path) -> None:
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    dev_app = create_app(
        settings=Settings(environment="development"),
        http_client=build_mock_http_client(),
        dist_dir=dist_dir,
    )
    with TestClient(dev_app) as tc:
        assert tc.get("/docs").status_code == 200
        assert tc.get("/openapi.json").status_code == 200
