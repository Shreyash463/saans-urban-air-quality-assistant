"""Shared impact math & profile grounding loaded from contract/impact-factors.json."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.schemas import Alternative, UserProfile

_CANDIDATE_CONTRACT_PATHS = (
    Path(__file__).resolve().parents[3] / "contract" / "impact-factors.json",
    Path(__file__).resolve().parents[2] / "contract" / "impact-factors.json",
    Path("/app/contract/impact-factors.json"),
)


def _load_contract_data() -> dict[str, Any]:
    for path in _CANDIDATE_CONTRACT_PATHS:
        if path.is_file():
            with path.open("r", encoding="utf-8") as fh:
                data: dict[str, Any] = json.load(fh)
                return data
    raise FileNotFoundError("Could not locate contract/impact-factors.json")


_CONTRACT_DATA = _load_contract_data()
_CONSTANTS: dict[str, float] = _CONTRACT_DATA["constants"]
_ACTIONS: list[dict[str, Any]] = _CONTRACT_DATA["actions"]
_ACTION_MAP: dict[str, dict[str, Any]] = {a["id"]: a for a in _ACTIONS}
_ALTERNATIVE_NUMBERS: dict[str, dict[str, Any]] = _CONTRACT_DATA["alternativeNumbers"]

MAX_PM25_REDUCTION_PCT = int(_CONSTANTS["MAX_PM25_REDUCTION_PCT"])
MIN_RESIDUAL_EXPOSURE_PCT = int(_CONSTANTS["MIN_RESIDUAL_EXPOSURE_PCT"])
MAX_AIR_FRIENDLY_SCORE = int(_CONSTANTS["MAX_AIR_FRIENDLY_SCORE"])
TOP_RECOMMENDED_COUNT = int(_CONSTANTS["TOP_RECOMMENDED_COUNT"])
REFERENCE_DAILY_COMMUTE_KM = float(_CONSTANTS["REFERENCE_DAILY_COMMUTE_KM"])
MIN_COMMUTE_SCALE = float(_CONSTANTS["MIN_COMMUTE_SCALE"])
MAX_COMMUTE_SCALE = float(_CONSTANTS["MAX_COMMUTE_SCALE"])

COMMUTE_SCALED_IDS = frozenset({"commute_transit", "carpool_three_days"})

_EMISSION_KEYWORDS = (
    "metro",
    "bus",
    "transit",
    "carpool",
    "ride",
    "ev ",
    "electric scooter",
    "electric vehicle",
    "puc",
    "induction",
    "lpg",
    "piped gas",
    "png",
    "chulha",
    "biomass",
    "wood",
    "leaf",
    "leaves",
    "waste",
    "compost",
    "bonfire",
    "firecracker",
    "दीये",
    "खाद",
    "कचरा",
    "पत्त",
    "पराली",
    "मेट्रो",
    "कारपूल",
    "इंडक्शन",
    "एलपीजी",
    "lpg",
)

_NON_EMISSION_OVERRIDE_KEYWORDS = (
    "window",
    "ventilat",
    "mask",
    "n95",
    "ffp2",
    "purifier",
    "hepa",
    "box fan",
    "mop",
    "sweep",
    "incense",
    "agarbatti",
    "dhoop",
    "coil",
    "weather-strip",
    "seal",
    "draft stopper",
    "plant",
    "exhaust fan",
    "खिड़क",
    "मास्क",
    "प्यूरीफायर",
    "पोंछा",
    "अगरबत्ती",
    "पौध",
)


@dataclass(frozen=True)
class ProfileFacts:
    """Deterministic facts passed to Gemini and fallback generators."""

    already_doing: list[str]
    recommended_actions: list[str]
    swap_targets: list[tuple[str, int, int]]  # (category_key, pm25_pct, co2_kg)
    vulnerabilities: list[str]


def get_commute_scale_factor(commute_km: float | None) -> float:
    """Computes bounded commute distance multiplier relative to 16 km/day."""
    if commute_km is None or not math.isfinite(commute_km) or commute_km <= 0:
        return 1.0
    ratio = commute_km / REFERENCE_DAILY_COMMUTE_KM
    return min(MAX_COMMUTE_SCALE, max(MIN_COMMUTE_SCALE, ratio))


def calculate_multiplicative_pm25_reduction(fractions: list[float]) -> int:
    """Computes 1 - prod(1 - r_i), rounded and clamped to [0, MAX_PM25_REDUCTION_PCT]."""
    remaining = 1.0
    for raw in fractions:
        if not math.isfinite(raw) or raw <= 0:
            continue
        clamped = min(0.95, raw)
        remaining *= 1.0 - clamped
    pct = (1.0 - remaining) * 100.0
    return min(MAX_PM25_REDUCTION_PCT, max(0, int(round(pct))))


def get_already_doing_ids(profile: UserProfile) -> set[str]:
    """Identifies simulator action IDs that the household already practices."""
    done: set[str] = set()
    if profile.commute_mode in {"public_transport", "walk_cycle", "work_from_home"}:
        done.add("commute_transit")
    if profile.cooking_fuel in {"induction_electric", "piped_gas"}:
        done.add("clean_cooking")
    if profile.has_air_purifier:
        done.add("bedroom_purifier")
    return done


def get_inapplicable_ids(profile: UserProfile) -> set[str]:
    """Identifies simulator action IDs inapplicable to the user's commute mode."""
    if profile.commute_mode in {"work_from_home", "walk_cycle", "public_transport"}:
        return {"carpool_three_days"}
    return set()


