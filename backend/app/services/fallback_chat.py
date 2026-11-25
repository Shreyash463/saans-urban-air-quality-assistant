"""Deterministic fallback chat intent classifier and responder."""

from __future__ import annotations

import re

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


def detect_fallback_chat_intent(question: str) -> str:
    """Classifies user question for the rule-based fallback responder."""
    for intent, patterns in _CHAT_INTENT_RULES:
        if any(pat.search(question) for pat in patterns):
            return intent
    if any(pat.search(question) for pat in _OFF_TOPIC_PATTERNS):
        return "off_topic"
    return "fallback"


def _reply_outdoor_play(is_hi: bool, city: str, aqi: int, cat_en: str, cat_hi: str, vulnerable: bool) -> str:
    if aqi >= 201:
        return (
            f"{city} में अभी AQI {aqi} ({cat_hi}) है। इस स्तर पर बच्चों का बाहर खेलना या किसी का भी बाहरी व्यायाम सुरक्षित नहीं है—खेलकूद घर के अंदर रखें। अनिवार्य बाहर निकलने पर दोपहर 1–4 बजे चुनें और फिटेड N95 पहनें।"
            if is_hi
            else f"At AQI {aqi} ({cat_en}) in {city}, outdoor play and exertion should be avoided for everyone—especially children and sensitive family members. Move play indoors today; for essential trips, prefer 1–4 PM with a fitted N95/FFP2 mask. (Not medical advice.)"
        )
    if aqi >= 101 and vulnerable:
        return (
            f"{city} में AQI {aqi} ({cat_hi}) है और आपके घर में संवेदनशील सदस्य हैं। भारी खेलकूद या दौड़ टालें; केवल दोपहर 1–4 बजे सड़क से दूर हल्की गतिविधि रखें और ट्रैफ़िक में N95 पहनें।"
            if is_hi
            else f"At AQI {aqi} ({cat_en}) in {city}, because your household includes sensitive members, skip vigorous outdoor play or running. Keep outdoor time brief and gentle between 1–4 PM away from busy roads, and use a fitted N95 near traffic. (Not medical advice.)"
        )
    return (
        f"{city} में AQI {aqi} ({cat_hi}) है। मुख्य सड़क से दूर पार्क में दोपहर के समय हल्का खेलना आरामदायक है, पर आंखों या गले में जलन लगे तो अंदर आ जाएं।"
        if is_hi
        else f"At AQI {aqi} ({cat_en}) in {city}, normal outdoor play and light exercise in parks away from busy roads are comfortable—especially in the afternoon. Head indoors if anyone notices throat or eye irritation."
    )


