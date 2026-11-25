"""Personalized clean-air plan endpoint."""

from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException, Request

from app.routers.air_quality import get_client_ip
from app.schemas import PlanResponse, UserProfile
from app.services.fallback_plan import generate_fallback_plan

router = APIRouter(prefix="/api", tags=["plan"])


def _build_plan_cache_key(profile: UserProfile, aqi_source: str, aqi_val: int) -> str:
    aqi_bucket = f"{aqi_source}:{aqi_val // 10}"
    payload = {
        "profile": profile.model_dump(mode="json"),
        "aqiBucket": aqi_bucket,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/plan", response_model=PlanResponse, response_model_by_alias=True)
async def create_plan_endpoint(
    profile: UserProfile,
    request: Request,
) -> PlanResponse:
    """Generates a personalized clean-air plan using live AQI, Gemini, safety checks, and fallback."""
    limiter = request.app.state.plan_limiter
    allowed, retry_after = await limiter.check(get_client_ip(request))
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many plan requests. Please try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )

    aq_service = request.app.state.air_quality_service
    http_client = request.app.state.http_client
    aqi_reading = await aq_service.get_air_quality(profile.city, http_client)

    plan_cache = request.app.state.plan_cache
    cache_key = _build_plan_cache_key(profile, aqi_reading.source, aqi_reading.aqi)
    cached_plan = await plan_cache.get(cache_key)
    if cached_plan is not None:
        return cached_plan.model_copy(update={"aqi": aqi_reading})

    gemini_client = request.app.state.gemini_client
    plan = await gemini_client.generate_plan(profile, aqi_reading)
    if plan is None:
        plan = generate_fallback_plan(profile, aqi_reading)

    await plan_cache.set(cache_key, plan)
    return plan
