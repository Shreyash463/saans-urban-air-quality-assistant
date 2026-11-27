"""Deterministic rule-based plan and community action fallback generators."""

from __future__ import annotations

from typing import Any

from app.data import load_copy_data
from app.schemas import (
    AirQualityReading,
    Alternative,
    BudgetLevel,
    CommunityAction,
    IndoorHack,
    LanguageCode,
    PlanResponse,
    RoutineItem,
    UserProfile,
)
from app.services.cpcb import get_aqi_category
from app.services.impact import get_alternative_numbers
from app.services.safety import (
    build_disclaimer,
    build_health_advisory,
    build_mask_guidance,
    is_vulnerable_household,
)

_HACK_ORDER_BY_BUDGET: dict[BudgetLevel, dict[str, int]] = {
    "low": {"free": 0, "low": 1, "medium": 2, "high": 3},
    "medium": {"low": 0, "free": 1, "medium": 2, "high": 3},
    "high": {"high": 0, "medium": 1, "low": 2, "free": 3},
}


def _copy() -> dict[str, Any]:
    return load_copy_data("fallback_copy.json")


def _t(entry: dict[str, Any], lang: LanguageCode, **fmt: object) -> str:
    text = str(entry[lang])
    return text.format(**fmt) if fmt else text


def _morning_item(copy: dict[str, Any], profile: UserProfile, vulnerable: bool) -> RoutineItem:
    lang = profile.language
    morning_copy = copy["morning"]
    if profile.commute_mode == "car":
        car = morning_copy["car"]
        extra = _t(car["extraVulnerable" if vulnerable else "extraGeneral"], lang)
        return RoutineItem(
            time_slot="morning",
            title=_t(car["title"], lang),
            detail=_t(car["detailTemplate"], lang, extra=extra),
            impact_note=_t(car["impactNote"], lang),
        )
    by_mode = morning_copy["byMode"]
    spec = by_mode.get(profile.commute_mode, by_mode["public_transport"])
    return RoutineItem(
        time_slot="morning",
        title=_t(spec["title"], lang),
        detail=_t(spec["detail"], lang, city=profile.city),
        impact_note=_t(spec["impactNote"], lang),
    )


def _midday_item(copy: dict[str, Any], profile: UserProfile) -> RoutineItem:
    lang = profile.language
    midday = copy["midday"]
    detail_key = "apartmentDetail" if profile.home_type == "apartment" else "houseDetail"
    return RoutineItem(
        time_slot="midday",
        title=_t(midday["title"], lang),
        detail=_t(midday[detail_key], lang),
        impact_note=_t(midday["impactNote"], lang),
    )


def _evening_item(copy: dict[str, Any], profile: UserProfile) -> RoutineItem:
    lang = profile.language
    evening = copy["evening"]
    detail_key = "biomassDetail" if profile.cooking_fuel == "biomass_wood" else "cleanDetail"
    return RoutineItem(
        time_slot="evening",
        title=_t(evening["title"], lang),
        detail=_t(evening[detail_key], lang),
        impact_note=_t(evening["impactNote"], lang),
    )


def _night_item(copy: dict[str, Any], profile: UserProfile, is_high_smog: bool) -> RoutineItem:
    lang = profile.language
    night = copy["night"]
    if profile.has_air_purifier:
        spec = night["purifier"]
        return RoutineItem(
            time_slot="night",
            title=_t(spec["title"], lang),
            detail=_t(spec["detail"], lang),
            impact_note=_t(spec["impactNote"], lang),
        )
    spec = night["sealedZone"]
    extra = _t(spec["highSmogExtra"], lang) if is_high_smog else ""
    return RoutineItem(
        time_slot="night",
        title=_t(spec["title"], lang),
        detail=_t(spec["detail"], lang, extra=extra),
        impact_note=_t(spec["impactNote"], lang),
    )


