"""Deterministic safety layer for CPCB AQI tiers, medical boundaries, and prompt injection."""

from __future__ import annotations

import re

from app.schemas import LanguageCode, PlanResponse, UserProfile, strip_control_chars
from app.services.cpcb import get_aqi_category

_EMERGENCY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(chest pain|severe breathless\w*|can'?t breathe|cannot breathe|blue lips|bluish lips|fainting|fainted|unconscious|gasping)\b",
        re.IGNORECASE,
    ),
    re.compile(r"(सीने में तेज दर्द|बेहोश|नीले होंठ|गंभीर सांस|सांस नहीं आ)"),
)

_SYMPTOM_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(cough|coughing|wheez\w*|breathless\w*|asthma attack|chest tight\w*|shortness of breath|inhaler|throat hurt|sore throat|dizzy)\b",
        re.IGNORECASE,
    ),
    re.compile(r"(खांसी|सांस फूल|घरघराहट|दमा|सीने में|डॉक्टर|चक्कर)"),
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
    return bool(
        profile.has_children or profile.has_elderly or profile.has_respiratory_condition
    )


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


def build_health_advisory(profile: UserProfile, aqi: int) -> str:
    """Composes a grammatically clean health advisory by CPCB tier and vulnerability flags."""
    is_hi = profile.language == "hi"
    cat = get_aqi_category(aqi)
    sentences: list[str] = []

    if aqi >= 401:
        sentences.append(
            f"वायु गुणवत्ता गंभीर स्तर ({cat.label_hi}, AQI {aqi}) पर है, जो स्वस्थ लोगों और संवेदनशील वर्गों दोनों को प्रभावित करती है।"
            if is_hi
            else f"Air quality is Severe (AQI {aqi}), which affects healthy adults and poses serious risk to sensitive groups."
        )
    elif aqi >= 301:
        sentences.append(
            f"वायु गुणवत्ता बहुत खराब ({cat.label_hi}, AQI {aqi}) है, जिससे लंबे समय तक बाहर रहने पर श्वसन दबाव बढ़ सकता है।"
            if is_hi
            else f"Air quality is Very Poor (AQI {aqi}), increasing the risk of airway irritation and respiratory strain on prolonged exposure."
        )
    elif aqi >= 201:
        sentences.append(
            f"वायु गुणवत्ता खराब ({cat.label_hi}, AQI {aqi}) है; आज सभी के लिए बाहरी व्यायाम से बचना आवश्यक है।"
            if is_hi
            else f"Air quality is Poor (AQI {aqi}); everyone should avoid prolonged outdoor exertion today."
        )
    elif aqi >= 101:
        sentences.append(
            f"वायु गुणवत्ता मध्यम ({cat.label_hi}, AQI {aqi}) है; संवेदनशील लोगों को अतिरिक्त सावधानी बरतनी चाहिए।"
            if is_hi
            else f"Air quality is Moderate (AQI {aqi}), which can trigger breathing discomfort for sensitive households."
        )
    else:
        sentences.append(
            f"वायु गुणवत्ता {cat.label_hi} (AQI {aqi}) है और अधिकांश लोगों के लिए सामान्य दैनिक गतिविधियां आरामदायक हैं।"
            if is_hi
            else f"Air quality is {cat.label_en} (AQI {aqi}), making normal daily routines comfortable for most people."
        )

    if profile.has_children:
        if aqi >= 201:
            sentences.append(
                "बच्चों के लिए: आज सुबह और शाम के बाहरी खेल रद्द करें और सभी खेलकूद घर के अंदर रखें।"
                if is_hi
                else "For children: Keep playtime and school sports indoors today because young lungs absorb a higher PM2.5 dose per breath."
            )
        elif aqi >= 101:
            sentences.append(
                "बच्चों के लिए: भारी दौड़-भाग से बचें और केवल दोपहर 1–4 बजे की स्वच्छ अवधि में हल्की गतिविधि चुनें।"
                if is_hi
                else "For children: Limit vigorous outdoor play and keep brief outdoor breaks to the cleaner 1–4 PM window away from busy roads."
            )
        else:
            sentences.append(
                "बच्चों के लिए: सड़क से दूर पार्कों में सामान्य बाहरी खेल सुरक्षित है।"
                if is_hi
                else "For children: Regular outdoor play in parks away from heavy traffic is fine today."
            )

    if profile.has_elderly:
        if aqi >= 201:
            sentences.append(
                "बुजुर्ग सदस्यों (60+) के लिए: सुबह की सैर टालें, घर के अंदर साफ हवा वाले कमरे में रहें और पर्याप्त पानी पिएं।"
                if is_hi
                else "For older adults (60+): Skip morning and evening walks, stay in a well-sealed indoor room, and stay well hydrated."
            )
        elif aqi >= 101:
            sentences.append(
                "बुजुर्ग सदस्यों (60+) के लिए: सैर को दोपहर की धूप वाले समय तक सीमित रखें और मुख्य ट्रैफ़िक से दूर रहें।"
                if is_hi
                else "For older adults (60+): Shift gentle walks to the midday daylight window and pause immediately if any fatigue or shortness of breath occurs."
            )
        else:
            sentences.append(
                "बुजुर्ग सदस्यों (60+) के लिए: हल्की सैर सामान्य रूप से सुरक्षित है, पर भारी ट्रैफ़िक क्षेत्रों से बचें।"
                if is_hi
                else "For older adults (60+): Routine walks are comfortable today, though avoiding busy intersections remains helpful."
            )

    if profile.has_respiratory_condition:
        if aqi >= 101:
            sentences.append(
                "दमा या श्वसन संवेदनशीलता के लिए: डॉक्टर द्वारा दी गई रिलीवर दवा या इन्हेलर हमेशा पास रखें, घर के अंदर की हवा साफ रखें, और बाहर जाना अनिवार्य हो तो फिटेड N95/FFP2 मास्क पहनें।"
                if is_hi
                else "For asthma or respiratory sensitivity: Keep prescribed reliever inhalers within reach, prioritize clean indoor air, and wear a properly fitted N95/FFP2 mask for any unavoidable outdoor trip."
            )
        else:
            sentences.append(
                "दमा या श्वसन संवेदनशीलता के लिए: अपना निर्धारित इन्हेलर साथ रखें और धूल या धुएं वाले इलाकों से दूर रहें।"
                if is_hi
                else "For asthma or respiratory sensitivity: Keep prescribed medication handy and steer clear of localized smoke or construction dust."
            )

    sentences.append(
        "यह सामान्य जानकारी है, चिकित्सीय सलाह नहीं—खांसी, घरघराहट या सांस फूलने पर तुरंत डॉक्टर से परामर्श करें।"
        if is_hi
        else "This guidance is not medical advice; consult a qualified doctor promptly if coughing, wheezing, or breathlessness develops."
    )
    return " ".join(sentences)


