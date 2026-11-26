"""Personalized clean-air plan endpoint."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time

from fastapi import APIRouter, Query, Request, Response

from app.dependencies import (
    enforce_rate_limit,
    get_air_quality_service,
    get_gemini_client,
    get_http_client,
    get_plan_cache,
    get_plan_limiter,
)
from app.routers.air_quality import validate_optional_coords
from app.schemas import PlanResponse, UserProfile
from app.services.fallback_plan import generate_fallback_plan
from app.services.impact import ProfileFacts, build_profile_facts

logger = logging.getLogger("saans")
router = APIRouter(prefix="/api", tags=["plan"])


def _build_plan_cache_key(profile: UserProfile, aqi_source: str, aqi_val: int) -> str:
    aqi_bucket = f"{aqi_source}:{aqi_val // 10}"
    payload = {
        "profile": profile.model_dump(mode="json"),
        "aqiBucket": aqi_bucket,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _prepare_profile_facts(profile: UserProfile) -> ProfileFacts:
    """Computes grounded profile facts asynchronously alongside AQI I/O."""
    return build_profile_facts(profile)


@router.post(
    "/plan",
    response_model=PlanResponse,
    response_model_by_alias=True,
    response_model_exclude_none=True,
)
async def create_plan_endpoint(
    profile: UserProfile,
    request: Request,
    response: Response,
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lon: float | None = Query(default=None, ge=-180.0, le=180.0),
    prefer_coords: bool | None = Query(default=None, alias="preferCoords"),
) -> PlanResponse:
    """Generates a personalized clean-air plan using live AQI, Gemini, safety checks, and fallback."""
    started = time.monotonic()
    response.headers["Cache-Control"] = "no-store"

    await enforce_rate_limit(
        get_plan_limiter(request),
        request,
        "Too many plan requests. Please try again shortly.",
    )
    coords = validate_optional_coords(lat, lon)
    use_coords = coords is not None and prefer_coords is not False

    aq_service = get_air_quality_service(request)
    http_client = get_http_client(request)
    aqi_coro = (
        aq_service.get_air_quality_by_coords(coords[0], coords[1], http_client)
        if use_coords and coords is not None
        else aq_service.get_air_quality(profile.city, http_client)
    )
    aqi_reading, facts = await asyncio.gather(aqi_coro, _prepare_profile_facts(profile))

    plan_cache = get_plan_cache(request)
    cache_key = _build_plan_cache_key(profile, aqi_reading.source, aqi_reading.aqi)
    cached_plan = await plan_cache.get(cache_key)
    if cached_plan is not None:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        logger.info(
            "route=/api/plan cache=hit aqi_source=%s generated_by=%s latency_ms=%d",
            aqi_reading.source,
            cached_plan.generated_by,
            elapsed_ms,
        )
        return cached_plan.model_copy(update={"aqi": aqi_reading})

    gemini_client = get_gemini_client(request)
    plan, fallback_reason, retry_after = await gemini_client.generate_plan_with_status(
        profile, aqi_reading, facts=facts
    )
    if plan is not None:
        await plan_cache.set(cache_key, plan)
    else:
        resolved_reason = fallback_reason or ("no_key" if not gemini_client.is_configured else "ai_error")
        plan = generate_fallback_plan(profile, aqi_reading).model_copy(
            update={
                "fallback_reason": resolved_reason,
                "retry_after_seconds": None if resolved_reason == "no_key" else retry_after,
            }
        )
        # Only cache deliberate no-key rule plans; transient AI failures must never stick in cache.
        if resolved_reason == "no_key":
            await plan_cache.set(cache_key, plan)
    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "route=/api/plan cache=miss aqi_source=%s generated_by=%s latency_ms=%d",
        aqi_reading.source,
        plan.generated_by,
        elapsed_ms,
    )
    return plan
