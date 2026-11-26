"""FastAPI application factory, lifespan wiring, and single-origin SPA mounting."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import PROJECT_ROOT, Settings, get_settings
from app.exceptions import SaansError
from app.middleware import MaxBodySizeMiddleware, SecurityHeadersMiddleware
from app.routers import air_quality, chat, health, plan
from app.schemas import AirQualityReading, PlanResponse
from app.services.air_quality import AirQualityService
from app.services.cache import TTLCache
from app.services.gemini import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter
from app.static_spa import StaticAsset, build_static_index, serve_indexed_asset

logger = logging.getLogger("saans")


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(SaansError)
    async def saans_error_handler(_request: Request, exc: SaansError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code})

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        headers = getattr(exc, "headers", None) or {}
        detail = str(exc.detail) if exc.status_code < 500 else "Internal server error."
        return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        safe_errors = [
            {"loc": err.get("loc", ()), "msg": err.get("msg", "Invalid value"), "type": err.get("type", "value_error")}
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": safe_errors})

    @app.exception_handler(Exception)
    async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled request error (%s)", type(exc).__name__)
        return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred."})


def _configure_logging(resolved_settings: Settings) -> None:
    """Configures root logging while ensuring coordinate query strings are never logged."""
    logging.basicConfig(
        level=getattr(logging, resolved_settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    uvicorn_access = logging.getLogger("uvicorn.access")
    if any(getattr(f, "_saans_coords_filter", False) for f in uvicorn_access.filters):
        return

    class _CoordsLogFilter(logging.Filter):
        _saans_coords_filter = True

        def filter(self, record: logging.LogRecord) -> bool:
            if record.args and isinstance(record.args, tuple):
                record.args = tuple(
                    a.split("?", 1)[0] if isinstance(a, str) and ("lat=" in a or "lon=" in a) else a
                    for a in record.args
                )
            return True

    uvicorn_access.addFilter(_CoordsLogFilter())


def _populate_app_state(
    application: FastAPI,
    settings: Settings,
    http_client: httpx.AsyncClient,
    gemini: GeminiClient,
) -> None:
    application.state.settings = settings
    application.state.http_client = http_client
    application.state.gemini_client = gemini
    application.state.air_quality_cache = TTLCache[AirQualityReading](ttl_seconds=settings.cache_ttl_seconds, maxsize=256)
    application.state.plan_cache = TTLCache[PlanResponse](ttl_seconds=settings.cache_ttl_seconds, maxsize=256)
    application.state.air_quality_service = AirQualityService(
        cache=application.state.air_quality_cache,
        timeout_seconds=settings.air_quality_timeout_seconds,
    )
    application.state.air_quality_limiter = SlidingWindowRateLimiter(max_requests=60)
    application.state.plan_limiter = SlidingWindowRateLimiter(max_requests=20)
    application.state.chat_limiter = SlidingWindowRateLimiter(max_requests=20)


def _mount_spa_route(
    app: FastAPI,
    static_index: dict[str, StaticAsset],
    docs_enabled: bool,
) -> None:
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(request: Request, full_path: str) -> Response:
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        if not docs_enabled and full_path.rstrip("/") in {"docs", "redoc", "openapi.json"}:
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        if not static_index:
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        normalized = full_path.lstrip("/")
        matched = static_index.get(normalized) if normalized else None
        if matched is not None:
            return serve_indexed_asset(request, matched)
        index_asset = static_index.get("index.html")
        return serve_indexed_asset(request, index_asset) if index_asset is not None else JSONResponse(status_code=404, content={"detail": "Not found."})


def _make_lifespan(
    resolved_settings: Settings,
    gemini_client: GeminiClient | None,
    http_client: httpx.AsyncClient | None,
) -> Any:
    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        owns_http = http_client is None
        client = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(resolved_settings.air_quality_timeout_seconds),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=25),
        )
        g_client = gemini_client or GeminiClient(resolved_settings)
        await g_client.initialize_models()
        _populate_app_state(application, resolved_settings, client, g_client)
        try:
            yield
        finally:
            if owns_http:
                await client.aclose()

    return lifespan


def create_app(
    settings: Settings | None = None,
    gemini_client: GeminiClient | None = None,
    http_client: httpx.AsyncClient | None = None,
    dist_dir: Path | None = None,
) -> FastAPI:
    """Creates and configures the FastAPI application instance."""
    resolved_settings = settings or get_settings()
    resolved_dist = dist_dir or (PROJECT_ROOT / "dist")
    _configure_logging(resolved_settings)
    docs_enabled = resolved_settings.should_expose_docs
    app = FastAPI(
        title="Saans — Urban Air Quality Assistant API",
        version="1.0.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=_make_lifespan(resolved_settings, gemini_client, http_client),
    )
    app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=resolved_settings.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.parsed_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    _register_exception_handlers(app)
    for router in (health.router, air_quality.router, plan.router, chat.router):
        app.include_router(router)
    _mount_spa_route(app, build_static_index(resolved_dist), docs_enabled)
    return app


app = create_app()
