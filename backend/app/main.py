"""FastAPI application factory, lifespan wiring, and single-origin SPA mounting."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import PROJECT_ROOT, Settings, get_settings
from app.dependencies import AppState
from app.exceptions import RateLimitExceededError, SaansError
from app.middleware import MaxBodySizeMiddleware, SecurityHeadersMiddleware
from app.routers import air_quality, chat, health, plan
from app.schemas import AirQualityReading, PlanResponse
from app.services.air_quality import AirQualityService
from app.services.cache import TTLCache
from app.services.gemini import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter
from app.static_spa import StaticAsset, build_static_index, serve_indexed_asset

logger = logging.getLogger("saans")

_HTTP_MAX_KEEPALIVE_CONNECTIONS = 10
_HTTP_MAX_CONNECTIONS = 25
_GZIP_MINIMUM_SIZE_BYTES = 500
_GZIP_COMPRESS_LEVEL = 6


def _not_found_response() -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": "Not found."})


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(SaansError)
    async def saans_error_handler(_request: Request, exc: SaansError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after_seconds)} if isinstance(exc, RateLimitExceededError) else None
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "code": exc.code}, headers=headers)

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
    """Configures application and HTTP client logging levels."""
    logging.basicConfig(
        level=getattr(logging, resolved_settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def _populate_app_state(
    application: FastAPI,
    settings: Settings,
    http_client: httpx.AsyncClient,
    gemini: GeminiClient,
) -> None:
    air_quality_cache = TTLCache[AirQualityReading](
        ttl_seconds=settings.cache_ttl_seconds,
        maxsize=settings.cache_maxsize,
    )
    application.state.saans = AppState(
        settings=settings,
        http_client=http_client,
        gemini_client=gemini,
        air_quality_cache=air_quality_cache,
        plan_cache=TTLCache[PlanResponse](
            ttl_seconds=settings.cache_ttl_seconds,
            maxsize=settings.cache_maxsize,
        ),
        air_quality_service=AirQualityService(
            cache=air_quality_cache,
            timeout_seconds=settings.air_quality_timeout_seconds,
        ),
        air_quality_limiter=SlidingWindowRateLimiter(max_requests=settings.air_quality_rate_limit),
        plan_limiter=SlidingWindowRateLimiter(max_requests=settings.plan_rate_limit),
        chat_limiter=SlidingWindowRateLimiter(max_requests=settings.chat_rate_limit),
    )


def _mount_spa_route(
    app: FastAPI,
    static_index: dict[str, StaticAsset],
    docs_enabled: bool,
) -> None:
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(request: Request, full_path: str) -> Response:
        if full_path.startswith("api/") or full_path == "api":
            return _not_found_response()
        if not docs_enabled and full_path.rstrip("/") in {"docs", "redoc", "openapi.json"}:
            return _not_found_response()
        if not static_index:
            return _not_found_response()
        normalized = full_path.lstrip("/")
        matched = static_index.get(normalized) if normalized else None
        if matched is not None:
            return serve_indexed_asset(request, matched)
        index_asset = static_index.get("index.html")
        return serve_indexed_asset(request, index_asset) if index_asset is not None else _not_found_response()


def _make_lifespan(
    resolved_settings: Settings,
    gemini_client: GeminiClient | None,
    http_client: httpx.AsyncClient | None,
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        owns_http = http_client is None
        client = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(resolved_settings.air_quality_timeout_seconds),
            limits=httpx.Limits(
                max_keepalive_connections=_HTTP_MAX_KEEPALIVE_CONNECTIONS,
                max_connections=_HTTP_MAX_CONNECTIONS,
            ),
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
    resolved_dist = dist_dir or (PROJECT_ROOT / "frontend" / "dist")
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
    app.add_middleware(
        GZipMiddleware,
        minimum_size=_GZIP_MINIMUM_SIZE_BYTES,
        compresslevel=_GZIP_COMPRESS_LEVEL,
    )
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
    for router in (health.router, health.public_router, air_quality.router, plan.router, chat.router):
        app.include_router(router)
    _mount_spa_route(app, build_static_index(resolved_dist), docs_enabled)
    return app
