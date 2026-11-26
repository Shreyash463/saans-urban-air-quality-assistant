"""Deterministic rule-based plan and community action fallback generators."""

from __future__ import annotations

from app.schemas import (
    AirQualityReading,
    Alternative,
    BudgetLevel,
    CommunityAction,
    IndoorHack,
    PlanResponse,
    RoutineItem,
    UserProfile,
)
from app.services.cpcb import get_aqi_category
from app.services.fallback_catalog import (
    build_base_indoor_hacks,
    build_community_actions_list,
    build_morning_routine,
    pick_lang,
)
from app.services.fallback_chat import (
    detect_fallback_chat_intent,
    generate_fallback_chat_reply,
)
from app.services.impact import get_alternative_numbers
from app.services.safety import (
    build_disclaimer,
    build_health_advisory,
    build_mask_guidance,
)

__all__ = [
    "build_community_actions",
    "detect_fallback_chat_intent",
    "generate_fallback_chat_reply",
    "generate_fallback_plan",
]

_HACK_ORDER_BY_BUDGET: dict[BudgetLevel, dict[str, int]] = {
    "low": {"free": 0, "low": 1, "medium": 2, "high": 3},
    "medium": {"low": 0, "free": 1, "medium": 2, "high": 3},
    "high": {"high": 0, "medium": 1, "low": 2, "free": 3},
}


def _sort_hacks_by_budget(hacks: list[IndoorHack], budget: BudgetLevel) -> list[IndoorHack]:
    order = _HACK_ORDER_BY_BUDGET[budget]
    return sorted(hacks, key=lambda h: order[h.cost_level])


def _midday_routine_item(profile: UserProfile) -> RoutineItem:
    is_hi = profile.language == "hi"
    apt_hi = "दोपहर में धूप से हवा ऊपर उठती है और AQI दिन का सबसे निचला स्तर छूता है। फ्लैट के विपरीत किनारों की खिड़कियां 15–20 मिनट खोलकर अंदर जमा CO2 और रसोई का धुआं बाहर निकालें।"
    apt_en = "Afternoon warmth lifts the inversion layer, making 1–4 PM the cleanest window of the day. Open opposite apartment windows for 15–20 minutes to flush trapped indoor CO2 and kitchen fumes."
    house_hi = "दोपहर 1–4 बजे ऊपरी मंजिल या आंगन की ओर वाली खिड़कियां 15–20 मिनट खोलें ताकि सड़क की धूल लाए बिना घर की बासी हवा बाहर निकल सके।"
    house_en = "Between 1–4 PM, open courtyard or upper-floor windows away from the main street for 15–20 minutes to refresh stale indoor air without pulling in ground-level road dust."
    detail = pick_lang(is_hi, apt_hi, apt_en) if profile.home_type == "apartment" else pick_lang(is_hi, house_hi, house_en)
    return RoutineItem(
        time_slot="midday",
        title=pick_lang(is_hi, "दोपहर 1–4 बजे 20 मिनट क्रॉस-वेंटिलेशन करें", "Ventilate your home for 20 minutes during the 1–4 PM AQI dip"),
        detail=detail,
        impact_note=pick_lang(is_hi, "सुबह-शाम का स्मॉग लाए बिना घर में फंसी बासी हवा और रसोई के धुएं को बाहर निकालता है।", "Flushes trapped indoor CO2 and cooking aerosols during the lowest-AQI window of the day."),
    )


