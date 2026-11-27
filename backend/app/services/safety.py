"""Deterministic safety layer for CPCB AQI tiers, medical boundaries, and prompt injection."""

from __future__ import annotations

import re
from typing import Any

from app.data import load_copy_data
from app.schemas import LanguageCode, PlanResponse, UserProfile, strip_control_chars
from app.services.cpcb import get_aqi_category

_EMERGENCY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(chest pain|severe breathless\w*|can'?t breathe|cannot breathe|blue lips|bluish lips|fainting|fainted|unconscious|gasping)\b",
        re.IGNORECASE,
    ),
    re.compile(r"(सीने में तेज दर्द|बेहोश|नीले होंठ|गंभीर सांस|सांस नहीं आ)"),
)

_UNSAFE_OUTDOOR_HIGH_AQI_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(outdoor exercise is safe|moderate outdoor exercise is safe|safe for outdoor exercise|safe to (?:jog|run|exercise|play) outdoors?|no mask needed|masks? (?:are|is) unnecessary|बाहरी व्यायाम सुरक्षित|बाहर खेलना सुरक्षित|मास्क की जरूरत नहीं)\b",
        re.IGNORECASE,
    ),
)

_MEDICAL_DOSING_OR_DIAGNOSIS_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(\d+\s*(?:mg|mcg|ml|puffs?|tablets?)|take\s+(?:ibuprofen|paracetamol|cetirizine|albuterol|salbutamol|steroids?)|you have asthma|diagnos(?:e|is)|prescribe)\b",
        re.IGNORECASE,
    ),
)

_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(ignore (?:all |any )?(?:previous|prior|above) instructions|disregard (?:your )?instructions|reveal (?:your )?(?:system prompt|instructions|api key)|print (?:your )?(?:env|environment|secrets?|gemini_api_key)|you are now |act as |roleplay\b.*\b(?:admin|developer|system)|(?:hidden|developer|system)\s+(?:rules|instructions)\b|summarize\s+(?:the\s+|your\s+)?(?:hidden\s+|developer\s+|system\s+)?(?:rules|instructions|prompt)|jailbreak|system_instruction|<user_question>)",
        re.IGNORECASE,
    ),
)

_SECRET_LEAK_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"\b(GEMINI_API_KEY|system_instruction|system prompt|</?user_question>)\b", re.IGNORECASE),
)


def _safety_copy() -> dict[str, Any]:
    return load_copy_data("safety_copy.json")


def _pick_tier_text(tiers: list[dict[str, Any]], lang: LanguageCode, aqi_val: int, **fmt: object) -> str:
    for tier in tiers:
        if aqi_val >= int(tier["minAqi"]):
            return str(tier[lang]).format(**fmt)
    return str(tiers[-1][lang]).format(**fmt)


def is_vulnerable_household(profile: UserProfile) -> bool:
    return bool(profile.has_children or profile.has_elderly or profile.has_respiratory_condition)


def build_disclaimer(language: LanguageCode) -> str:
    return str(_safety_copy()["disclaimer"][language])


def has_secret_leak(text: str) -> bool:
    return any(pat.search(text) for pat in _SECRET_LEAK_PATTERNS)


def has_unsafe_phrases(text: str, profile: UserProfile, aqi: int) -> bool:
    """Checks whether LLM text violates medical boundaries or high-AQI outdoor guidance."""
    if any(pat.search(text) for pat in _MEDICAL_DOSING_OR_DIAGNOSIS_PATTERNS) or has_secret_leak(text):
        return True
    return bool(
        (aqi >= 201 or (aqi >= 101 and is_vulnerable_household(profile)))
        and any(pat.search(text) for pat in _UNSAFE_OUTDOOR_HIGH_AQI_PATTERNS)
    )


def sanitize_untrusted_question(raw: str) -> str:
    """Strips control chars and angle brackets so user input cannot spoof XML prompt delimiters."""
    return strip_control_chars(raw).replace("<", "(").replace(">", ")")


def detect_emergency_symptoms(question: str) -> bool:
    return any(pat.search(question) for pat in _EMERGENCY_PATTERNS)


def detect_prompt_injection(question: str) -> bool:
    return any(pat.search(question) for pat in _INJECTION_PATTERNS)


