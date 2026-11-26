"""Intent classification patterns for the deterministic fallback chat responder."""

from __future__ import annotations

import re

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


def detect_fallback_chat_intent(question: str) -> str:
    """Classifies user question for the rule-based fallback responder."""
    for intent, patterns in _CHAT_INTENT_RULES:
        if any(pat.search(question) for pat in patterns):
            return intent
    if any(pat.search(question) for pat in _OFF_TOPIC_PATTERNS):
        return "off_topic"
    return "fallback"