def _evening_routine_item(profile: UserProfile) -> RoutineItem:
    is_hi = profile.language == "hi"
    bio_hi = "सूर्यास्त के बाद पराली और ट्रैफ़िक का धुआं फिर ज़मीन के पास जमता है। खाना बनाते समय पूरी निकासी रखें और लकड़ी/कोयले का धुआं कमरे में न भरने दें।"
    bio_en = "As evening temperatures drop, winter inversion returns and traffic plus seasonal stubble smoke sinks back down. Keep solid-fuel cooking strictly ventilated outdoors or under a hood."
    clean_hi = "सूर्यास्त के बाद तापमान गिरते ही स्मॉग फिर ज़मीन के पास जमने लगता है। खिड़कियां बंद करें, तड़के के समय एग्जॉस्ट फैन चलाएं और अगरबत्ती/मच्छर कॉइल से बचें।"
    clean_en = "As evening temperatures drop, winter inversion returns and traffic plus stubble smoke sinks to breathing height. Shut windows, run your kitchen exhaust during tadka/frying, and skip indoor incense or mosquito coils."
    detail = pick_lang(is_hi, bio_hi, bio_en) if profile.cooking_fuel == "biomass_wood" else pick_lang(is_hi, clean_hi, clean_en)
    return RoutineItem(
        time_slot="evening",
        title=pick_lang(is_hi, "शाम 5:30 बजे तक खिड़कियां सील करें और रसोई का धुआं नियंत्रित रखें", "Seal windows by 5:30 PM and minimize evening indoor smoke"),
        detail=detail,
        impact_note=pick_lang(is_hi, "शाम के पीक स्मॉग और रसोई/अगरबत्ती से होने वाले PM2.5 उछाल को रोकता है।", "Prevents sharp indoor PM2.5 spikes from evening inversion, tadka smoke, and incense."),
    )


def _night_routine_item(profile: UserProfile, is_high_smog: bool) -> RoutineItem:
    is_hi = profile.language == "hi"
    if profile.has_air_purifier:
        return RoutineItem(
            time_slot="night",
            title=pick_lang(is_hi, "बेडरूम का दरवाज़ा बंद कर अपना HEPA प्यूरीफायर रात भर चलाएं", "Run your existing HEPA purifier in a closed bedroom all night"),
            detail=pick_lang(is_hi, "सोने से 30 मिनट पहले प्यूरीफायर को हाई स्पीड पर चलाएं, फिर रात भर स्लीप/मीडियम मोड पर रखें। हर 14 दिन में प्री-फ़िल्टर वैक्यूम या गीले कपड़े से साफ करें।", "Run your purifier on high 30 minutes before bedtime to clear bedroom PM2.5, then keep it on sleep/medium overnight with doors shut. Vacuum the mesh pre-filter every 2 weeks."),
            impact_note=pick_lang(is_hi, "8 घंटे की नींद में साफ हवा मिलने से पूरे 24 घंटे का PM2.5 संपर्क ~42% तक घटता है।", "8 hours of clean sleep air cuts total 24-hour personal PM2.5 exposure by ~42%."),
        )
    extra = pick_lang(is_hi, " उच्च AQI वाली रातों में DIY बॉक्स-फैन + HEPA फ़िल्टर चलाएं।", " On Poor or worse nights, run a DIY box-fan + HEPA filter in the bedroom.") if is_high_smog else ""
    return RoutineItem(
        time_slot="night",
        title=pick_lang(is_hi, "बेडरूम के दरवाज़े के नीचे ड्राफ्ट स्टॉपर लगाकर स्वच्छ स्लीप ज़ोन बनाएं", "Create a sealed low-smog sleep zone in the bedroom"),
        detail=pick_lang(is_hi, f"बेडरूम के दरवाज़े की दरार को मुड़े हुए तौलिये या ड्राफ्ट स्टॉपर से बंद करें और सोने से पहले गीला पोंछा लगाएं।{extra}", f"Close bedroom doors tightly and block under-door slits with a rolled towel or foam weather-strip. Wet-wipe surfaces before bed.{extra}"),
        impact_note=pick_lang(is_hi, "रात भर बाहर से आने वाले धुएं का रिसाव ~15–20% तक कम होता है।", "Reduces overnight outdoor smog seepage into your sleeping space by ~15–20%."),
    )


