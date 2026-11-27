"""Tests for static SPA serving, ETag 304, Brotli precompression, Vary hygiene, and 404/413 handlers."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from app.config import Settings
from app.exceptions import InvalidInputError, SaansError
from app.main import create_app
from fastapi.testclient import TestClient
from starlette.requests import Request
from tests.conftest import build_mock_http_client


def _populate_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><html><body>Saans</body></html>", encoding="utf-8")
    (dist / "index.html.br").write_bytes(b"fake-br-html")
    (assets / "app-123.js").write_text("console.log('saans');", encoding="utf-8")
    (assets / "app-123.js.br").write_bytes(b"fake-br-js")
    return dist


def test_spa_index_etag_and_304_not_modified(tmp_path: Path) -> None:
    app = create_app(settings=Settings(), http_client=build_mock_http_client(), dist_dir=_populate_dist(tmp_path))
    with TestClient(app) as tc:
        r_idx = tc.get("/", headers={"Accept-Encoding": "br, gzip"})
        assert r_idx.status_code == 200
        assert r_idx.headers["cache-control"] == "no-cache"
        r_304 = tc.get("/", headers={"If-None-Match": r_idx.headers["etag"], "Accept-Encoding": "br"})
        assert r_304.status_code == 304


def test_spa_immutable_assets_and_brotli_negotiation(tmp_path: Path) -> None:
    app = create_app(settings=Settings(), http_client=build_mock_http_client(), dist_dir=_populate_dist(tmp_path))
    with TestClient(app) as tc:
        r_js = tc.get("/assets/app-123.js", headers={"Accept-Encoding": "br"})
        assert r_js.status_code == 200
        assert r_js.headers["cache-control"] == "public, max-age=31536000, immutable"
        assert r_js.headers.get("content-encoding") == "br"

        r_plain = tc.get("/assets/app-123.js", headers={"Accept-Encoding": "identity"})
        assert r_plain.status_code == 200
        assert "content-encoding" not in r_plain.headers


def test_vary_header_deduplicated_and_413_has_security_headers(tmp_path: Path) -> None:
    dist_dir = _populate_dist(tmp_path)
    settings = Settings(gemini_api_key="", allowed_origins="https://example.com", max_body_bytes=1024)
    app = create_app(settings=settings, http_client=build_mock_http_client(), dist_dir=dist_dir)
    with TestClient(app) as tc:
        res_ok = tc.get("/", headers={"Origin": "https://example.com", "Accept-Encoding": "gzip"})
        assert res_ok.status_code == 200
        vary_tokens = [v.strip().lower() for v in res_ok.headers.get("vary", "").split(",") if v.strip()]
        assert vary_tokens.count("origin") <= 1

        res_413 = tc.post(
            "/api/plan",
            content=b"{" + b"a" * 1200 + b"}",
            headers={"Content-Type": "application/json", "Origin": "https://example.com"},
        )
        assert res_413.status_code == 413
        assert res_413.headers.get("x-content-type-options") == "nosniff"
        assert res_413.headers.get("x-frame-options") == "DENY"


@pytest.mark.asyncio
async def test_app_error_handlers_and_missing_dist_404(tmp_path: Path) -> None:
    app = create_app(settings=Settings(environment="production", gemini_api_key=""), dist_dir=tmp_path / "missing")
    req = Request({"type": "http", "method": "GET", "path": "/api/health", "headers": [], "app": SimpleNamespace()})
    saans_resp = await app.exception_handlers[SaansError](req, InvalidInputError("Bad param test"))
    assert saans_resp.status_code == 422 and b"INVALID_INPUT" in saans_resp.body
    unhandled = await app.exception_handlers[Exception](req, RuntimeError("sensitive internal detail"))
    assert unhandled.status_code == 500 and b"sensitive" not in unhandled.body
    with TestClient(app) as tc:
        assert tc.get("/").status_code == 404