def build_mask_guidance(profile: UserProfile, aqi: int) -> str:
    """Generates deterministic tiered mask and outdoor-activity guidance."""
    is_hi = profile.language == "hi"
    vulnerable = is_vulnerable_household(profile)

    if aqi >= 201:
        lead = (
            f"AQI {aqi} पर सभी के लिए बाहरी व्यायाम, दौड़ और लंबे समय तक बाहर रहने से पूरी तरह बचें।"
            if is_hi
            else f"At AQI {aqi}, avoid outdoor exertion and prolonged outdoor exercise entirely for everyone."
        )
        detail = (
            (
                "बच्चों, बुजुर्गों और श्वसन संवेदनशील सदस्यों को घर के अंदर साफ हवा वाले कमरे में रखें। यदि बाहर निकलना अनिवार्य हो तो दोपहर 1–4 बजे का समय चुनें और बिना वाल्व वाला फिटेड N95/FFP2 मास्क पहनें।"
                if is_hi
                else "Keep children, older adults, and anyone with respiratory sensitivity indoors in clean air. For essential trips only, prefer the 1–4 PM window and wear a snugly fitted N95/FFP2 respirator (cloth and loose surgical masks do not block PM2.5)."
            )
            if vulnerable
            else (
                "ऑफिस यात्रा या आवश्यक काम के लिए बाहर निकलते हर बार नाक की क्लिप दबाकर फिटेड N95/FFP2 मास्क पहनें—कपड़े या सर्जिकल मास्क PM2.5 नहीं रोकते।"
                if is_hi
                else "Wear a snugly sealed N95 or FFP2 respirator for every commute or essential errand—cloth and loose surgical masks let fine PM2.5 leak past the edges."
            )
        )
        tail = (
            "यह चिकित्सीय सलाह नहीं है; श्वसन लक्षणों के लिए डॉक्टर से मिलें।"
            if is_hi
            else "Not medical advice; consult a doctor if you have a respiratory or cardiac condition."
        )
        return f"{lead} {detail} {tail}"

    if aqi >= 101 and vulnerable:
        return (
            f"AQI {aqi} (मध्यम) पर चूंकि आपके परिवार में संवेदनशील सदस्य हैं, इसलिए बाहरी गतिविधि को सीमित रखें और भारी या मध्यम व्यायाम घर के अंदर करें। आवश्यक बाहर निकलने के लिए सबसे स्वच्छ दोपहर (1–4 बजे) का समय चुनें, फिटेड N95/FFP2 मास्क पहनें और घर के अंदर की हवा साफ रखें। यह चिकित्सीय सलाह नहीं है; आवश्यकता होने पर डॉक्टर से परामर्श लें।"
            if is_hi
            else f"At AQI {aqi} (Moderate), because your household includes sensitive members, limit outdoor activity and move workouts indoors. Prefer the cleanest daylight window (1–4 PM), wear a fitted N95/FFP2 mask for essential trips near traffic, and keep indoor air clean. Not medical advice; consult a doctor for personalized guidance."
        )

    if aqi >= 101:
        return (
            f"AQI {aqi} (मध्यम) पर भारी बाहरी व्यायाम को कम रखें और व्यस्त सड़कों के बजाय दोपहर 1–4 बजे का समय चुनें। ट्रैफ़िक कम्यूट या निर्माण धूल के पास फिटेड N95/FFP2 मास्क पहनना सुरक्षित रहता है। यह चिकित्सीय सलाह नहीं है।"
            if is_hi
            else f"At AQI {aqi} (Moderate), keep prolonged outdoor exertion light and shift workouts to the 1–4 PM window away from busy roads. Wearing a fitted N95/FFP2 mask during heavy-traffic commutes or near construction dust is recommended. Not medical advice."
        )

    if vulnerable:
        return (
            f"AQI {aqi} पर संवेदनशील सदस्यों के लिए मुख्य सड़कों से दूर हल्की बाहरी गतिविधि आमतौर पर आरामदायक है। भारी ट्रैफ़िक के पास N95 मास्क साथ रखें और कोई लक्षण महसूस होने पर डॉक्टर से परामर्श लें।"
            if is_hi
            else f"At AQI {aqi}, gentle outdoor activity away from busy roads is generally comfortable for sensitive household members. Keep an N95 handy near heavy traffic and consult a doctor if any symptoms appear."
        )

    return (
        f"AQI {aqi} पर सामान्य बाहरी गतिविधि और व्यायाम सुरक्षित हैं। मास्क वैकल्पिक है, हालांकि भारी ट्रैफ़िक या धूल भरे क्षेत्रों में N95 उपयोगी रहता है। यह चिकित्सीय सलाह नहीं है।"
        if is_hi
        else f"At AQI {aqi}, normal outdoor activity and exercise are fine. Masks are optional for routine trips, though wearing an N95 near heavy traffic or construction dust remains helpful. Not medical advice."
    )


