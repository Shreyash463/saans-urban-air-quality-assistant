"""Typed FastAPI application state container, Depends aliases, and proxy-safe IP extraction."""

from __future__ import annotations

import ipaddress
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, cast

import httpx
from fastapi import Depends, Request

from app.config import Settings
from app.exceptions import RateLimitExceededError
from app.schemas import AirQualityReading, PlanResponse
from app.services.air_quality import AirQualityService
from app.services.cache import TTLCache
from app.services.gemini import GeminiClient
from app.services.rate_limit import SlidingWindowRateLimiter


@dataclass(slots=True)
class AppState:
    """Strongly typed container for application-scoped services and limiters."""

    settings: Settings
    http_client: httpx.AsyncClient
    gemini_client: GeminiClient
    air_quality_cache: TTLCache[AirQualityReading]
    plan_cache: TTLCache[PlanResponse]
    air_quality_service: AirQualityService
    air_quality_limiter: SlidingWindowRateLimiter
    plan_limiter: SlidingWindowRateLimiter
    chat_limiter: SlidingWindowRateLimiter
    clock: Callable[[], float] | None = None


def get_app_state(request: Request) -> AppState:
    return cast(AppState, request.app.state.saans)


AppStateDep = Annotated[AppState, Depends(get_app_state)]


def get_http_client(state: AppStateDep) -> httpx.AsyncClient:
    return state.http_client


def get_air_quality_service(state: AppStateDep) -> AirQualityService:
    return state.air_quality_service


def get_plan_cache(state: AppStateDep) -> TTLCache[PlanResponse]:
    return state.plan_cache


def get_gemini_client(state: AppStateDep) -> GeminiClient:
    return state.gemini_client


def get_air_quality_limiter(state: AppStateDep) -> SlidingWindowRateLimiter:
    return state.air_quality_limiter


def get_plan_limiter(state: AppStateDep) -> SlidingWindowRateLimiter:
    return state.plan_limiter


def get_chat_limiter(state: AppStateDep) -> SlidingWindowRateLimiter:
    return state.chat_limiter


HttpClientDep = Annotated[httpx.AsyncClient, Depends(get_http_client)]
AirQualityServiceDep = Annotated[AirQualityService, Depends(get_air_quality_service)]
PlanCacheDep = Annotated[TTLCache[PlanResponse], Depends(get_plan_cache)]
GeminiClientDep = Annotated[GeminiClient, Depends(get_gemini_client)]
AirQualityLimiterDep = Annotated[SlidingWindowRateLimiter, Depends(get_air_quality_limiter)]
PlanLimiterDep = Annotated[SlidingWindowRateLimiter, Depends(get_plan_limiter)]
ChatLimiterDep = Annotated[SlidingWindowRateLimiter, Depends(get_chat_limiter)]


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
    """Extracts client IP safely using rightmost trusted-proxy X-Forwarded-For entry."""
    settings = get_app_state(request).settings
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


def resolve_clock(app_state: AppState) -> Callable[[], float]:
    """Returns injected deterministic clock for tests or monotonic wall clock."""
    return app_state.clock if app_state.clock is not None else time.monotonic


def elapsed_ms(started: float, now: float) -> int:
    """Computes non-negative rounded millisecond elapsed time."""
    return max(0, round((now - started) * 1000))


async def enforce_rate_limit(
    limiter: SlidingWindowRateLimiter,
    request: Request,
    detail: str,
) -> None:
    """Checks sliding-window quota for the caller IP and raises 429 with Retry-After."""
    allowed, retry_after = await limiter.check(get_client_ip(request))
    if not allowed:
        raise RateLimitExceededError(detail, retry_after_seconds=retry_after)
