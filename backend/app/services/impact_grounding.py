"""Profile grounding facts and LLM swap-number clamping helpers."""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas import Alternative, UserProfile

_EMISSION_KEYWORDS = (
    "metro", "bus", "transit", "carpool", "ride", "ev ", "electric scooter",
    "electric vehicle", "puc", "induction", "lpg", "piped gas", "png", "chulha",
    "biomass", "wood", "leaf", "leaves", "waste", "compost", "bonfire",
    "firecracker", "दीये", "खाद", "कचरा", "पत्त", "पराली", "मेट्रो", "कारपूल",
    "इंडक्शन", "एलपीजी",
)

_NON_EMISSION_OVERRIDE_KEYWORDS = (
    "window", "ventilat", "mask", "n95", "ffp2", "purifier", "hepa",
    "box fan", "mop", "sweep", "incense", "agarbatti", "dhoop", "coil",
    "weather-strip", "seal", "draft stopper", "plant", "exhaust fan",
    "खिड़क", "मास्क", "प्यूरीफायर", "पोंछा", "अगरबत्ती", "पौध",
)


@dataclass(frozen=True)
class ProfileFacts:
    """Deterministic facts passed to Gemini and fallback generators."""

    already_doing: list[str]
    recommended_actions: list[str]
    swap_targets: list[tuple[str, int, int]]
    vulnerabilities: list[str]


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
    combined = f"{alt.current} {alt.swap} {alt.why}".lower()
    if any(kw in combined for kw in _EMISSION_KEYWORDS):
        return True
    return not any(kw in combined for kw in _NON_EMISSION_OVERRIDE_KEYWORDS) and False
