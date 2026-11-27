"""Shared impact math & profile grounding loaded from contract/impact-factors.json."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from types import MappingProxyType
from typing import Any

from app.schemas import Alternative, UserProfile

_CANDIDATE_CONTRACT_PATHS = (
    Path(__file__).resolve().parents[3] / "contract" / "impact-factors.json",
    Path(__file__).resolve().parents[2] / "contract" / "impact-factors.json",
    Path("/app/contract/impact-factors.json"),
)

COMMUTE_SCALED_IDS = frozenset({"commute_transit", "carpool_three_days"})

_EMISSION_KEYWORDS = (
    "metro", "bus", "transit", "carpool", "ride", "ev ", "electric scooter",
    "electric vehicle", "puc", "induction", "lpg", "piped gas", "png", "chulha",
    "biomass", "wood", "leaf", "leaves", "waste", "compost", "bonfire",
    "firecracker", "दीये", "खाद", "कचरा", "पत्त", "पराली", "मेट्रो", "कारपूल",
    "इंडक्शन", "एलपीजी",
)


@dataclass(frozen=True, slots=True)
class ProfileFacts:
    """Deterministic facts passed to Gemini and fallback generators."""

    already_doing: list[str]
    recommended_actions: list[str]
    swap_targets: list[tuple[str, int, int]]
    vulnerabilities: list[str]


@dataclass(frozen=True, slots=True)
class _ImpactContract:
    max_pm25_reduction_pct: int
    min_residual_exposure_pct: int
    max_air_friendly_score: int
    top_recommended_count: int
    reference_daily_commute_km: float
    min_commute_scale: float
    max_commute_scale: float
    actions: tuple[dict[str, Any], ...]
    action_map: MappingProxyType[str, dict[str, Any]]
    alternative_numbers: MappingProxyType[str, dict[str, Any]]


@lru_cache(maxsize=1)
def _load_contract() -> _ImpactContract:
    for path in _CANDIDATE_CONTRACT_PATHS:
        if path.is_file():
            raw = json.loads(path.read_text(encoding="utf-8"))
            consts = raw["constants"]
            actions = tuple(raw["actions"])
            return _ImpactContract(
                max_pm25_reduction_pct=int(consts["MAX_PM25_REDUCTION_PCT"]),
                min_residual_exposure_pct=int(consts["MIN_RESIDUAL_EXPOSURE_PCT"]),
                max_air_friendly_score=int(consts["MAX_AIR_FRIENDLY_SCORE"]),
                top_recommended_count=int(consts["TOP_RECOMMENDED_COUNT"]),
                reference_daily_commute_km=float(consts["REFERENCE_DAILY_COMMUTE_KM"]),
                min_commute_scale=float(consts["MIN_COMMUTE_SCALE"]),
                max_commute_scale=float(consts["MAX_COMMUTE_SCALE"]),
                actions=actions,
                action_map=MappingProxyType({a["id"]: a for a in actions}),
                alternative_numbers=MappingProxyType(raw["alternativeNumbers"]),
            )
    raise FileNotFoundError("Could not locate contract/impact-factors.json")


MAX_PM25_REDUCTION_PCT = _load_contract().max_pm25_reduction_pct


def collect_already_doing(profile: UserProfile) -> list[str]:
    done: list[str] = []
    commute_labels = {
        "public_transport": "Already uses low-emission metro/bus public transport",
        "walk_cycle": "Already commutes zero-tailpipe by walking or cycling",
        "work_from_home": "Already works from home with zero daily commute tailpipe emissions",
    }
    if profile.commute_mode in commute_labels:
        done.append(commute_labels[profile.commute_mode])
    if profile.cooking_fuel == "induction_electric":
        done.append("Already cooks with clean electric induction")
    elif profile.cooking_fuel == "piped_gas":
        done.append("Already uses cleaner piped natural gas (PNG)")
    if profile.has_air_purifier:
        done.append("Already owns an indoor air purifier")
    return done


def collect_vulnerabilities(profile: UserProfile) -> list[str]:
    vulnerabilities: list[str] = []
    if profile.has_children:
        vulnerabilities.append("children under 14")
    if profile.has_elderly:
        vulnerabilities.append("older adults (60+)")
    if profile.has_respiratory_condition:
        vulnerabilities.append("asthma/COPD or respiratory sensitivity")
    return vulnerabilities


def is_emission_relevant_swap(alt: Alternative) -> bool:
    """Only combustion, transport, or open-burning changes reduce CO2; barriers report 0."""
    combined = f"{alt.current} {alt.swap} {alt.why}".lower()
    return any(kw in combined for kw in _EMISSION_KEYWORDS)


def get_commute_scale_factor(commute_km: float | None) -> float:
    contract = _load_contract()
    if commute_km is None or not math.isfinite(commute_km) or commute_km <= 0:
        return 1.0
    ratio = commute_km / contract.reference_daily_commute_km
    return min(contract.max_commute_scale, max(contract.min_commute_scale, ratio))


def calculate_multiplicative_pm25_reduction(fractions: list[float]) -> int:
    """Computes 1 - prod(1 - r_i), rounded and capped at MAX_PM25_REDUCTION_PCT."""
    remaining = 1.0
    for raw in fractions:
        if math.isfinite(raw) and raw > 0:
            remaining *= 1.0 - min(0.95, raw)
    pct = (1.0 - remaining) * 100.0
    return min(MAX_PM25_REDUCTION_PCT, max(0, int(round(pct))))


def get_already_doing_ids(profile: UserProfile) -> set[str]:
    done: set[str] = set()
    if profile.commute_mode in {"public_transport", "walk_cycle", "work_from_home"}:
        done.add("commute_transit")
    if profile.cooking_fuel in {"induction_electric", "piped_gas"}:
        done.add("clean_cooking")
    if profile.has_air_purifier:
        done.add("bedroom_purifier")
    return done


def get_inapplicable_ids(profile: UserProfile) -> set[str]:
    if profile.commute_mode in {"work_from_home", "walk_cycle", "public_transport"}:
        return {"carpool_three_days"}
    return set()


def get_scaled_co2(action_id: str, commute_km: int) -> int | None:
    action = _load_contract().action_map.get(action_id)
    if action is None or action.get("co2SavedKgPerMonth") is None:
        return None
    base_co2 = float(action["co2SavedKgPerMonth"])
    scale = get_commute_scale_factor(commute_km) if action_id in COMMUTE_SCALED_IDS else 1.0
    return int(round(base_co2 * scale))


def get_alternative_numbers(preset_key: str, commute_km: int) -> tuple[int, int]:
    spec = _load_contract().alternative_numbers[preset_key]
    pm25_pct = min(MAX_PM25_REDUCTION_PCT, max(0, int(spec["pm25ReductionPct"])))
    if not spec.get("emissionRelevant", False):
        return pm25_pct, 0
    base_co2 = float(spec.get("baseCo2KgPerMonth", 0))
    scale = get_commute_scale_factor(commute_km) if spec.get("commuteScaled") else 1.0
    return pm25_pct, max(0, int(round(base_co2 * scale)))


def _compute_exposure_stats(done_ids: set[str], valid_selected: list[str]) -> tuple[int, int, int, int]:
    contract = _load_contract()
    done_fracs = [float(contract.action_map[aid]["pm25ReductionFraction"]) for aid in done_ids]
    selected_fracs = [float(contract.action_map[aid]["pm25ReductionFraction"]) for aid in valid_selected]
    before_cut = calculate_multiplicative_pm25_reduction(done_fracs)
    before_pct = max(contract.min_residual_exposure_pct, 100 - before_cut) if done_ids else 100
    total_cut = calculate_multiplicative_pm25_reduction([*done_fracs, *selected_fracs])
    after_pct = max(contract.min_residual_exposure_pct, min(before_pct, 100 - total_cut))
    add_cut = (
        min(MAX_PM25_REDUCTION_PCT, max(0, int(round(((before_pct - after_pct) / before_pct) * 100.0))))
        if before_pct > 0
        else 0
    )
    return before_pct, after_pct, add_cut, total_cut


def calculate_profile_impact(profile: UserProfile, selected_ids: list[str]) -> dict[str, int]:
    """Python mirror of frontend calculateImpact() for golden-vector verification and grounding."""
    contract = _load_contract()
    done_ids = get_already_doing_ids(profile)
    inapplicable_ids = get_inapplicable_ids(profile)
    valid_selected = [
        aid for aid in dict.fromkeys(selected_ids)
        if aid in contract.action_map and aid not in done_ids and aid not in inapplicable_ids
    ]
    before_pct, after_pct, add_cut, total_cut = _compute_exposure_stats(done_ids, valid_selected)
    co2_total = sum(
        scaled for aid in valid_selected
        if (scaled := get_scaled_co2(aid, profile.commute_km)) is not None
    )
    return {
        "before_exposure_pct": before_pct,
        "after_exposure_pct": after_pct,
        "additional_exposure_cut_pct": add_cut,
        "total_exposure_cut_pct": total_cut,
        "baseline_score": min(contract.max_air_friendly_score, max(0, 100 - before_pct)),
        "air_friendly_score": min(contract.max_air_friendly_score, max(0, 100 - after_pct)),
        "co2_saved_kg_per_month": co2_total,
    }


def _select_recommended_actions(profile: UserProfile) -> list[str]:
    contract = _load_contract()
    done_ids = get_already_doing_ids(profile)
    inapplicable_ids = get_inapplicable_ids(profile)
    scored: list[tuple[float, str]] = []
    for action in contract.actions:
        aid = action["id"]
        if aid in done_ids or aid in inapplicable_ids:
            continue
        pm_score = float(action["pm25ReductionFraction"]) * 100.0
        co2_val = get_scaled_co2(aid, profile.commute_km)
        scored.append((pm_score + (float(co2_val) * 0.15 if co2_val is not None else 0.0), aid))
    scored.sort(reverse=True)
    return [aid for _, aid in scored[: contract.top_recommended_count]]


def _select_swap_keys(profile: UserProfile) -> list[str]:
    commute_map = {"car": "commute_car_to_transit", "two_wheeler": "commute_two_wheeler_to_transit"}
    cooking_key = (
        "cooking_biomass_to_clean" if profile.cooking_fuel == "biomass_wood"
        else "cooking_gas_to_induction" if profile.cooking_fuel in {"lpg", "piped_gas"}
        else "cooking_ventilation_only"
    )
    sleep_key = "seal_door_gaps" if profile.has_air_purifier else "bedroom_purifier"
    return [commute_map.get(profile.commute_mode, "fitted_n95_mask"), cooking_key, sleep_key, "stop_waste_burning"]


def build_profile_facts(profile: UserProfile) -> ProfileFacts:
    swap_targets = [(key, *get_alternative_numbers(key, profile.commute_km)) for key in _select_swap_keys(profile)]
    return ProfileFacts(
        already_doing=collect_already_doing(profile),
        recommended_actions=_select_recommended_actions(profile),
        swap_targets=swap_targets,
        vulnerabilities=collect_vulnerabilities(profile),
    )


def ground_alternatives_numbers(alternatives: list[Alternative], profile: UserProfile) -> list[Alternative]:
    """Replaces LLM-returned alternative metrics with bounded contract-backed numbers."""
    facts = build_profile_facts(profile)
    grounded: list[Alternative] = []
    used_pm: set[int] = set()
    for idx, alt in enumerate(alternatives):
        if idx < len(facts.swap_targets):
            _, pm25_pct, co2_kg = facts.swap_targets[idx]
            if not is_emission_relevant_swap(alt):
                co2_kg = 0
        else:
            pm25_pct = min(MAX_PM25_REDUCTION_PCT, max(1, alt.pm25_reduction_pct))
            co2_kg = min(250, max(0, alt.co2_saved_kg_per_month)) if is_emission_relevant_swap(alt) else 0
        while pm25_pct in used_pm and pm25_pct < MAX_PM25_REDUCTION_PCT:
            pm25_pct += 1
        used_pm.add(pm25_pct)
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