def build_health_advisory(profile: UserProfile, aqi: int) -> str:
    copy = _safety_copy()
    lang = profile.language
    cat = get_aqi_category(aqi)
    cat_label = cat.label_hi if lang == "hi" else cat.label_en
    sentences: list[str] = [_pick_tier_text(copy["tiers"], lang, aqi, aqi=aqi, label=cat_label)]
    if profile.has_children:
        sentences.append(_pick_tier_text(copy["children"], lang, aqi))
    if profile.has_elderly:
        sentences.append(_pick_tier_text(copy["elderly"], lang, aqi))
    if profile.has_respiratory_condition:
        sentences.append(_pick_tier_text(copy["respiratory"], lang, aqi))
    sentences.append(str(copy["advisoryNote"][lang]))
    return " ".join(sentences)


def build_mask_guidance(profile: UserProfile, aqi: int) -> str:
    mask_copy = _safety_copy()["maskGuidance"]
    lang = profile.language
    vulnerable = is_vulnerable_household(profile)
    if aqi >= 201:
        lead = str(mask_copy["highLead"][lang]).format(aqi=aqi)
        detail = str(mask_copy["highVulnerable" if vulnerable else "highGeneral"][lang])
        tail = str(mask_copy["highTail"][lang])
        return f"{lead} {detail} {tail}"
    tier_prefix = "moderate" if aqi >= 101 else "low"
    key = f"{tier_prefix}{'Vulnerable' if vulnerable else 'General'}"
    return str(mask_copy[key][lang]).format(aqi=aqi)


def _needs_advisory_override(advisory: str, profile: UserProfile, aqi_val: int) -> bool:
    if not advisory or has_unsafe_phrases(advisory, profile, aqi_val):
        return True
    return aqi_val >= 201 and "avoid" not in advisory.lower() and "बचें" not in advisory and "टालें" not in advisory


def _needs_mask_override(mask_guidance: str, profile: UserProfile, aqi_val: int) -> bool:
    if not mask_guidance or has_unsafe_phrases(mask_guidance, profile, aqi_val):
        return True
    return aqi_val >= 101 and "n95" not in mask_guidance.lower() and "ffp2" not in mask_guidance.lower()


def enforce_plan_safety(plan: PlanResponse, profile: UserProfile) -> PlanResponse:
    """Replaces LLM text sections if any claim violates CPCB AQI or medical guardrails."""
    aqi_val = plan.aqi.aqi
    det_advisory = build_health_advisory(profile, aqi_val)
    raw_adv = plan.health_advisory.strip()
    advisory = det_advisory if _needs_advisory_override(raw_adv, profile, aqi_val) else raw_adv
    mask_raw = plan.mask_guidance.strip()
    mask_guidance = build_mask_guidance(profile, aqi_val) if _needs_mask_override(mask_raw, profile, aqi_val) else mask_raw
    summary = plan.summary.strip()
    if has_unsafe_phrases(summary, profile, aqi_val):
        summary = det_advisory.split(".")[0] + "."
    return plan.model_copy(
        update={
            "summary": summary,
            "health_advisory": advisory,
            "mask_guidance": mask_guidance,
            "disclaimer": build_disclaimer(profile.language),
        }
    )


def build_injection_refusal(language: LanguageCode) -> str:
    return str(_safety_copy()["injectionRefusal"][language])


def build_emergency_care_reply(language: LanguageCode, city: str, aqi: int) -> str:
    return str(_safety_copy()["emergencyCare"][language]).format(city=city, aqi=aqi)


def sanitize_chat_reply(answer: str, question: str, profile: UserProfile, aqi: int) -> str:
    """Post-validates LLM chat output against injection leaks, unsafe claims, and emergencies."""
    cleaned = strip_control_chars(answer)
    if detect_emergency_symptoms(question) and (
        "emergency" not in cleaned.lower() and "108" not in cleaned and "आपातकाल" not in cleaned
    ):
        return build_emergency_care_reply(profile.language, profile.city, aqi)
    if detect_prompt_injection(question) or has_secret_leak(cleaned):
        return build_injection_refusal(profile.language)
    if has_unsafe_phrases(cleaned, profile, aqi):
        return build_mask_guidance(profile, aqi)
    words = cleaned.split()
    return (" ".join(words[:120]).rstrip(",;:") + ".") if len(words) > 140 else cleaned