def _indoor_hacks(copy: dict[str, Any], profile: UserProfile) -> list[IndoorHack]:
    lang = profile.language
    hacks_copy = copy["indoorHacks"]
    seal_key = "sealTitleApartment" if profile.home_type == "apartment" else "sealTitleHouse"
    extra_key = "purifierOwnerExtras" if profile.has_air_purifier else "noPurifierExtras"
    raw_items = [*hacks_copy["base"], *hacks_copy[extra_key]]
    hacks = [
        IndoorHack(
            title=_t(hacks_copy[seal_key], lang) if item.get("useSealTitle") else _t(item["title"], lang),
            how_to=_t(item["howTo"], lang),
            estimated_benefit=_t(item["benefit"], lang),
            cost_level=item["cost"],
        )
        for item in raw_items
    ]
    order = _HACK_ORDER_BY_BUDGET[profile.budget]
    return sorted(hacks, key=lambda h: order[h.cost_level])


def _make_alternative(spec: dict[str, Any], commute_km: int, lang: LanguageCode, **fmt: object) -> Alternative:
    pm25, co2 = get_alternative_numbers(str(spec["preset"]), commute_km)
    return Alternative(
        current=_t(spec["current"], lang, **fmt),
        swap=_t(spec["swap"], lang, **fmt),
        why=_t(spec["why"], lang, **fmt),
        pm25_reduction_pct=pm25,
        co2_saved_kg_per_month=co2,
    )


def _build_alternatives(copy: dict[str, Any], profile: UserProfile) -> list[Alternative]:
    lang = profile.language
    alts = copy["alternatives"]
    commute_key = profile.commute_mode if profile.commute_mode in {"car", "two_wheeler"} else "other"
    cook_key = (
        "biomass_wood"
        if profile.cooking_fuel == "biomass_wood"
        else "gas"
        if profile.cooking_fuel in {"lpg", "piped_gas"}
        else "clean"
    )
    sleep_key = "hasPurifier" if profile.has_air_purifier else "noPurifier"
    return [
        _make_alternative(alts["commute"][commute_key], profile.commute_km, lang, km=profile.commute_km),
        _make_alternative(alts["cooking"][cook_key], profile.commute_km, lang),
        _make_alternative(alts["sleep"][sleep_key], profile.commute_km, lang),
        _make_alternative(alts["waste"], profile.commute_km, lang),
    ]


def build_community_actions(profile: UserProfile, aqi: int) -> list[CommunityAction]:
    """Generates 3 practical collective RWA, neighborhood, school, and workplace actions."""
    lang = profile.language
    community_copy = _copy()["community"]
    keys = ["rwa", "neighbours", "school" if (profile.has_children or aqi >= 201) else "workplace"]
    return [
        CommunityAction(
            title=_t(spec["title"], lang),
            who=spec["who"],
            how_to=_t(spec["howTo"], lang, city=profile.city, aqi=aqi),
            estimated_impact=_t(spec["impact"], lang),
            effort=spec["effort"],
        )
        for key in keys
        if (spec := community_copy[key])
    ]


def generate_fallback_plan(profile: UserProfile, aqi_reading: AirQualityReading) -> PlanResponse:
    """Generates a complete deterministic PlanResponse when Gemini is unavailable."""
    copy = _copy()
    lang = profile.language
    cat = get_aqi_category(aqi_reading.aqi)
    sum_copy = copy["summary"]
    source_label = _t(sum_copy["sourceLive" if aqi_reading.source == "live" else "sourceDemo"], lang)
    budget_note = _t(sum_copy["budgetLow" if profile.budget == "low" else "budgetOther"], lang)
    summary = _t(
        sum_copy["template"],
        lang,
        city=aqi_reading.city,
        sourceLabel=source_label,
        aqi=aqi_reading.aqi,
        category=cat.label_hi if lang == "hi" else cat.label_en,
        pollutant=aqi_reading.dominant_pollutant,
        householdSize=profile.household_size,
        budgetNote=budget_note,
    )
    vulnerable = is_vulnerable_household(profile)
    return PlanResponse(
        aqi=aqi_reading,
        summary=summary,
        health_advisory=build_health_advisory(profile, aqi_reading.aqi),
        routine=[
            _morning_item(copy, profile, vulnerable),
            _midday_item(copy, profile),
            _evening_item(copy, profile),
            _night_item(copy, profile, aqi_reading.aqi >= 201),
        ],
        indoor_hacks=_indoor_hacks(copy, profile),
        alternatives=_build_alternatives(copy, profile),
        community_actions=build_community_actions(profile, aqi_reading.aqi),
        mask_guidance=build_mask_guidance(profile, aqi_reading.aqi),
        disclaimer=build_disclaimer(lang),
        generated_by="rules",
    )