def has_unsafe_phrases(text: str, profile: UserProfile, aqi: int) -> bool:
    """Checks whether LLM text violates medical or AQI safety boundaries."""
    if any(pat.search(text) for pat in _MEDICAL_DOSING_OR_DIAGNOSIS_PATTERNS):
        return True
    if any(pat.search(text) for pat in _SECRET_LEAK_PATTERNS):
        return True
    return bool(
        (aqi >= 201 or (aqi >= 101 and is_vulnerable_household(profile)))
        and any(pat.search(text) for pat in _UNSAFE_OUTDOOR_HIGH_AQI_PATTERNS)
    )


def enforce_plan_safety(plan: PlanResponse, profile: UserProfile) -> PlanResponse:
    """Post-validates Gemini plan text against deterministic safety rules."""
    aqi_val = plan.aqi.aqi
    det_advisory = build_health_advisory(profile, aqi_val)
    det_mask = build_mask_guidance(profile, aqi_val)
    det_disclaimer = build_disclaimer(profile.language)

    advisory = plan.health_advisory.strip()
    if (
        not advisory
        or has_unsafe_phrases(advisory, profile, aqi_val)
        or (
            aqi_val >= 201
            and "avoid" not in advisory.lower()
            and "बचें" not in advisory
            and "टालें" not in advisory
        )
    ):
        advisory = det_advisory

    mask_guidance = plan.mask_guidance.strip()
    if (
        not mask_guidance
        or has_unsafe_phrases(mask_guidance, profile, aqi_val)
        or (
            aqi_val >= 101
            and "n95" not in mask_guidance.lower()
            and "ffp2" not in mask_guidance.lower()
        )
    ):
        mask_guidance = det_mask

    summary = plan.summary.strip()
    if has_unsafe_phrases(summary, profile, aqi_val):
        summary = det_advisory.split(".")[0] + "."

    return plan.model_copy(
        update={
            "summary": summary,
            "health_advisory": advisory,
            "mask_guidance": mask_guidance,
            "disclaimer": det_disclaimer,
        }
    )


