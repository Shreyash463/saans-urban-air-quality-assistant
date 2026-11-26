"""Regex patterns, vulnerability helpers, and deterministic input/output safety detectors."""

from __future__ import annotations

import re

from app.schemas import LanguageCode, UserProfile, strip_control_chars

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


def is_vulnerable_household(profile: UserProfile) -> bool:
    """Returns True if household includes children, elderly, or respiratory sensitivity."""
    return bool(profile.has_children or profile.has_elderly or profile.has_respiratory_condition)


def build_disclaimer(language: LanguageCode) -> str:
    """Returns the authoritative non-medical disclaimer in the user's language."""
    if language == "hi":
        return (
            "अस्वीकरण: यह मार्गदर्शन सामान्य सूचना के लिए है और चिकित्सीय सलाह नहीं है। "
            "दमा, हृदय रोग या गंभीर सांस के लक्षणों के लिए योग्य डॉक्टर से परामर्श करें।"
        )
    return (
        "Not medical advice. This plan offers general environmental and low-emission lifestyle guidance. "
        "Always consult a qualified physician for asthma, COPD, cardiovascular conditions, or acute respiratory symptoms."
    )


def has_secret_leak(text: str) -> bool:
    """Returns True if text contains API key material or prompt boundary leakage."""
    return any(pat.search(text) for pat in _SECRET_LEAK_PATTERNS)


def has_unsafe_phrases(text: str, profile: UserProfile, aqi: int) -> bool:
    """Checks whether LLM text violates medical or AQI safety boundaries."""
    if any(pat.search(text) for pat in _MEDICAL_DOSING_OR_DIAGNOSIS_PATTERNS):
        return True
    if has_secret_leak(text):
        return True
    return bool(
        (aqi >= 201 or (aqi >= 101 and is_vulnerable_household(profile)))
        and any(pat.search(text) for pat in _UNSAFE_OUTDOOR_HIGH_AQI_PATTERNS)
    )


def sanitize_untrusted_question(raw: str) -> str:
    """Strips control chars and angle brackets so user text stays safely inside XML tags."""
    return strip_control_chars(raw).replace("<", "(").replace(">", ")")


def detect_emergency_symptoms(question: str) -> bool:
    """Returns True if question mentions emergency respiratory/cardiac symptoms."""
    return any(pat.search(question) for pat in _EMERGENCY_PATTERNS)


def detect_prompt_injection(question: str) -> bool:
    """Returns True if user input attempts instruction override or secret exfiltration."""
    return any(pat.search(question) for pat in _INJECTION_PATTERNS)