def get_scaled_co2(action_id: str, commute_km: int) -> int | None:
    """Returns monthly CO2 kg saved for emission-relevant actions, or None."""
    action = _ACTION_MAP.get(action_id)
    if action is None:
        return None
    base_co2 = action.get("co2SavedKgPerMonth")
    if base_co2 is None:
        return None
    scale = get_commute_scale_factor(commute_km) if action_id in COMMUTE_SCALED_IDS else 1.0
    return int(round(float(base_co2) * scale))


def get_alternative_numbers(preset_key: str, commute_km: int) -> tuple[int, int]:
    """Returns deterministic (pm25ReductionPct, co2SavedKgPerMonth) for an alternative category."""
    spec = _ALTERNATIVE_NUMBERS[preset_key]
    pm25_pct = min(MAX_PM25_REDUCTION_PCT, max(0, int(spec["pm25ReductionPct"])))
    if not spec.get("emissionRelevant", False):
        return pm25_pct, 0
    base_co2 = float(spec.get("baseCo2KgPerMonth", 0))
    scale = get_commute_scale_factor(commute_km) if spec.get("commuteScaled") else 1.0
    co2_val = max(0, int(round(base_co2 * scale)))
    return pm25_pct, co2_val


def calculate_profile_impact(
    profile: UserProfile,
    selected_ids: list[str],
) -> dict[str, int]:
    """Python mirror of frontend calculateImpact() for verification and grounding."""
    done_ids = get_already_doing_ids(profile)
    inapplicable_ids = get_inapplicable_ids(profile)
    valid_selected = [
        aid
        for aid in dict.fromkeys(selected_ids)
        if aid in _ACTION_MAP and aid not in done_ids and aid not in inapplicable_ids
    ]

    baseline_remaining = 1.0
    for aid in done_ids:
        frac = float(_ACTION_MAP[aid]["pm25ReductionFraction"])
        baseline_remaining *= 1.0 - frac
    before_exposure_pct = max(MIN_RESIDUAL_EXPOSURE_PCT, int(round(baseline_remaining * 100.0)))

    after_remaining = baseline_remaining
    for aid in valid_selected:
        frac = float(_ACTION_MAP[aid]["pm25ReductionFraction"])
        after_remaining *= 1.0 - frac

    total_cut_pct = min(
        MAX_PM25_REDUCTION_PCT,
        max(0, int(round((1.0 - after_remaining) * 100.0))),
    )
    after_exposure_pct = max(
        MIN_RESIDUAL_EXPOSURE_PCT,
        min(before_exposure_pct, 100 - total_cut_pct),
    )
    additional_cut_pct = (
        min(
            MAX_PM25_REDUCTION_PCT,
            max(
                0,
                int(round(((before_exposure_pct - after_exposure_pct) / before_exposure_pct) * 100.0)),
            ),
        )
        if before_exposure_pct > 0
        else 0
    )

    co2_total = 0
    for aid in valid_selected:
        scaled = get_scaled_co2(aid, profile.commute_km)
        if scaled is not None:
            co2_total += scaled

    return {
        "before_exposure_pct": before_exposure_pct,
        "after_exposure_pct": after_exposure_pct,
        "additional_exposure_cut_pct": additional_cut_pct,
        "total_exposure_cut_pct": total_cut_pct,
        "baseline_score": min(MAX_AIR_FRIENDLY_SCORE, max(0, 100 - before_exposure_pct)),
        "air_friendly_score": min(MAX_AIR_FRIENDLY_SCORE, max(0, 100 - after_exposure_pct)),
        "co2_saved_kg_per_month": co2_total,
    }


