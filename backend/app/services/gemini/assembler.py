"""Assembles and safety-grounds structured Gemini plan drafts."""

from __future__ import annotations

from app.schemas import (
    AirQualityReading,
    Alternative,
    CommunityAction,
    PlanResponse,
    RoutineTimeSlot,
    UserProfile,
)
from app.services.fallback_plan import build_community_actions
from app.services.gemini.schema import GeminiPlanDraft
from app.services.impact import ground_alternatives_numbers
from app.services.safety import (
    build_disclaimer,
    build_health_advisory,
    build_mask_guidance,
    enforce_plan_safety,
)

_SLOT_ORDER: tuple[RoutineTimeSlot, ...] = ("morning", "midday", "evening", "night")


def assemble_gemini_plan(
    draft: GeminiPlanDraft,
    profile: UserProfile,
    aqi_reading: AirQualityReading,
) -> PlanResponse | None:
    """Orders routine slots, grounds numeric savings, and applies CPCB safety checks."""
    by_slot = {item.time_slot: item for item in draft.routine}
    if not all(slot in by_slot for slot in _SLOT_ORDER):
        return None

    ordered_routine = [by_slot[slot] for slot in _SLOT_ORDER]
    raw_alts = [
        Alternative(
            current=alt.current,
            swap=alt.swap,
            why=alt.why,
            pm25_reduction_pct=min(95, max(0, int(round(alt.pm25ReductionPct)))),
            co2_saved_kg_per_month=min(1000, max(0, int(round(alt.co2SavedKgPerMonth)))),
        )
        for alt in draft.alternatives
    ]
    community: list[CommunityAction] = (
        draft.communityActions[:5]
        if len(draft.communityActions) >= 3
        else build_community_actions(profile, aqi_reading.aqi)
    )
    raw_plan = PlanResponse(
        aqi=aqi_reading,
        summary=draft.summary,
        health_advisory=build_health_advisory(profile, aqi_reading.aqi),
        routine=ordered_routine,
        indoor_hacks=draft.indoorHacks,
        alternatives=ground_alternatives_numbers(raw_alts, profile),
        community_actions=community,
        mask_guidance=build_mask_guidance(profile, aqi_reading.aqi),
        disclaimer=build_disclaimer(profile.language),
        generated_by="gemini",
    )
    return enforce_plan_safety(raw_plan, profile)
