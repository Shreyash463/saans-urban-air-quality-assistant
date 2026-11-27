"""Personalized clean-air plan endpoint."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import Callable

from fastapi import APIRouter, Request, Response

from app.dependencies import (
    AirQualityServiceDep,
    AppState,
    AppStateDep,
    GeminiClientDep,
    HttpClientDep,
    PlanCacheDep,
    PlanLimiterDep,
    enforce_rate_limit,
)
from app.exceptions import InvalidInputError, log_route_event
from app.schemas import AirQualityReading, PlanRequest, PlanResponse, UserProfile
from app.services.cache import TTLCache
from app.services.fallback_plan import generate_fallback_plan
from app.services.gemini import GeminiClient
from app.services.impact import ProfileFacts, build_profile_facts

logger = logging.getLogger("saans")
router = APIRouter(prefix="/api", tags=["plan"])


def _to_user_profile(payload: PlanRequest) -> UserProfile:
    return UserProfile.model_construct(
        city=payload.city,
        household_size=payload.household_size,
        has_children=payload.has_children,
        has_elderly=payload.has_elderly,
        has_respiratory_condition=payload.has_respiratory_condition,
        commute_mode=payload.commute_mode,
        commute_km=payload.commute_km,
        home_type=payload.home_type,
        has_air_purifier=payload.has_air_purifier,
        cooking_fuel=payload.cooking_fuel,
        budget=payload.budget,
        language=payload.language,
    )


def _elapsed_ms(started: float, now: float) -> int:
    return max(0, round((now - started) * 1000))


def _resolve_clock(app_state: AppState) -> Callable[[], float]:
    return app_state.clock if app_state.clock is not None else time.monotonic


def _build_plan_cache_key(profile: UserProfile, aqi_source: str, aqi_val: int) -> str:
    aqi_bucket = f"{aqi_source}:{aqi_val // 10}"
    payload = {
        "profile": profile.model_dump(mode="json"),
        "aqiBucket": aqi_bucket,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _generate_or_fallback_plan(
    profile: UserProfile,
    aqi_reading: AirQualityReading,
    facts: ProfileFacts,
    cache_key: str,
    plan_cache: TTLCache[PlanResponse],
    gemini_client: GeminiClient,
) -> PlanResponse:
    plan, fallback_reason, retry_after = await gemini_client.generate_plan_with_status(
        profile, aqi_reading, facts=facts
    )
    if plan is not None:
        await plan_cache.set(cache_key, plan)
        return plan

    resolved_reason = fallback_reason or ("no_key" if not gemini_client.is_configured else "ai_error")
    fallback = generate_fallback_plan(profile, aqi_reading).model_copy(
        update={
            "fallback_reason": resolved_reason,
            "retry_after_seconds": None if resolved_reason == "no_key" else retry_after,
        }
    )
    if resolved_reason == "no_key":
        await plan_cache.set(cache_key, fallback)
    return fallback


def _log_plan_latency(
    cache_state: str,
    aqi_reading: AirQualityReading,
    plan: PlanResponse,
    started: float,
    clock: Callable[[], float],
) -> None:
    log_route_event(
        logger,
        "/api/plan",
        cache=cache_state,
        aqi_source=aqi_reading.source,
        generated_by=plan.generated_by,
        latency_ms=_elapsed_ms(started, clock()),
    )


@router.post(
    "/plan",
    response_model=PlanResponse,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def create_plan_endpoint(
    payload: PlanRequest,
    request: Request,
    response: Response,
    app_state: AppStateDep,
    limiter: PlanLimiterDep,
    aq_service: AirQualityServiceDep,
    http_client: HttpClientDep,
    plan_cache: PlanCacheDep,
    gemini_client: GeminiClientDep,
) -> PlanResponse:
    """Generates a personalized clean-air plan using live AQI, Gemini, safety checks, and fallback."""
    clock = _resolve_clock(app_state)
    started = clock()
    response.headers["Cache-Control"] = "no-store"

    if "lat" in request.query_params or "lon" in request.query_params:
        raise InvalidInputError(
            "Latitude and longitude must be sent in the JSON request body, not query parameters."
        )

    await enforce_rate_limit(
        limiter,
        request,
        "Too many plan requests. Please try again shortly.",
    )
    profile = _to_user_profile(payload)
    coords = payload.coords if payload.prefer_coords is not False else None
    aqi_reading = await (
        aq_service.get_air_quality_by_coords(coords.lat, coords.lon, http_client)
        if coords is not None
        else aq_service.get_air_quality(profile.city, http_client)
    )
    cache_key = _build_plan_cache_key(profile, aqi_reading.source, aqi_reading.aqi)
    cached_plan = await plan_cache.get(cache_key)
    if cached_plan is not None:
        _log_plan_latency("hit", aqi_reading, cached_plan, started, clock)
        return cached_plan.model_copy(update={"aqi": aqi_reading})

    facts = build_profile_facts(profile)
    plan = await _generate_or_fallback_plan(
        profile, aqi_reading, facts, cache_key, plan_cache, gemini_client
    )
    _log_plan_latency("miss", aqi_reading, plan, started, clock)
    return plan
