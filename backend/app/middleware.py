"""ASGI request-size enforcement and HTTP security headers middleware."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "font-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'none'; "
    "form-action 'self'; "
    "frame-ancestors 'none';"
)
_CSP_HTTPS_HEADER = f"{_CSP_HEADER} upgrade-insecure-requests;"


class _PayloadTooLargeError(Exception):
    """Internal sentinel raised when streamed body size exceeds limit."""


class MaxBodySizeMiddleware:
    """Pure ASGI middleware rejecting request bodies exceeding max_body_bytes with 413."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        early_resp = self._check_content_length(scope)
        if early_resp is not None:
            await early_resp(scope, receive, send)
            return

        received_bytes = 0

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self._max_bytes:
                    raise _PayloadTooLargeError()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _PayloadTooLargeError:
            resp = JSONResponse(status_code=413, content={"detail": "Request payload too large."})
            await resp(scope, receive, send)

    def _check_content_length(self, scope: Scope) -> JSONResponse | None:
        headers = {k.lower(): v for k, v in scope.get("headers", [])}
        raw_cl = headers.get(b"content-length")
        if raw_cl is None:
            return None
        try:
            if int(raw_cl.decode("ascii")) > self._max_bytes:
                return JSONResponse(status_code=413, content={"detail": "Request payload too large."})
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
        return None


def _merge_vary_origin(existing_vary: str | None) -> str:
    if not existing_vary:
        return "Origin"
    tokens: list[str] = []
    seen: set[str] = set()
    for part in [*existing_vary.split(","), "Origin"]:
        clean = part.strip()
        low = clean.lower()
        if clean and low not in seen:
            seen.add(low)
            tokens.append(clean)
    return ", ".join(tokens)


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
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        raw_proto = request.headers.get("x-forwarded-proto", "")
        forwarded_proto = raw_proto.split(",")[0].strip().lower()
        is_https = request.url.scheme == "https" or forwarded_proto == "https"
        if is_https:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        if not request.url.path.startswith("/api/"):
            response.headers.setdefault(
                "Content-Security-Policy",
                _CSP_HTTPS_HEADER if is_https else _CSP_HEADER,
            )
        response.headers["Vary"] = _merge_vary_origin(response.headers.get("Vary"))
        return response
