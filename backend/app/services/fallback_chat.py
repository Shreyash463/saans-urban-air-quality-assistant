"""Intent classification and rule-based fallback responder for follow-up chat."""

from __future__ import annotations

import re
from typing import Any

from app.data import load_copy_data
from app.schemas import ChatReply, PlanResponse, UserProfile
from app.services.cpcb import get_aqi_category
from app.services.safety import (
    build_emergency_care_reply,
    build_injection_refusal,
    detect_emergency_symptoms,
    detect_prompt_injection,
    is_vulnerable_household,
    sanitize_untrusted_question,
)

_CHAT_INTENT_RULES: tuple[tuple[str, tuple[re.Pattern[str], ...]], ...] = (
    (
        "greeting",
        (
            re.compile(
                r"^(?:hi+|hello+|hey+|namaste|namaskar|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you)[\s!.,?]*$",
                re.IGNORECASE,
            ),
            re.compile(r"^(?:नमस्ते|नमस्कार|हैलो|धन्यवाद|शुक्रिया)[\s!।.,?]*$"),
        ),
    ),
    (
        "symptoms",
        (
            re.compile(
                r"\b(cough|coughing|wheez\w*|breathless\w*|asthma attack|chest tight|chest pain|shortness of breath|inhaler|throat hurt|sore throat|dizzy|sick)\b",
                re.IGNORECASE,
            ),
            re.compile(r"(खांसी|सांस फूल|घरघराहट|दमा|सीने में|डॉक्टर|चक्कर)"),
        ),
    ),
    (
        "plants",
        (
            re.compile(r"\b(plant|plants|areca|snake plant|money plant|peace lily|aloe)\b", re.IGNORECASE),
            re.compile(r"(पौध|अरेका|स्नेक प्लांट)"),
        ),
    ),
    (
        "mask",
        (
            re.compile(r"\b(mask|masks|n95|n99|ffp2|kn95|surgical|cloth mask|respirator)\b", re.IGNORECASE),
            re.compile(r"(मास्क|एन95)"),
        ),
    ),
    (
        "purifier_diy",
        (
            re.compile(r"\b(purifier|hepa|cadr|corsi|box fan|diy filter|ionizer|filter)\b", re.IGNORECASE),
            re.compile(r"(प्यूरीफायर|फ़िल्टर|फिल्टर|बॉक्स फैन)"),
        ),
    ),
    (
        "outdoor_play",
        (
            re.compile(
                r"\b(kid|kids|child|children|play|playground|school|walk|walking|running|jog|jogging|morning run|outdoor run|exercise|safe to go out|go outside|outdoor)\b",
                re.IGNORECASE,
            ),
            re.compile(r"(बच्च|खेल|बाहर जाना|व्यायाम|स्कूल|सैर)"),
        ),
    ),
    (
        "cheapest_indoor",
        (
            re.compile(r"\b(cheap|cheapest|free|low cost|budget|affordable|save money|indoor air|improve indoor)\b", re.IGNORECASE),
            re.compile(r"(सस्त|मुफ्त|कम खर्च|बजट|घर की हवा)"),
        ),
    ),
    (
        "cooking",
        (
            re.compile(r"\b(cook|cooking|kitchen|lpg|induction|gas|biomass|wood|chulha|tadka|chimney|exhaust|smoke)\b", re.IGNORECASE),
            re.compile(r"(रसोई|खाना|गैस|इंडक्शन|चूल्हा|लकड़ी|तड़का)"),
        ),
    ),
    (
        "commute",
        (
            re.compile(r"\b(commute|car|metro|bus|bike|scooter|two wheeler|traffic|carpool|drive|office)\b", re.IGNORECASE),
            re.compile(r"(यात्रा|कार|मेट्रो|बस|बाइक|स्कूटर|ट्रैफ़िक|कारपूल)"),
        ),
    ),
    (
        "ventilation",
        (
            re.compile(r"\b(window|windows|ventilat\w*|open door|fresh air|morning air|afternoon|inversion|seal|draft)\b", re.IGNORECASE),
            re.compile(r"(खिड़क|दरवाज़|वेंटिलेशन|ताज़ी हवा|सुबह|दोपहर)"),
        ),
    ),
)