def _reply_for_intent(
    intent: str,
    safe_q: str,
    profile: UserProfile,
    city: str,
    aqi: int,
) -> str:
    is_hi = profile.language == "hi"
    cat = get_aqi_category(aqi)
    vulnerable = is_vulnerable_household(profile)

    if intent == "greeting":
        return (
            f"नमस्ते! {city} में अभी AQI {aqi} ({cat.label_hi}) है—मास्क, बच्चों के बाहर खेलने, वेंटिलेशन या घर की हवा के बारे में कुछ भी पूछें।"
            if is_hi
            else f"Hello! {city} is currently at AQI {aqi} ({cat.label_en})—ask me anything about masks, kids playing outside, ventilation windows, or indoor air hacks."
        )
    if intent == "symptoms":
        return (
            f"महत्वपूर्ण स्वास्थ्य नोट: यदि किसी को खांसी, घरघराहट, सीने में जकड़न या सांस लेने में दिक्कत है, तो तुरंत योग्य डॉक्टर से सलाह लें—सांस चिकित्सीय सलाह नहीं देता। अभी {city} (AQI {aqi}) में घर के अंदर रहें और निर्धारित दवा पास रखें।"
            if is_hi
            else f"Important health note: If anyone has coughing, wheezing, chest tightness, or breathlessness, please consult a qualified doctor promptly—Saans is not a substitute for medical care. Stay indoors in {city} (AQI {aqi}) with windows closed and prescribed medication handy."
        )
    if intent == "outdoor_play":
        return _reply_outdoor_play(is_hi, city, aqi, cat.label_en, cat.label_hi, vulnerable)
    if intent == "plants":
        return (
            "ईमानदार जवाब: स्नेक प्लांट या अरेका पाम अच्छे दिखते हैं, पर वास्तविक शहरी स्मॉग में वे कमरे का PM2.5 लगभग नहीं घटा पाते। असली असर के लिए पीक घंटों में खिड़कियां बंद रखें, गीला पोंछा लगाएं और True HEPA या DIY बॉक्स-फैन फ़िल्टर उपयोग करें।"
            if is_hi
            else f"Honest answer: Houseplants like snake plant and areca palm remove negligible PM2.5 during real urban smog—you would need hundreds per room to match one small filter. For real relief in {city} (AQI {aqi}), seal gaps during peak smog, wet-mop daily, and use a True HEPA or DIY box-fan filter."
        )
    if intent == "mask":
        extra = (
            "बच्चों के लिए सही छोटे साइज का किड्स KN95/N95 चुनें।"
            if (is_hi and profile.has_children)
            else "30–40 घंटे उपयोग के बाद मास्क बदल दें।"
            if is_hi
            else "use a properly sized child KN95/N95 for kids."
            if profile.has_children
            else "replace the respirator once straps loosen (roughly 30–40 hours of wear)."
        )
        return (
            f"{city} (AQI {aqi}) के लिए कपड़ा या ढीला सर्जिकल मास्क PM2.5 नहीं रोकता। बिना वाल्व वाला फिटेड N95/FFP2 मास्क पहनें, नाक की क्लिप दबाएं और {extra}"
            if is_hi
            else f"For {city} (AQI {aqi}, {cat.label_en}), cloth and loose surgical masks leak fine PM2.5. Choose an unvalved certified N95 or FFP2 respirator, press the nose clip snugly so glasses don't fog, and {extra}"
        )
    if intent == "purifier_diy":
        return _reply_purifier(is_hi, profile)
    if intent == "cheapest_indoor":
        return (
            f"{city} (AQI {aqi}) में सस्ते असरदार उपाय: (1) मुफ्त: सुबह 6–10 और शाम 6–10 खिड़कियां बंद रखें, दोपहर 1–4 बजे 20 मिनट खोलें। (2) मुफ्त: गीला पोंछा लगाएं और अगरबत्ती न जलाएं। (3) ~₹300: दरवाज़ों पर फोम टेप लगाएं। (4) ~₹1,500: DIY बॉक्स-फैन HEPA बनाएं।"
            if is_hi
            else f"The 4 cheapest high-impact indoor fixes for {city} (AQI {aqi}): (1) Free: shut windows 6–10 AM and 6–10 PM, cross-ventilate 20 min between 1–4 PM. (2) Free: wet-mop instead of dry sweeping and skip incense/coils. (3) ~₹300: add EPDM foam door seals. (4) ~₹1,500: build a DIY box-fan + HEPA cleaner."
        )
    if intent == "cooking":
        return _reply_cooking(is_hi, profile)
    if intent == "commute":
        return _reply_commute(is_hi, profile, city, aqi)
    if intent == "ventilation":
        return (
            "सर्दियों में सुबह 6–10 और शाम 6–10 बजे इनवर्ज़न के कारण प्रदूषण ज़मीन के पास फंसा रहता है—इन घंटों में खिड़कियां बंद रखें और दोपहर 1–4 बजे 15–20 मिनट विपरीत खिड़कियां खोलें।"
            if is_hi
            else "Winter thermal inversion traps smog low between 6–10 AM and 6–10 PM—keep windows shut then. Open opposite windows for 15–20 minutes between 1–4 PM when afternoon warmth lifts the smog layer."
        )
    snippet = safe_q[:90]
    return (
        f'आपके सवाल ("{snippet}") के लिए: {city} में वर्तमान AQI {aqi} ({cat.label_hi}) के अनुसार अपनी दिनचर्या और इनडोर उपाय देखें। आप बच्चों के बाहर खेलने, N95 मास्क, वेंटिलेशन समय या सस्ते घरेलू उपायों के बारे में भी पूछ सकते हैं।'
        if is_hi
        else f'About your question ("{snippet}"): for {city} at AQI {aqi} ({cat.label_en}), review your low-emission routine and indoor hacks above, or test swaps in the Impact Simulator. Feel free to ask specifically about kids playing outside, N95 masks, ventilation windows, cooking smoke, or budget indoor fixes.'
    )


