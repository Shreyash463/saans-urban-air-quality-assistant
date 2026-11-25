"""FastAPI application factory, security middleware, lifespan, and single-origin SPA serving."""

from __future__ import annotations

import logging
import mimetypes
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from email.utils import formatdate
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import PROJECT_ROOT, Settings, get_settings
from app.routers import air_quality, chat, health, plan
from app.schemas import AirQualityReading, PlanResponse
from app.services.air_quality import AirQualityService
from app.services.cache import TTLCache
from app.services.gemini_client import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter

logger = logging.getLogger("saans")

_CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "font-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none';"
)

_EXTRA_MIME_TYPES: dict[str, str] = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".json": "application/json; charset=utf-8",
}


class MaxBodySizeMiddleware:
    """Pure ASGI middleware rejecting request bodies exceeding max_body_bytes with 413."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        raw_cl = headers.get(b"content-length")
        if raw_cl is not None:
            try:
                if int(raw_cl.decode("ascii")) > self._max_bytes:
                    resp = JSONResponse(
                        status_code=413,
                        content={"detail": "Request payload too large."},
                    )
                    await resp(scope, receive, send)
                    return
            except ValueError:
                resp = JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header."},
                )
                await resp(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                chunk = message.get("body", b"")
                received_bytes += len(chunk)
                if received_bytes > self._max_bytes:
                    raise _PayloadTooLargeError()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _PayloadTooLargeError:
            resp = JSONResponse(
                status_code=413,
                content={"detail": "Request payload too large."},
            )
            await resp(scope, receive, send)


class _PayloadTooLargeError(Exception):
    """Internal sentinel raised when streamed body size exceeds limit."""


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Applies baseline HTTP security headers across API and SPA responses."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",
        )
        raw_proto = request.headers.get("x-forwarded-proto", "")
        forwarded_proto = raw_proto.split(",")[0].strip().lower()
        if request.url.scheme == "https" or forwarded_proto == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        if not request.url.path.startswith("/api/"):
            response.headers.setdefault("Content-Security-Policy", _CSP_HEADER)
        existing_vary = response.headers.get("Vary")
        if existing_vary:
            tokens: list[str] = []
            seen: set[str] = set()
            for part in [*existing_vary.split(","), "Origin"]:
                clean = part.strip()
                low = clean.lower()
                if clean and low not in seen:
                    seen.add(low)
                    tokens.append(clean)
            response.headers["Vary"] = ", ".join(tokens)
        else:
            response.headers["Vary"] = "Origin"
        return response


def _guess_media_type(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix in _EXTRA_MIME_TYPES:
        return _EXTRA_MIME_TYPES[suffix]
    guessed, _ = mimetypes.guess_type(str(file_path))
    return guessed or "application/octet-stream"


def _serve_spa_file(
    request: Request,
    file_path: Path,
    cache_control: str,
) -> Response:
    """Serves a static file with ETag/304 negotiation, Cache-Control, and precompressed .br."""
    stat = file_path.stat()
    etag = f'W/"{stat.st_size:x}-{stat.st_mtime_ns:x}"'
    last_modified = formatdate(stat.st_mtime, usegmt=True)
    headers: dict[str, str] = {
        "Cache-Control": cache_control,
        "ETag": etag,
        "Last-Modified": last_modified,
    }

    accept_encoding = request.headers.get("accept-encoding", "").lower()
    br_path = file_path.with_name(f"{file_path.name}.br")
    use_br = "br" in accept_encoding and br_path.is_file() and not file_path.name.endswith(".br")
    if br_path.is_file():
        headers["Vary"] = "Accept-Encoding"
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)

    media_type = _guess_media_type(file_path)
    if use_br:
        headers["Content-Encoding"] = "br"
        return FileResponse(br_path, media_type=media_type, headers=headers)
    return FileResponse(file_path, media_type=media_type, headers=headers)


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        headers = getattr(exc, "headers", None) or {}
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": str(exc.detail) if exc.status_code < 500 else "Internal server error."},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        safe_errors = [
            {
                "loc": err.get("loc", ()),
                "msg": err.get("msg", "Invalid value"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": safe_errors})

    @app.exception_handler(Exception)
    async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("Unhandled request error (%s)", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": "An unexpected error occurred."},
        )


def _configure_logging(resolved_settings: Settings) -> None:
    """Configures root logging while redacting opt-in coordinate query strings."""
    logging.basicConfig(
        level=getattr(logging, resolved_settings.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Never leak outbound URL query strings (such as opt-in lat/lon coordinates) via httpx/httpcore info logs
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

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        owns_http = http_client is None
        client = http_client or httpx.AsyncClient(
            timeout=httpx.Timeout(resolved_settings.air_quality_timeout_seconds),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=25),
        )
        g_client = gemini_client or GeminiClient(resolved_settings)
        await g_client.initialize_models()

        application.state.settings = resolved_settings
        application.state.http_client = client
        application.state.gemini_client = g_client
        application.state.air_quality_cache = TTLCache[AirQualityReading](
            ttl_seconds=resolved_settings.cache_ttl_seconds,
            maxsize=256,
        )
        application.state.plan_cache = TTLCache[PlanResponse](
            ttl_seconds=resolved_settings.cache_ttl_seconds,
            maxsize=256,
        )
        application.state.air_quality_service = AirQualityService(
            cache=application.state.air_quality_cache,
            timeout_seconds=resolved_settings.air_quality_timeout_seconds,
        )
        application.state.air_quality_limiter = SlidingWindowRateLimiter(max_requests=60)
        application.state.plan_limiter = SlidingWindowRateLimiter(max_requests=20)
        application.state.chat_limiter = SlidingWindowRateLimiter(max_requests=20)

        try:
            yield
        finally:
            if owns_http:
                await client.aclose()

    docs_enabled = resolved_settings.should_expose_docs
    app = FastAPI(
        title="Saans — Urban Air Quality Assistant API",
        version="1.0.0",
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )

    app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(MaxBodySizeMiddleware, max_bytes=resolved_settings.max_body_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.parsed_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Accept"],
    )

    _register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(air_quality.router)
    app.include_router(plan.router)
    app.include_router(chat.router)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(request: Request, full_path: str) -> Response:
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        if not docs_enabled and full_path.rstrip("/") in {"docs", "redoc", "openapi.json"}:
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        if not resolved_dist.is_dir():
            return JSONResponse(status_code=404, content={"detail": "Not found."})
        dist_root = resolved_dist.resolve()
        if full_path and not full_path.endswith(".br"):
            candidate = (dist_root / full_path).resolve()
            if candidate.is_relative_to(dist_root) and candidate.is_file():
                cache_hdr = (
                    "public, max-age=31536000, immutable"
                    if full_path.startswith("assets/")
                    else "no-cache"
                )
                return _serve_spa_file(request, candidate, cache_hdr)
        index_file = dist_root / "index.html"
        if index_file.is_file():
            return _serve_spa_file(request, index_file, "no-cache")
        return JSONResponse(status_code=404, content={"detail": "Not found."})

    return app


app = create_app()