_OFF_TOPIC_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(python|javascript|sql|bitcoin|stock market|movie|cricket score|football|recipe for cake|homework|essay|poem|translate this|write code|who won)\b",
        re.IGNORECASE,
    ),
)


def _chat_copy() -> dict[str, Any]:
    return dict(load_copy_data("fallback_copy.json")["chatReplies"])


def detect_fallback_chat_intent(question: str) -> str:
    """Classifies user question for the rule-based fallback responder."""
    for intent, patterns in _CHAT_INTENT_RULES:
        if any(pat.search(question) for pat in patterns):
            return intent
    if any(pat.search(question) for pat in _OFF_TOPIC_PATTERNS):
        return "off_topic"
    return "fallback"


def _outdoor_play_key(profile: UserProfile, aqi: int, _replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    if aqi >= 201:
        return "outdoorPlayHigh", {}
    if aqi >= 101 and is_vulnerable_household(profile):
        return "outdoorPlaySensitive", {}
    return "outdoorPlayNormal", {}


def _mask_key(profile: UserProfile, _aqi: int, replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    extra_key = "maskChildExtra" if profile.has_children else "maskAdultExtra"
    return "mask", {"extra": str(replies[extra_key][profile.language])}


def _purifier_key(profile: UserProfile, _aqi: int, _replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    return ("purifierOwner" if profile.has_air_purifier else "purifierBuy"), {}


def _cooking_key(profile: UserProfile, _aqi: int, _replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    return ("cookingBiomass" if profile.cooking_fuel == "biomass_wood" else "cookingClean"), {}


def _commute_key(profile: UserProfile, _aqi: int, _replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    mode_map = {"work_from_home": "commuteWfh", "car": "commuteCar"}
    return mode_map.get(profile.commute_mode, "commuteTransit"), {}


_INTENT_KEY_RESOLVERS = {
    "outdoor_play": _outdoor_play_key,
    "mask": _mask_key,
    "purifier_diy": _purifier_key,
    "cooking": _cooking_key,
    "commute": _commute_key,
}


def _resolve_reply_key(intent: str, profile: UserProfile, aqi: int, replies: dict[str, Any]) -> tuple[str, dict[str, object]]:
    resolver = _INTENT_KEY_RESOLVERS.get(intent)
    if resolver is not None:
        return resolver(profile, aqi, replies)
    return (intent if intent in replies else "fallback"), {}


def generate_fallback_chat_reply(question: str, profile: UserProfile, plan: PlanResponse) -> ChatReply:
    """Deterministic profile- and AQI-aware fallback chat responder."""
    safe_q = sanitize_untrusted_question(question)
    city, aqi = plan.aqi.city, plan.aqi.aqi
    lang = profile.language
    if detect_emergency_symptoms(safe_q):
        return ChatReply(answer=build_emergency_care_reply(lang, city, aqi))
    if detect_prompt_injection(safe_q):
        return ChatReply(answer=build_injection_refusal(lang))
    intent = detect_fallback_chat_intent(safe_q)
    if intent == "off_topic":
        return ChatReply(answer=build_injection_refusal(lang))

    replies = _chat_copy()
    if plan.aqi.source == "demo":
        return ChatReply(answer=str(replies["demo"][lang]).format(city=city))

    cat = get_aqi_category(aqi)
    reply_key, extra_fmt = _resolve_reply_key(intent, profile, aqi, replies)
    template = str(replies[reply_key][lang])
    answer = template.format(
        city=city,
        aqi=aqi,
        category=cat.label_hi if lang == "hi" else cat.label_en,
        snippet=safe_q[:90],
        budget=profile.budget,
        commuteKm=profile.commute_km,
        **extra_fmt,
    )
    return ChatReply(answer=answer)