def sanitize_untrusted_question(raw: str) -> str:
    """Strips control chars and angle brackets so user text stays safely inside XML tags."""
    cleaned = strip_control_chars(raw)
    return cleaned.replace("<", "(").replace(">", ")")


def detect_emergency_symptoms(question: str) -> bool:
    """Returns True if question mentions emergency respiratory/cardiac symptoms."""
    return any(pat.search(question) for pat in _EMERGENCY_PATTERNS)


def detect_prompt_injection(question: str) -> bool:
    """Returns True if user input attempts instruction override or secret exfiltration."""
    return any(pat.search(question) for pat in _INJECTION_PATTERNS)


def build_injection_refusal(language: LanguageCode) -> str:
    """Returns a safe refusal when prompt injection or instruction override is attempted."""
    if language == "hi":
        return (
            "मैं केवल वायु गुणवत्ता, सर्दियों के स्मॉग, घर की हवा, मास्क और कम-उत्सर्जन आदतों से जुड़े "
            "सवालों में मदद कर सकता हूँ। कृपया अपने शहर या घर की हवा के बारे में पूछें।"
        )
    return (
        "I can only help with urban air quality, winter smog, indoor air protection, masks, and "
        "low-emission household habits. Please ask an air-quality question for your household."
    )


def build_emergency_care_reply(language: LanguageCode, city: str, aqi: int) -> str:
    """Returns urgent medical care guidance for severe respiratory/cardiac symptoms."""
    if language == "hi":
        return (
            f"आपातकालीन स्वास्थ्य सलाह: सीने में तेज दर्द, गंभीर सांस फूलना, बेहोशी या नीले होंठ दिखने पर "
            f"तुरंत नजदीकी आपातकालीन अस्पताल जाएं या 108 पर कॉल करें। सांस चिकित्सीय सेवा का विकल्प नहीं है। "
            f"मदद मिलने तक {city} (AQI {aqi}) में शांत रहें और खिड़कियां बंद रखें।"
        )
    return (
        f"Urgent health guidance: Severe breathlessness, chest pain, bluish lips, or fainting requires "
        f"immediate emergency medical care—call 108/emergency services or visit the nearest ER right away. "
        f"Saans is not medical care. Stay indoors with windows shut in {city} (AQI {aqi}) while seeking help."
    )


def sanitize_chat_reply(answer: str, question: str, profile: UserProfile, aqi: int) -> str:
    """Post-validates LLM chat output against injection leaks, unsafe claims, and emergencies."""
    cleaned = strip_control_chars(answer)
    if detect_emergency_symptoms(question) and (
        "emergency" not in cleaned.lower() and "108" not in cleaned and "आपातकाल" not in cleaned
    ):
        return build_emergency_care_reply(profile.language, profile.city, aqi)

    if detect_prompt_injection(question) or any(p.search(cleaned) for p in _SECRET_LEAK_PATTERNS):
        return build_injection_refusal(profile.language)

    if has_unsafe_phrases(cleaned, profile, aqi):
        return build_mask_guidance(profile, aqi)

    # Enforce ~120-word conciseness bound on LLM replies
    words = cleaned.split()
    if len(words) > 140:
        cleaned = " ".join(words[:120]).rstrip(",;:") + "."

    return cleaned