def _collect_already_doing(profile: UserProfile) -> list[str]:
    done: list[str] = []
    if profile.commute_mode == "public_transport":
        done.append("Already uses low-emission metro/bus public transport")
    elif profile.commute_mode == "walk_cycle":
        done.append("Already commutes zero-tailpipe by walking or cycling")
    elif profile.commute_mode == "work_from_home":
        done.append("Already works from home with zero daily commute tailpipe emissions")

    if profile.cooking_fuel == "induction_electric":
        done.append("Already cooks with clean electric induction")
    elif profile.cooking_fuel == "piped_gas":
        done.append("Already uses cleaner piped natural gas (PNG)")

    if profile.has_air_purifier:
        done.append("Already owns an indoor air purifier")
    return done


def _collect_vulnerabilities(profile: UserProfile) -> list[str]:
    vulnerabilities: list[str] = []
    if profile.has_children:
        vulnerabilities.append("children under 14")
    if profile.has_elderly:
        vulnerabilities.append("older adults (60+)")
    if profile.has_respiratory_condition:
        vulnerabilities.append("asthma/COPD or respiratory sensitivity")
    return vulnerabilities


def _select_recommended_actions(profile: UserProfile) -> list[str]:
    done_ids = get_already_doing_ids(profile)
    inapplicable_ids = get_inapplicable_ids(profile)
    applicable = []
    for action in _ACTIONS:
        aid = action["id"]
        if aid in done_ids or aid in inapplicable_ids:
            continue
        pm_score = float(action["pm25ReductionFraction"]) * 100.0
        co2_val = get_scaled_co2(aid, profile.commute_km)
        co2_bonus = float(co2_val) * 0.15 if co2_val is not None else 0.0
        applicable.append((pm_score + co2_bonus, aid))
    applicable.sort(reverse=True)
    return [aid for _, aid in applicable[:TOP_RECOMMENDED_COUNT]]


def _select_swap_keys(profile: UserProfile) -> list[str]:
    commute_map = {
        "car": "commute_car_to_transit",
        "two_wheeler": "commute_two_wheeler_to_transit",
    }
    cooking_key = (
        "cooking_biomass_to_clean"
        if profile.cooking_fuel == "biomass_wood"
        else "cooking_gas_to_induction"
        if profile.cooking_fuel in {"lpg", "piped_gas"}
        else "cooking_ventilation_only"
    )
    sleep_key = "seal_door_gaps" if profile.has_air_purifier else "bedroom_purifier"
    return [
        commute_map.get(profile.commute_mode, "fitted_n95_mask"),
        cooking_key,
        sleep_key,
        "stop_waste_burning",
    ]


def build_profile_facts(profile: UserProfile) -> ProfileFacts:
    """Computes grounded household facts, existing habits, and deterministic swap numbers."""
    swap_targets = [
        (key, *get_alternative_numbers(key, profile.commute_km))
        for key in _select_swap_keys(profile)
    ]
    return ProfileFacts(
        already_doing=_collect_already_doing(profile),
        recommended_actions=_select_recommended_actions(profile),
        swap_targets=swap_targets,
        vulnerabilities=_collect_vulnerabilities(profile),
    )


def _is_emission_relevant_swap(alt: Alternative) -> bool:
    combined = f"{alt.current} {alt.swap} {alt.why}".lower()
    if any(kw in combined for kw in _EMISSION_KEYWORDS):
        return True
    if any(kw in combined for kw in _NON_EMISSION_OVERRIDE_KEYWORDS):
        return False
    return False


def ground_alternatives_numbers(
    alternatives: list[Alternative],
    profile: UserProfile,
) -> list[Alternative]:
    """Overwrites/clamps LLM-returned alternative numbers using deterministic factors."""
    facts = build_profile_facts(profile)
    grounded: list[Alternative] = []
    used_pm_values: set[int] = set()

    for idx, alt in enumerate(alternatives):
        if idx < len(facts.swap_targets):
            _preset_key, pm25_pct, co2_kg = facts.swap_targets[idx]
            # Strictly zero out CO2 whenever the swap text itself is non-emission.
            if not _is_emission_relevant_swap(alt):
                co2_kg = 0
        else:
            pm25_pct = min(MAX_PM25_REDUCTION_PCT, max(1, alt.pm25_reduction_pct))
            co2_kg = min(250, max(0, alt.co2_saved_kg_per_month)) if _is_emission_relevant_swap(alt) else 0

        # Ensure distinct non-identical numbers when grounded items differ
        while pm25_pct in used_pm_values and pm25_pct < MAX_PM25_REDUCTION_PCT:
            pm25_pct += 1
        used_pm_values.add(pm25_pct)

        grounded.append(
            Alternative(
                current=alt.current,
                swap=alt.swap,
                why=alt.why,
                pm25_reduction_pct=min(MAX_PM25_REDUCTION_PCT, max(0, pm25_pct)),
                co2_saved_kg_per_month=max(0, co2_kg),
            )
        )

    return grounded
