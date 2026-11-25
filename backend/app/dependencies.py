"""Typed FastAPI application state accessors and trusted-proxy-aware client IP extraction."""

from __future__ import annotations

import ipaddress
from typing import cast

import httpx
from fastapi import HTTPException, Request

from app.config import Settings
from app.schemas import PlanResponse
from app.services.air_quality import AirQualityService
from app.services.cache import TTLCache
from app.services.gemini_client import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter


def _parse_ip_token(raw: str) -> str | None:
    """Validates an IP token (optionally bracketed IPv6 or host:port) and returns canonical form."""
    token = raw.strip().strip('"')
    if not token or token.lower() == "unknown":
        return None
    if token.startswith("[") and "]" in token:
        token = token[1 : token.index("]")]
    elif token.count(":") == 1 and "." in token:
        token = token.split(":", 1)[0]
    try:
        return str(ipaddress.ip_address(token))
    except ValueError:
        return None


def get_client_ip(request: Request) -> str:
    """Extracts client IP safely.

    When behind a trusted reverse proxy (`trust_proxy_headers=True`), uses the rightmost
    valid entry before `trusted_proxy_hops` hops in `X-Forwarded-For` so a client cannot
    spoof its rate-limit identity by prepending arbitrary left-hand addresses.
    """
    settings = get_settings_from_request(request)
    if settings.trust_proxy_headers:
        raw_xff = request.headers.get("x-forwarded-for", "")
        parsed = [
            ip for item in raw_xff.split(",") if (ip := _parse_ip_token(item)) is not None
        ]
        if parsed:
            idx = max(0, len(parsed) - settings.trusted_proxy_hops)
            return parsed[idx]

        raw_real = request.headers.get("x-real-ip", "")
        if raw_real:
            real_ip = _parse_ip_token(raw_real)
            if real_ip is not None:
                return real_ip

    return request.client.host if request.client else "unknown"


def get_settings_from_request(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_http_client(request: Request) -> httpx.AsyncClient:
    return cast(httpx.AsyncClient, request.app.state.http_client)


def get_air_quality_service(request: Request) -> AirQualityService:
    return cast(AirQualityService, request.app.state.air_quality_service)


def get_plan_cache(request: Request) -> TTLCache[PlanResponse]:
    return cast(TTLCache[PlanResponse], request.app.state.plan_cache)


def get_gemini_client(request: Request) -> GeminiClient:
    return cast(GeminiClient, request.app.state.gemini_client)


def get_air_quality_limiter(request: Request) -> SlidingWindowRateLimiter:
    return cast(SlidingWindowRateLimiter, request.app.state.air_quality_limiter)


def get_plan_limiter(request: Request) -> SlidingWindowRateLimiter:
    return cast(SlidingWindowRateLimiter, request.app.state.plan_limiter)


def get_chat_limiter(request: Request) -> SlidingWindowRateLimiter:
    return cast(SlidingWindowRateLimiter, request.app.state.chat_limiter)


async def enforce_rate_limit(
    limiter: SlidingWindowRateLimiter,
    request: Request,
    detail: str,
) -> None:
    """Checks sliding-window quota for the caller IP and raises 429 with Retry-After."""
    allowed, retry_after = await limiter.check(get_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