def _reply_purifier(is_hi: bool, profile: UserProfile) -> str:
    if profile.has_air_purifier:
        return (
            "चूंकि आपके पास पहले से एयर प्यूरीफायर है: इसे दीवार से 30 सेमी दूर एक बंद बेडरूम में चलाएं, सोने से 30 मिनट पहले हाई मोड पर चलाएं और हर 14 दिन में प्री-फ़िल्टर साफ करें।"
            if is_hi
            else "Since you already own an air purifier: run it in one closed bedroom (not an open hall) 30 cm from walls, run on high 30 minutes before bed, and vacuum the mesh pre-filter every 2 weeks."
        )
    return (
        f"आपके {profile.budget} बजट के लिए: ₹1,200–₹2,000 के True HEPA फ़िल्टर को बॉक्स या टेबल फैन के पीछे कार्डबोर्ड और टेप से सील करके असरदार DIY बेडरूम प्यूरीफायर बनाया जा सकता है।"
        if is_hi
        else f"For your {profile.budget} budget: sealing a replacement True HEPA filter (₹1,200–₹2,000) onto the intake of a box or table fan with cardboard creates a high-value DIY bedroom cleaner. If buying retail, pick an ozone-free True HEPA H13 unit."
    )


def _reply_cooking(is_hi: bool, profile: UserProfile) -> str:
    if profile.cooking_fuel == "biomass_wood":
        return (
            "लकड़ी/बायोमास का धुआं बाहरी स्मॉग से भी अधिक PM2.5 पैदा करता है। खाना बनाते समय पूरी क्रॉस-वेंटिलेशन या खुली जगह चुनें और LPG/इंडक्शन पर शिफ्ट को प्राथमिकता दें।"
            if is_hi
            else "Indoor wood or biomass smoke creates far more PM2.5 than outdoor smog. Cook with maximum ventilation or outdoors under cover immediately, and prioritize transitioning to LPG or induction."
        )
    return (
        "तड़का या तलने के समय किचन एग्जॉस्ट फैन चलाएं, रसोई का दरवाज़ा बंद रखें और चाय/उबालने के लिए इलेक्ट्रिक केतली या इंडक्शन का उपयोग करें।"
        if is_hi
        else "Run your kitchen exhaust fan during tadka and frying with the kitchen door closed so smoke stays out of bedrooms, and use an electric kettle or induction burner for boiling water or tea."
    )


def _reply_commute(is_hi: bool, profile: UserProfile, city: str, aqi: int) -> str:
    if profile.commute_mode == "work_from_home":
        return (
            "आप पहले से घर से काम कर रहे हैं! बस शाम के ट्रैफ़िक पीक के बजाय ज़रूरी काम दोपहर 1–4 बजे एक साथ निपटाएं।"
            if is_hi
            else f"Working from home already avoids daily rush-hour exhaust. Simply batch outdoor errands into one 1–4 PM trip instead of peak evening smog in {city}."
        )
    if profile.commute_mode == "car":
        return (
            f"{city} (AQI {aqi}) में {profile.commute_km} किमी यात्रा के लिए कार AC रीसर्कुलेशन मोड पर रखें, PUC अपडेट रखें और सप्ताह में 3 दिन मेट्रो/कारपूल आज़माएं।"
            if is_hi
            else f"For your {profile.commute_km} km drive in {city} (AQI {aqi}), keep cabin AC on recirculation in traffic, stay current on PUC checks, and shift 3 days/week to metro or carpooling."
        )
    return (
        f"{city} (AQI {aqi}) में {profile.commute_km} किमी यात्रा के लिए मेट्रो/AC बस सबसे सुरक्षित हैं; पैदल या दोपहिया चरण में फिटेड N95 पहनें।"
        if is_hi
        else f"For your {profile.commute_km} km commute in {city} (AQI {aqi}), metro or AC buses cut roadside exposure; wear a fitted N95 during open-air walking or two-wheeler legs."
    )


def generate_fallback_chat_reply(
    question: str,
    profile: UserProfile,
    plan: PlanResponse,
) -> ChatReply:
    """Deterministic profile- and AQI-aware fallback chat responder."""
    safe_q = sanitize_untrusted_question(question)
    city = plan.aqi.city
    aqi = plan.aqi.aqi

    if detect_emergency_symptoms(safe_q):
        return ChatReply(answer=build_emergency_care_reply(profile.language, city, aqi))

    if detect_prompt_injection(safe_q):
        return ChatReply(answer=build_injection_refusal(profile.language))

    intent = detect_fallback_chat_intent(safe_q)
    if intent == "off_topic":
        return ChatReply(answer=build_injection_refusal(profile.language))

    return ChatReply(answer=_reply_for_intent(intent, safe_q, profile, city, aqi))