def _commute_alternative(profile: UserProfile) -> Alternative:
    is_hi = profile.language == "hi"
    preset_map = {"car": "commute_car_to_transit", "two_wheeler": "commute_two_wheeler_to_transit"}
    preset_key = preset_map.get(profile.commute_mode, "fitted_n95_mask")
    pm25, co2 = get_alternative_numbers(preset_key, profile.commute_km)
    if profile.commute_mode == "car":
        return Alternative(current=pick_lang(is_hi, f"रोज़ाना {profile.commute_km} किमी अकेले कार चलाना", f"Solo private car commute ({profile.commute_km} km/day)"), swap=pick_lang(is_hi, "सप्ताह में 3 दिन मेट्रो/बस या कारपूल + नियमित PUC जांच", "Take metro/bus or carpool 3 days/week + stay current on PUC checks"), why=pick_lang(is_hi, "सर्दियों के जाम में कारें प्रति यात्री सबसे अधिक NO2 और PM2.5 छोड़ती हैं; शेयरिंग से तुरंत उत्सर्जन और ईंधन खर्च घटता है।", "Idling urban cars emit heavy NO2 and fine exhaust particles per passenger; shifting to transit or carpooling cuts corridor emissions and fuel costs."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)
    if profile.commute_mode == "two_wheeler":
        return Alternative(current=pick_lang(is_hi, f"रोज़ाना {profile.commute_km} किमी पेट्रोल दोपहिया यात्रा", f"Daily petrol two-wheeler ride ({profile.commute_km} km/day)"), swap=pick_lang(is_hi, "खराब AQI के दिनों में मेट्रो/AC बस चुनें या EV स्कूटर पर शिफ्ट की योजना बनाएं", "Switch to metro/AC bus on Poor+ AQI days or plan an EV two-wheeler upgrade"), why=pick_lang(is_hi, "दोपहिया सवार सीधे बसों और कारों के एग्जॉस्ट की ऊंचाई पर सांस लेते हैं। मेट्रो/AC बस से संपर्क और उत्सर्जन दोनों घटते हैं।", "Two-wheeler riders breathe directly at tailpipe height; shifting high-smog commutes to metro or AC bus protects your lungs and cuts urban emissions."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)
    return Alternative(current=pick_lang(is_hi, "बाहरी काम या लास्ट-माइल यात्रा में कपड़े/सर्जिकल मास्क पहनना", "Wearing cloth or loose surgical masks on outdoor walks and transit legs"), swap=pick_lang(is_hi, "Poor+ दिनों में नाक की क्लिप वाला फिटेड N95/FFP2 मास्क पहनें", "Switch to a snugly fitted N95/FFP2 respirator on Poor+ days"), why=pick_lang(is_hi, "आप पहले से कम-उत्सर्जन यात्रा अपना रहे हैं; फिटेड N95 लास्ट-माइल सड़क धूल के 90% से अधिक PM2.5 को रोक देता है।", "Your commute already avoids private tailpipe emissions; a snug N95/FFP2 blocks >90% of fine PM2.5 during walking and transit legs."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)


def _cooking_alternative(profile: UserProfile) -> Alternative:
    is_hi = profile.language == "hi"
    if profile.cooking_fuel == "biomass_wood":
        pm25, co2 = get_alternative_numbers("cooking_biomass_to_clean", profile.commute_km)
        return Alternative(current=pick_lang(is_hi, "लकड़ी, उपले या कोयले के चूल्हे पर खाना बनाना", "Cooking on wood, biomass, or coal chulha"), swap=pick_lang(is_hi, "LPG सिलेंडर (उज्ज्वला/सब्सिडी) या इंडक्शन कुकटॉप पर शिफ्ट करें", "Transition to LPG (Ujjwala/domestic) or a single-burner induction cooktop"), why=pick_lang(is_hi, "घर के अंदर बायोमास का धुआं बाहरी स्मॉग से कई गुना अधिक PM2.5 पैदा करता है—यह परिवार के लिए सबसे बड़ा स्वास्थ्य लाभ है।", "Indoor biomass smoke produces PM2.5 levels far higher than outdoor winter smog; switching to LPG or induction is the single largest health win."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)
    if profile.cooking_fuel in {"lpg", "piped_gas"}:
        pm25, co2 = get_alternative_numbers("cooking_gas_to_induction", profile.commute_km)
        return Alternative(current=pick_lang(is_hi, "चाय, पानी उबालने और धीमी आंच के काम गैस बर्नर पर करना", "Using gas burners for boiling water, tea, and long simmering"), swap=pick_lang(is_hi, "उबालने के लिए इलेक्ट्रिक केतली/इंडक्शन और ढक्कन + एग्जॉस्ट का उपयोग करें", "Use an electric kettle or induction burner for boiling + keep lids on & run exhaust"), why=pick_lang(is_hi, "बंद सर्दियों की रसोई में खुली लौ NO2 और बारीक कण बढ़ाती है; केतली/इंडक्शन से हवा साफ रहती है और गैस बचती है।", "Open gas flames add indoor NO2 and ultrafine particles in sealed winter kitchens; electric boiling cleans kitchen air and saves fuel."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)
    pm25, co2 = get_alternative_numbers("cooking_ventilation_only", profile.commute_km)
    return Alternative(current=pick_lang(is_hi, "बिना एग्जॉस्ट फैन चलाए तेज़ आंच पर तड़का या तलना", "High-heat oil frying without kitchen ventilation"), swap=pick_lang(is_hi, "इंडक्शन पर पकाते समय एग्जॉस्ट चलाएं और भाप/प्रेशर कुकिंग अपनाएं", "Run kitchen exhaust during tadka/frying and favor steaming or pressure cooking"), why=pick_lang(is_hi, "आप पहले से स्वच्छ इलेक्ट्रिक इंडक्शन उपयोग कर रहे हैं; एग्जॉस्ट चलाने से खाना पकाने के तेल का धुआं भी कमरे में नहीं जमता।", "Your induction setup already eliminates combustion fumes; running exhaust during tadka keeps cooking oil aerosols near baseline."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)


def _sleep_alternative(profile: UserProfile) -> Alternative:
    is_hi = profile.language == "hi"
    if not profile.has_air_purifier:
        pm25, co2 = get_alternative_numbers("bedroom_purifier", profile.commute_km)
        return Alternative(current=pick_lang(is_hi, "रात भर बिना फ़िल्ट्रेशन वाले कमरे में सोना", "Sleeping 8 hours in an unfiltered bedroom during winter smog"), swap=pick_lang(is_hi, "बंद बेडरूम में DIY बॉक्स-फैन + HEPA फ़िल्टर या True HEPA प्यूरीफायर चलाएं", "Run a DIY box-fan + True HEPA filter (or HEPA H13 unit) in a closed bedroom overnight"), why=pick_lang(is_hi, "8 घंटे साफ हवा में सोने से पूरे 24 घंटे में सांस के साथ जाने वाला PM2.5 लगभग आधा हो जाता है।", "Eight hours of filtered sleep air gives lungs overnight recovery and sharply reduces your 24-hour personal PM2.5 dose."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)
    pm25, co2 = get_alternative_numbers("seal_door_gaps", profile.commute_km)
    return Alternative(current=pick_lang(is_hi, "खुली दरारों वाले कमरों में एयर प्यूरीफायर चलाना", "Running your air purifier in rooms with unsealed door and window gaps"), swap=pick_lang(is_hi, "दरवाज़ों और खिड़कियों पर EPDM फोम टेप व ड्राफ्ट स्टॉपर लगाएं", "Seal door and window gaps with EPDM weather-stripping and under-door sweeps"), why=pick_lang(is_hi, "आपका मौजूदा प्यूरीफायर तभी सबसे अच्छा काम करता है जब बाहर का स्मॉग दरारों से अंदर न घुसे।", "Since you already own a purifier, sealing leaky frames blocks incoming haze and helps your purifier clean faster with less filter wear."), pm25_reduction_pct=pm25, co2_saved_kg_per_month=co2)


def build_community_actions(profile: UserProfile, aqi: int) -> list[CommunityAction]:
    """Generates 3 practical collective neighborhood, RWA, school, and workplace actions."""
    return build_community_actions_list(profile, aqi)


def generate_fallback_plan(profile: UserProfile, aqi_reading: AirQualityReading) -> PlanResponse:
    """Generates a complete rule-based PlanResponse when Gemini is unavailable."""
    is_hi = profile.language == "hi"
    cat = get_aqi_category(aqi_reading.aqi)
    vulnerable = profile.has_children or profile.has_elderly or profile.has_respiratory_condition
    source_label = pick_lang(is_hi, "लाइव AQI" if aqi_reading.source == "live" else "डेमो AQI", "live AQI" if aqi_reading.source == "live" else "sample demo AQI")
    budget_note = pick_lang(is_hi, "कम-खर्च इनडोर उपायों" if profile.budget == "low" else "प्रभावी इनडोर फ़िल्ट्रेशन", "free and low-cost indoor protection" if profile.budget == "low" else "effective indoor air cleaning")
    summary = pick_lang(
        is_hi,
        f"{aqi_reading.city} के लिए {source_label} {aqi_reading.aqi} ({cat.label_hi}) है, जिसमें {aqi_reading.dominant_pollutant} मुख्य प्रदूषक है। आपके {profile.household_size} सदस्यों के परिवार के लिए यह योजना पीक स्मॉग से बचाव, {budget_note} और कम-उत्सर्जन आदतों पर केंद्रित है।",
        f"{aqi_reading.city} shows a {source_label} of {aqi_reading.aqi} ({cat.label_en}), driven primarily by {aqi_reading.dominant_pollutant}. Built for your {profile.household_size}-person household, this plan prioritizes avoiding morning and evening winter inversion, {budget_note}, and practical low-emission swaps.",
    )
    pm25_waste, co2_waste = get_alternative_numbers("stop_waste_burning", profile.commute_km)
    alternatives = [
        _commute_alternative(profile),
        _cooking_alternative(profile),
        _sleep_alternative(profile),
        Alternative(current=pick_lang(is_hi, "सर्दियों में सूखे पत्ते/कचरा जलाना या दिवाली पर पटाखे फोड़ना", "Burning dry garden leaves/waste or bursting firecrackers in winter"), swap=pick_lang(is_hi, "पत्तों की खाद बनाएं, RWA के साथ खुले अलाव रोकें और दीयों/लाइट्स से उत्सव मनाएं", "Compost dry leaves, encourage RWA electric heaters over bonfires, and celebrate with diyas/LEDs"), why=pick_lang(is_hi, "ठंडी शांत रात में एक छोटा-सा कचरे का ढेर भी पूरे मोहल्ले का AQI कई घंटे तक बढ़ा देता है।", "On still winter nights, even a single neighborhood leaf or trash fire spikes PM2.5 across an entire residential block for hours."), pm25_reduction_pct=pm25_waste, co2_saved_kg_per_month=co2_waste),
    ]
    return PlanResponse(
        aqi=aqi_reading,
        summary=summary,
        health_advisory=build_health_advisory(profile, aqi_reading.aqi),
        routine=[build_morning_routine(profile, vulnerable), _midday_routine_item(profile), _evening_routine_item(profile), _night_routine_item(profile, aqi_reading.aqi >= 201)],
        indoor_hacks=_sort_hacks_by_budget(build_base_indoor_hacks(profile), profile.budget),
        alternatives=alternatives,
        community_actions=build_community_actions_list(profile, aqi_reading.aqi),
        mask_guidance=build_mask_guidance(profile, aqi_reading.aqi),
        disclaimer=build_disclaimer(profile.language),
        generated_by="rules",
    )
