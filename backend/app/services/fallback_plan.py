"""Deterministic rule-based plan and chat fallback responders."""

from __future__ import annotations

import re

from app.schemas import (
    AirQualityReading,
    Alternative,
    BudgetLevel,
    ChatReply,
    IndoorHack,
    PlanResponse,
    RoutineItem,
    UserProfile,
)
from app.services.cpcb import get_aqi_category
from app.services.impact import get_alternative_numbers
from app.services.safety import (
    build_disclaimer,
    build_emergency_care_reply,
    build_health_advisory,
    build_injection_refusal,
    build_mask_guidance,
    detect_emergency_symptoms,
    detect_prompt_injection,
    is_vulnerable_household,
    sanitize_untrusted_question,
)


def _sort_hacks_by_budget(hacks: list[IndoorHack], budget: BudgetLevel) -> list[IndoorHack]:
    rank_map: dict[BudgetLevel, dict[str, int]] = {
        "low": {"free": 0, "low": 1, "medium": 2, "high": 3},
        "medium": {"low": 0, "free": 1, "medium": 2, "high": 3},
        "high": {"high": 0, "medium": 1, "low": 2, "free": 3},
    }
    order = rank_map[budget]
    return sorted(hacks, key=lambda h: order[h.cost_level])


def _build_routine(profile: UserProfile, aqi: int) -> list[RoutineItem]:
    is_hi = profile.language == "hi"
    is_high_smog = aqi >= 201
    vulnerable = is_vulnerable_household(profile)
    city = profile.city

    if profile.commute_mode == "two_wheeler":
        morning_title = (
            "सुबह की दोपहिया यात्रा में फिटेड N95 पहनें और खिड़कियां बंद रखें"
            if is_hi
            else "Wear a sealed N95/FFP2 under your helmet and keep windows closed (6–10 AM)"
        )
        morning_detail = (
            f"सुबह 6–10 बजे सर्दियों के थर्मल इनवर्ज़न के कारण {city} में PM2.5 सबसे अधिक रहता है। हेलमेट के नीचे नाक-क्लप वाला N95 पहनें, डीज़ल बसों के पीछे न रुकें और घर की खिड़कियां बंद रखें।"
            if is_hi
            else f"Winter thermal inversion traps exhaust near street level between 6–10 AM in {city}. Wear a snug nose-clip N95 under your helmet, avoid idling behind diesel buses, and keep home windows closed."
        )
        morning_impact = (
            "सड़क के स्तर पर सांस के साथ जाने वाले PM2.5 को ~35–50% कम करता है और सुबह का स्मॉग घर में आने से रोकता है।"
            if is_hi
            else "Cuts inhaled roadside PM2.5 by ~35–50% during your ride and blocks morning inversion smog indoors."
        )
    elif profile.commute_mode == "walk_cycle":
        morning_title = (
            "सुबह की पैदल/साइकिल यात्रा धीमी रखें, N95 पहनें और घर बंद रखें"
            if is_hi
            else "Pace morning walks/rides gently with an N95 and keep windows shut (6–10 AM)"
        )
        morning_detail = (
            f"सुबह 6–10 बजे {city} में थर्मल इनवर्ज़न सड़क पर धुआं रोके रखता है। शांत गलियां चुनें, फिटेड N95 पहनें और तीव्र व्यायाम दोपहर या घर के अंदर करें।"
            if is_hi
            else f"Between 6–10 AM in {city}, winter inversion keeps exhaust at breathing height. Use quieter side streets with a fitted N95, avoid heavy morning cardio, and keep home windows sealed."
        )
        morning_impact = (
            "गहरी सांस से होने वाला PM2.5 प्रवेश कम होता है और आप शून्य वाहन उत्सर्जन के साथ सुरक्षित रहते हैं।"
            if is_hi
            else "Lowers deep-breathing PM2.5 intake while maintaining your zero-tailpipe commute."
        )
    elif profile.commute_mode == "car":
        morning_title = (
            "कार AC को रीसर्कुलेशन मोड पर रखें और सुबह 6–10 बजे खिड़कियां बंद रखें"
            if is_hi
            else "Set car AC to recirculate and keep home windows shut (6–10 AM)"
        )
        extra = (
            "संवेदनशील सदस्यों की सुबह की सैर टालें।"
            if (is_hi and vulnerable)
            else "दोपहर तक घर की खिड़कियां बंद रखें।"
            if is_hi
            else "Move school drop-offs indoors-to-car and skip morning outdoor walks for sensitive family members."
            if vulnerable
            else "Keep home windows closed until midday sunlight lifts the winter inversion layer."
        )
        morning_detail = (
            f"सुबह की यात्रा में कार AC को रीसर्कुलेशन मोड पर रखें ताकि ट्रैफ़िक का धुआं केबिन में न घुसे। {extra}"
            if is_hi
            else f"Switch your car cabin AC to recirculation mode in traffic so tailpipe fumes stay outside. {extra}"
        )
        morning_impact = (
            "कार केबिन में बाहरी धुएं का प्रवेश ~40% घटता है और घर में सुबह का स्मॉग रुकता है।"
            if is_hi
            else "Cuts in-cabin exhaust spikes by ~40% and keeps morning inversion smog out of your home."
        )
    elif profile.commute_mode == "work_from_home":
        morning_title = (
            "सुबह 10 बजे तक खिड़कियां बंद रखें और गीले पोंछे से सफाई करें"
            if is_hi
            else "Keep windows shut until 10 AM and wet-mop your home workspace"
        )
        morning_detail = (
            "घर से काम करते समय सुबह 10 बजे तक बालकनी और खिड़कियां बंद रखें। सूखी झाड़ू के बजाय गीले पोंछे से सफाई करें ताकि धूल दोबारा हवा में न उड़े।"
            if is_hi
            else "Keep balcony doors and windows sealed until 10 AM while winter inversion holds smog low. Use damp mopping instead of dry jhadu sweeping so settled dust is not kicked back into your workspace."
        )
        morning_impact = (
            "घर के अंदर धूल के दोबारा उड़ने और सुबह के स्मॉग रिसाव को ~25% कम करता है।"
            if is_hi
            else "Prevents indoor dust resuspension and blocks ~25% of morning smog infiltration."
        )
    else:  # public_transport
        morning_title = (
            "मेट्रो/बस स्टॉप की पैदल दूरी पर N95 पहनें और घर की खिड़कियां बंद रखें"
            if is_hi
            else "Wear an N95 on your metro/bus walk and keep home windows shut (6–10 AM)"
        )
        morning_detail = (
            "मेट्रो या बस स्टॉप तक पैदल चलते समय फिटेड N95 मास्क पहनें और सुबह 6–10 बजे के इनवर्ज़न के दौरान घर की खिड़कियां बंद रखें।"
            if is_hi
            else "Wear a snugly fitted N95/FFP2 mask on your walk to the metro or bus stop where roadside exhaust spikes, and keep home windows closed during the 6–10 AM winter inversion."
        )
        morning_impact = (
            "लास्ट-माइल यात्रा में सड़क के PM2.5 से बचाता है और घर में सुबह का स्मॉग आने से रोकता है।"
            if is_hi
            else "Protects you from last-mile roadside PM2.5 spikes while keeping morning smog out of your home."
        )

    midday_title = (
        "दोपहर 1–4 बजे 20 मिनट क्रॉस-वेंटिलेशन करें"
        if is_hi
        else "Ventilate your home for 20 minutes during the 1–4 PM AQI dip"
    )
    if profile.home_type == "apartment":
        midday_detail = (
            "दोपहर में धूप से हवा ऊपर उठती है और AQI दिन का सबसे निचला स्तर छूता है। फ्लैट के विपरीत किनारों की खिड़कियां 15–20 मिनट खोलकर अंदर जमा CO2 और रसोई का धुआं बाहर निकालें।"
            if is_hi
            else "Afternoon warmth lifts the inversion layer, making 1–4 PM the cleanest window of the day. Open opposite apartment windows for 15–20 minutes to flush trapped indoor CO2 and kitchen fumes."
        )
    else:
        midday_detail = (
            "दोपहर 1–4 बजे ऊपरी मंजिल या आंगन की ओर वाली खिड़कियां 15–20 मिनट खोलें ताकि सड़क की धूल लाए बिना घर की बासी हवा बाहर निकल सके।"
            if is_hi
            else "Between 1–4 PM, open courtyard or upper-floor windows away from the main street for 15–20 minutes to refresh stale indoor air without pulling in ground-level road dust."
        )
    midday_impact = (
        "सुबह-शाम का स्मॉग लाए बिना घर में फंसी बासी हवा और रसोई के धुएं को बाहर निकालता है।"
        if is_hi
        else "Flushes trapped indoor CO2 and cooking aerosols during the lowest-AQI window of the day."
    )

    evening_title = (
        "शाम 5:30 बजे तक खिड़कियां सील करें और रसोई का धुआं नियंत्रित रखें"
        if is_hi
        else "Seal windows by 5:30 PM and minimize evening indoor smoke"
    )
    if profile.cooking_fuel == "biomass_wood":
        evening_detail = (
            "सूर्यास्त के बाद पराली और ट्रैफ़िक का धुआं फिर ज़मीन के पास जमता है। खाना बनाते समय पूरी निकासी रखें और लकड़ी/कोयले का धुआं कमरे में न भरने दें।"
            if is_hi
            else "As evening temperatures drop, winter inversion returns and traffic plus seasonal stubble smoke sinks back down. Keep solid-fuel cooking strictly ventilated outdoors or under a hood."
        )
    else:
        evening_detail = (
            "सूर्यास्त के बाद तापमान गिरते ही स्मॉग फिर ज़मीन के पास जमने लगता है। खिड़कियां बंद करें, तड़के के समय एग्जॉस्ट फैन चलाएं और अगरबत्ती/मच्छर कॉइल से बचें।"
            if is_hi
            else "As evening temperatures drop, winter inversion returns and traffic plus stubble smoke sinks to breathing height. Shut windows, run your kitchen exhaust during tadka/frying, and skip indoor incense or mosquito coils."
        )
    evening_impact = (
        "शाम के पीक स्मॉग और रसोई/अगरबत्ती से होने वाले PM2.5 उछाल को रोकता है।"
        if is_hi
        else "Prevents sharp indoor PM2.5 spikes from evening inversion, tadka smoke, and incense."
    )

    if profile.has_air_purifier:
        night_title = (
            "बेडरूम का दरवाज़ा बंद कर अपना HEPA प्यूरीफायर रात भर चलाएं"
            if is_hi
            else "Run your existing HEPA purifier in a closed bedroom all night"
        )
        night_detail = (
            "सोने से 30 मिनट पहले प्यूरीफायर को हाई स्पीड पर चलाएं, फिर रात भर स्लीप/मीडियम मोड पर रखें। हर 14 दिन में प्री-फ़िल्टर वैक्यूम या गीले कपड़े से साफ करें।"
            if is_hi
            else "Run your purifier on high 30 minutes before bedtime to clear bedroom PM2.5, then keep it on sleep/medium overnight with doors shut. Vacuum the mesh pre-filter every 2 weeks."
        )
        night_impact = (
            "8 घंटे की नींद में साफ हवा मिलने से पूरे 24 घंटे का PM2.5 संपर्क ~42% तक घटता है।"
            if is_hi
            else "8 hours of clean sleep air cuts total 24-hour personal PM2.5 exposure by ~42%."
        )
    else:
        night_title = (
            "बेडरूम के दरवाज़े के नीचे ड्राफ्ट स्टॉपर लगाकर स्वच्छ स्लीप ज़ोन बनाएं"
            if is_hi
            else "Create a sealed low-smog sleep zone in the bedroom"
        )
        extra_night = (
            " उच्च AQI वाली रातों में DIY बॉक्स-फैन + HEPA फ़िल्टर चलाएं।"
            if (is_hi and is_high_smog)
            else " On Poor or worse nights, run a DIY box-fan + HEPA filter in the bedroom."
            if is_high_smog
            else ""
        )
        night_detail = (
            f"बेडरूम के दरवाज़े की दरार को मुड़े हुए तौलिये या ड्राफ्ट स्टॉपर से बंद करें और सोने से पहले गीला पोंछा लगाएं।{extra_night}"
            if is_hi
            else f"Close bedroom doors tightly and block under-door slits with a rolled towel or foam weather-strip. Wet-wipe surfaces before bed.{extra_night}"
        )
        night_impact = (
            "रात भर बाहर से आने वाले धुएं का रिसाव ~15–20% तक कम होता है।"
            if is_hi
            else "Reduces overnight outdoor smog seepage into your sleeping space by ~15–20%."
        )

    return [
        RoutineItem(
            time_slot="morning",
            title=morning_title,
            detail=morning_detail,
            impact_note=morning_impact,
        ),
        RoutineItem(
            time_slot="midday",
            title=midday_title,
            detail=midday_detail,
            impact_note=midday_impact,
        ),
        RoutineItem(
            time_slot="evening",
            title=evening_title,
            detail=evening_detail,
            impact_note=evening_impact,
        ),
        RoutineItem(
            time_slot="night",
            title=night_title,
            detail=night_detail,
            impact_note=night_impact,
        ),
    ]


def _build_indoor_hacks(profile: UserProfile) -> list[IndoorHack]:
    is_hi = profile.language == "hi"
    hacks: list[IndoorHack] = [
        IndoorHack(
            title="सूखी झाड़ू के बजाय गीला पोंछा (Wet Mopping)" if is_hi else "Switch from dry sweeping to wet mopping",
            how_to=(
                "सुबह और शाम सूखी झाड़ू या डस्टिंग न करें—हल्के गीले माइक्रोफाइबर कपड़े या पोंछे से फर्श साफ करें।"
                if is_hi
                else "Replace dry jhadu sweeping and dry dusting with a damp microfiber mop or cloth once daily, especially near entryways."
            ),
            estimated_benefit="~20–30% कम उड़ती धूल (PM10/PM2.5)" if is_hi else "~20–30% less resuspended indoor dust (PM10/PM2.5)",
            cost_level="free",
        ),
        IndoorHack(
            title="घर में अगरबत्ती, धूप और मच्छर कॉइल से बचें" if is_hi else "Skip incense sticks, dhoop, and mosquito coils indoors",
            how_to=(
                "बंद सर्दियों के कमरों में अगरबत्ती और कॉइल भारी PM2.5 छोड़ते हैं। मच्छरदानी या लिक्विड वेपोराइज़र चुनें और दीया जलाते समय एग्जॉस्ट चालू रखें।"
                if is_hi
                else "Burning incense or mosquito coils in closed winter rooms spikes indoor PM2.5 above outdoor smog. Use mosquito nets and run exhaust if lighting diyas."
            ),
            estimated_benefit="घर के भीतर के सबसे तेज़ PM2.5 उछाल से बचाव" if is_hi else "Eliminates sharp indoor smoke spikes (often 200–500 µg/m³)",
            cost_level="free",
        ),
        IndoorHack(
            title=(
                ("बालकनी स्लाइडिंग डोर और मेन डोर की दरारें सील करें" if is_hi else "Weather-strip balcony sliding doors and entrance gaps")
                if profile.home_type == "apartment"
                else ("बाहरी दरवाज़ों पर ड्राफ्ट स्टॉपर और खिड़कियों पर सील लगाएं" if is_hi else "Add door sweeps and window seals on road-facing rooms")
            ),
            how_to=(
                "हार्डवेयर की दुकान से ₹200–₹400 की EPDM फोम टेप लगाकर दरवाज़ों और खिड़कियों की दरारें बंद करें।"
                if is_hi
                else "Apply inexpensive self-adhesive EPDM foam weather-stripping around loose window sashes and attach an under-door brush sweep."
            ),
            estimated_benefit="~15% कम बाहरी स्मॉग रिसाव" if is_hi else "~15% lower outdoor smog seepage; doubles filtration efficiency",
            cost_level="low",
        ),
        IndoorHack(
            title="इंडोर पौधों पर भरोसा न करें — वास्तविक फ़िल्ट्रेशन चुनें" if is_hi else "Don't rely on indoor plants for PM2.5 — use real filtration",
            how_to=(
                "अरेका पाम या स्नेक प्लांट अच्छे दिखते हैं, पर वैज्ञानिक परीक्षण बताते हैं कि वे कमरे का PM2.5 नाममात्र ही घटाते हैं। सीलिंग, गीले पोंछे और HEPA फ़िल्टर पर ध्यान दें।"
                if is_hi
                else "Houseplants like snake plant and areca palm remove negligible PM2.5 during severe urban smog. Prioritize airtight sealing and mechanical HEPA filtration."
            ),
            estimated_benefit="झूठी सुरक्षा से बचाव और सही उपायों पर बजट खर्च" if is_hi else "Prevents false confidence so your budget goes to real PM2.5 cuts",
            cost_level="free",
        ),
        IndoorHack(
            title="तड़के और तलने के समय किचन एग्जॉस्ट फैन चलाएं" if is_hi else "Run kitchen exhaust and keep the kitchen door closed while cooking",
            how_to=(
                "खाना पकाते समय रसोई का दरवाज़ा बंद रखें और एग्जॉस्ट फैन या चिमनी चलाकर तेल का धुआं बाहर निकालें।"
                if is_hi
                else "Close the kitchen door and run an exhaust fan or chimney during tadka and frying so cooking aerosols do not drift into bedrooms."
            ),
            estimated_benefit="लिविंग रूम और बेडरूम में रसोई का PM2.5 फैलना रुकता है" if is_hi else "Prevents kitchen oil aerosols from spreading into living and sleeping rooms",
            cost_level="free",
        ),
    ]

    if profile.has_air_purifier:
        hacks.append(
            IndoorHack(
                title="प्यूरीफायर की सही जगह और हर 14 दिन में प्री-फ़िल्टर सफाई" if is_hi else "Optimize existing purifier placement & clean pre-filter fortnightly",
                how_to=(
                    "अपने प्यूरीफायर को दीवार से 30 सेमी दूर एक बंद बेडरूम में चलाएं (खुले हॉल में नहीं), और जालीदार प्री-फ़िल्टर को हर 14 दिन में साफ करें।"
                    if is_hi
                    else "Place your existing purifier 30 cm away from walls in a closed bedroom (not an open hall) and vacuum the mesh pre-filter every 2 weeks; never wash paper HEPA."
                ),
                estimated_benefit="एयरफ्लो (CADR) 25–35% बेहतर बना रहता है" if is_hi else "Maintains 25–35% higher clean-air delivery (CADR) during winter peaks",
                cost_level="free",
            )
        )
        hacks.append(
            IndoorHack(
                title="पोर्टेबल लेज़र PM2.5 मॉनिटर से रिसाव जांचें" if is_hi else "Spot hidden window drafts with a compact PM2.5 sensor",
                how_to=(
                    "बेडरूम और रसोई में PM2.5 जांचकर समझें कि किस खिड़की से धुंध आ रही है और वेंटिलेशन कब सुरक्षित है।"
                    if is_hi
                    else "Track indoor PM2.5 across rooms to detect leaky window frames and verify when indoor air drops below 35 µg/m³."
                ),
                estimated_benefit="सटीक वेंटिलेशन समय और बिजली की बचत" if is_hi else "Verifies clean indoor air (<35 µg/m³) and eliminates guesswork",
                cost_level="medium",
            )
        )
    else:
        hacks.append(
            IndoorHack(
                title="DIY बॉक्स-फैन + HEPA फ़िल्टर बनाएं (कम खर्च)" if is_hi else "Build a DIY box-fan + HEPA filter (budget air cleaner)",
                how_to=(
                    "एक टेबल या बॉक्स फैन के पीछे ₹1,200–₹2,000 का रिप्लेसमेंट True HEPA फ़िल्टर कार्डबोर्ड और डक्ट टेप से सील करके लगाएं।"
                    if is_hi
                    else "Seal a standard replacement True HEPA filter (₹1,200–₹2,000) snugly to the intake side of an existing box or table fan using cardboard shrouding."
                ),
                estimated_benefit="बंद बेडरूम में PM2.5 में ~50–70% कमी" if is_hi else "~50–70% bedroom PM2.5 drop at a quarter of retail cost",
                cost_level="low",
            )
        )
        hacks.append(
            IndoorHack(
                title="मुख्य बेडरूम के लिए True HEPA H13 प्यूरीफायर चुनें" if is_hi else "Add an ozone-free True HEPA H13 purifier for the main bedroom",
                how_to=(
                    "बिना आयनाइज़र वाला True HEPA H13 मॉडल चुनें जिसका CADR आपके कमरे के अनुसार 250–350 m³/hr हो।"
                    if is_hi
                    else "Choose an ozone-free True HEPA H13 unit sized to your bedroom (CADR 250–350 m³/hr) with affordable replacement filters."
                ),
                estimated_benefit="रात भर बंद कमरे में PM2.5 में ~70–85% कमी" if is_hi else "Reduces overnight bedroom PM2.5 by ~70–85% with doors shut",
                cost_level="high",
            )
        )

    return _sort_hacks_by_budget(hacks, profile.budget)


def _build_alternatives(profile: UserProfile) -> list[Alternative]:
    is_hi = profile.language == "hi"
    swaps: list[Alternative] = []

    if profile.commute_mode == "car":
        pm25, co2 = get_alternative_numbers("commute_car_to_transit", profile.commute_km)
        swaps.append(
            Alternative(
                current=f"रोज़ाना {profile.commute_km} किमी अकेले कार चलाना" if is_hi else f"Solo private car commute ({profile.commute_km} km/day)",
                swap="सप्ताह में 3 दिन मेट्रो/बस या कारपूल + नियमित PUC जांच" if is_hi else "Take metro/bus or carpool 3 days/week + stay current on PUC checks",
                why=(
                    "सर्दियों के जाम में कारें प्रति यात्री सबसे अधिक NO2 और PM2.5 छोड़ती हैं; शेयरिंग से तुरंत उत्सर्जन और ईंधन खर्च घटता है।"
                    if is_hi
                    else "Idling urban cars emit heavy NO2 and fine exhaust particles per passenger; shifting to transit or carpooling cuts corridor emissions and fuel costs."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )
    elif profile.commute_mode == "two_wheeler":
        pm25, co2 = get_alternative_numbers("commute_two_wheeler_to_transit", profile.commute_km)
        swaps.append(
            Alternative(
                current=f"रोज़ाना {profile.commute_km} किमी पेट्रोल दोपहिया यात्रा" if is_hi else f"Daily petrol two-wheeler ride ({profile.commute_km} km/day)",
                swap="खराब AQI के दिनों में मेट्रो/AC बस चुनें या EV स्कूटर पर शिफ्ट की योजना बनाएं" if is_hi else "Switch to metro/AC bus on Poor+ AQI days or plan an EV two-wheeler upgrade",
                why=(
                    "दोपहिया सवार सीधे बसों और कारों के एग्जॉस्ट की ऊंचाई पर सांस लेते हैं। मेट्रो/AC बस से संपर्क और उत्सर्जन दोनों घटते हैं।"
                    if is_hi
                    else "Two-wheeler riders breathe directly at tailpipe height; shifting high-smog commutes to metro or AC bus protects your lungs and cuts urban emissions."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )
    else:
        # User already uses metro/bus, walk/cycle, or WFH: do NOT recommend switching commute;
        # recommend fitted N95 protection for outdoor legs (PM2.5-only, CO2 = 0).
        pm25, co2 = get_alternative_numbers("fitted_n95_mask", profile.commute_km)
        swaps.append(
            Alternative(
                current="बाहरी काम या लास्ट-माइल यात्रा में कपड़े/सर्जिकल मास्क पहनना" if is_hi else "Wearing cloth or loose surgical masks on outdoor walks and transit legs",
                swap="Poor+ दिनों में नाक की क्लिप वाला फिटेड N95/FFP2 मास्क पहनें" if is_hi else "Switch to a snugly fitted N95/FFP2 respirator on Poor+ days",
                why=(
                    "आप पहले से कम-उत्सर्जन यात्रा अपना रहे हैं; फिटेड N95 लास्ट-माइल सड़क धूल के 90% से अधिक PM2.5 को रोक देता है।"
                    if is_hi
                    else "Your commute already avoids private tailpipe emissions; a snug N95/FFP2 blocks >90% of fine PM2.5 during walking and transit legs."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )

    if profile.cooking_fuel == "biomass_wood":
        pm25, co2 = get_alternative_numbers("cooking_biomass_to_clean", profile.commute_km)
        swaps.append(
            Alternative(
                current="लकड़ी, उपले या कोयले के चूल्हे पर खाना बनाना" if is_hi else "Cooking on wood, biomass, or coal chulha",
                swap="LPG सिलेंडर (उज्ज्वला/सब्सिडी) या इंडक्शन कुकटॉप पर शिफ्ट करें" if is_hi else "Transition to LPG (Ujjwala/domestic) or a single-burner induction cooktop",
                why=(
                    "घर के अंदर बायोमास का धुआं बाहरी स्मॉग से कई गुना अधिक PM2.5 पैदा करता है—यह परिवार के लिए सबसे बड़ा स्वास्थ्य लाभ है।"
                    if is_hi
                    else "Indoor biomass smoke produces PM2.5 levels far higher than outdoor winter smog; switching to LPG or induction is the single largest health win."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )
    elif profile.cooking_fuel in {"lpg", "piped_gas"}:
        pm25, co2 = get_alternative_numbers("cooking_gas_to_induction", profile.commute_km)
        swaps.append(
            Alternative(
                current="चाय, पानी उबालने और धीमी आंच के काम गैस बर्नर पर करना" if is_hi else "Using gas burners for boiling water, tea, and long simmering",
                swap="उबालने के लिए इलेक्ट्रिक केतली/इंडक्शन और ढक्कन + एग्जॉस्ट का उपयोग करें" if is_hi else "Use an electric kettle or induction burner for boiling + keep lids on & run exhaust",
                why=(
                    "बंद सर्दियों की रसोई में खुली लौ NO2 और बारीक कण बढ़ाती है; केतली/इंडक्शन से हवा साफ रहती है और गैस बचती है।"
                    if is_hi
                    else "Open gas flames add indoor NO2 and ultrafine particles in sealed winter kitchens; electric boiling cleans kitchen air and saves fuel."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )
    else:
        # User already cooks cleanly on induction/electric: recommend ventilation-only swap (CO2 = 0).
        pm25, co2 = get_alternative_numbers("cooking_ventilation_only", profile.commute_km)
        swaps.append(
            Alternative(
                current="बिना एग्जॉस्ट फैन चलाए तेज़ आंच पर तड़का या तलना" if is_hi else "High-heat oil frying without kitchen ventilation",
                swap="इंडक्शन पर पकाते समय एग्जॉस्ट चलाएं और भाप/प्रेशर कुकिंग अपनाएं" if is_hi else "Run kitchen exhaust during tadka/frying and favor steaming or pressure cooking",
                why=(
                    "आप पहले से स्वच्छ इलेक्ट्रिक इंडक्शन उपयोग कर रहे हैं; एग्जॉस्ट चलाने से खाना पकाने के तेल का धुआं भी कमरे में नहीं जमता।"
                    if is_hi
                    else "Your induction setup already eliminates combustion fumes; running exhaust during tadka keeps cooking oil aerosols near baseline."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )

    if not profile.has_air_purifier:
        pm25, co2 = get_alternative_numbers("bedroom_purifier", profile.commute_km)
        swaps.append(
            Alternative(
                current="रात भर बिना फ़िल्ट्रेशन वाले कमरे में सोना" if is_hi else "Sleeping 8 hours in an unfiltered bedroom during winter smog",
                swap="बंद बेडरूम में DIY बॉक्स-फैन + HEPA फ़िल्टर या True HEPA प्यूरीफायर चलाएं" if is_hi else "Run a DIY box-fan + True HEPA filter (or HEPA H13 unit) in a closed bedroom overnight",
                why=(
                    "8 घंटे साफ हवा में सोने से पूरे 24 घंटे में सांस के साथ जाने वाला PM2.5 लगभग आधा हो जाता है।"
                    if is_hi
                    else "Eight hours of filtered sleep air gives lungs overnight recovery and sharply reduces your 24-hour personal PM2.5 dose."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )
    else:
        pm25, co2 = get_alternative_numbers("seal_door_gaps", profile.commute_km)
        swaps.append(
            Alternative(
                current="खुली दरारों वाले कमरों में एयर प्यूरीफायर चलाना" if is_hi else "Running your air purifier in rooms with unsealed door and window gaps",
                swap="दरवाज़ों और खिड़कियों पर EPDM फोम टेप व ड्राफ्ट स्टॉपर लगाएं" if is_hi else "Seal door and window gaps with EPDM weather-stripping and under-door sweeps",
                why=(
                    "आपका मौजूदा प्यूरीफायर तभी सबसे अच्छा काम करता है जब बाहर का स्मॉग दरारों से अंदर न घुसे।"
                    if is_hi
                    else "Since you already own a purifier, sealing leaky frames blocks incoming haze and helps your purifier clean faster with less filter wear."
                ),
                pm25_reduction_pct=pm25,
                co2_saved_kg_per_month=co2,
            )
        )

    pm25_waste, co2_waste = get_alternative_numbers("stop_waste_burning", profile.commute_km)
    swaps.append(
        Alternative(
            current="सर्दियों में सूखे पत्ते/कचरा जलाना या दिवाली पर पटाखे फोड़ना" if is_hi else "Burning dry garden leaves/waste or bursting firecrackers in winter",
            swap="पत्तों की खाद बनाएं, RWA के साथ खुले अलाव रोकें और दीयों/लाइट्स से उत्सव मनाएं" if is_hi else "Compost dry leaves, encourage RWA electric heaters over bonfires, and celebrate with diyas/LEDs",
            why=(
                "ठंडी शांत रात में एक छोटा-सा कचरे का ढेर भी पूरे मोहल्ले का AQI कई घंटे तक बढ़ा देता है।"
                if is_hi
                else "On still winter nights, even a single neighborhood leaf or trash fire spikes PM2.5 across an entire residential block for hours."
            ),
            pm25_reduction_pct=pm25_waste,
            co2_saved_kg_per_month=co2_waste,
        )
    )

    return swaps


def generate_fallback_plan(profile: UserProfile, aqi_reading: AirQualityReading) -> PlanResponse:
    """Generates a complete rule-based PlanResponse when Gemini is unavailable."""
    is_hi = profile.language == "hi"
    cat = get_aqi_category(aqi_reading.aqi)
    source_label_en = "live AQI" if aqi_reading.source == "live" else "sample demo AQI"
    source_label_hi = "लाइव AQI" if aqi_reading.source == "live" else "डेमो AQI"

    summary = (
        f"{aqi_reading.city} के लिए {source_label_hi} {aqi_reading.aqi} ({cat.label_hi}) है, जिसमें {aqi_reading.dominant_pollutant} मुख्य प्रदूषक है। आपके {profile.household_size} सदस्यों के परिवार के लिए यह योजना पीक स्मॉग से बचाव, {'कम-खर्च इनडोर उपायों' if profile.budget == 'low' else 'प्रभावी इनडोर फ़िल्ट्रेशन'} और कम-उत्सर्जन आदतों पर केंद्रित है।"
        if is_hi
        else f"{aqi_reading.city} shows a {source_label_en} of {aqi_reading.aqi} ({cat.label_en}), driven primarily by {aqi_reading.dominant_pollutant}. Built for your {profile.household_size}-person household, this plan prioritizes avoiding morning and evening winter inversion, {'free and low-cost indoor protection' if profile.budget == 'low' else 'effective indoor air cleaning'}, and practical low-emission swaps."
    )

    return PlanResponse(
        aqi=aqi_reading,
        summary=summary,
        health_advisory=build_health_advisory(profile, aqi_reading.aqi),
        routine=_build_routine(profile, aqi_reading.aqi),
        indoor_hacks=_build_indoor_hacks(profile),
        alternatives=_build_alternatives(profile),
        mask_guidance=build_mask_guidance(profile, aqi_reading.aqi),
        disclaimer=build_disclaimer(profile.language),
        generated_by="rules",
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


def generate_fallback_chat_reply(
    question: str,
    profile: UserProfile,
    plan: PlanResponse,
) -> ChatReply:
    """Deterministic profile- and AQI-aware fallback chat responder."""
    safe_q = sanitize_untrusted_question(question)
    is_hi = profile.language == "hi"
    city = plan.aqi.city
    aqi = plan.aqi.aqi

    if detect_emergency_symptoms(safe_q):
        return ChatReply(answer=build_emergency_care_reply(profile.language, city, aqi))

    if detect_prompt_injection(safe_q):
        return ChatReply(answer=build_injection_refusal(profile.language))

    intent = detect_fallback_chat_intent(safe_q)
    cat = get_aqi_category(aqi)
    vulnerable = is_vulnerable_household(profile)

    if intent == "greeting":
        answer = (
            f"नमस्ते! {city} में अभी AQI {aqi} ({cat.label_hi}) है—मास्क, बच्चों के बाहर खेलने, वेंटिलेशन या घर की हवा के बारे में कुछ भी पूछें।"
            if is_hi
            else f"Hello! {city} is currently at AQI {aqi} ({cat.label_en})—ask me anything about masks, kids playing outside, ventilation windows, or indoor air hacks."
        )
        return ChatReply(answer=answer)

    if intent == "off_topic":
        return ChatReply(answer=build_injection_refusal(profile.language))

    if intent == "symptoms":
        answer = (
            f"महत्वपूर्ण स्वास्थ्य नोट: यदि किसी को खांसी, घरघराहट, सीने में जकड़न या सांस लेने में दिक्कत है, तो तुरंत योग्य डॉक्टर से सलाह लें—सांस चिकित्सीय सलाह नहीं देता। अभी {city} (AQI {aqi}) में घर के अंदर रहें और निर्धारित दवा पास रखें।"
            if is_hi
            else f"Important health note: If anyone has coughing, wheezing, chest tightness, or breathlessness, please consult a qualified doctor promptly—Saans is not a substitute for medical care. Stay indoors in {city} (AQI {aqi}) with windows closed and prescribed medication handy."
        )
        return ChatReply(answer=answer)

    if intent == "outdoor_play":
        if aqi >= 201:
            answer = (
                f"{city} में अभी AQI {aqi} ({cat.label_hi}) है। इस स्तर पर बच्चों का बाहर खेलना या किसी का भी बाहरी व्यायाम सुरक्षित नहीं है—खेलकूद घर के अंदर रखें। अनिवार्य बाहर निकलने पर दोपहर 1–4 बजे चुनें और फिटेड N95 पहनें।"
                if is_hi
                else f"At AQI {aqi} ({cat.label_en}) in {city}, outdoor play and exertion should be avoided for everyone—especially children and sensitive family members. Move play indoors today; for essential trips, prefer 1–4 PM with a fitted N95/FFP2 mask. (Not medical advice.)"
            )
        elif aqi >= 101 and vulnerable:
            answer = (
                f"{city} में AQI {aqi} ({cat.label_hi}) है और आपके घर में संवेदनशील सदस्य हैं। भारी खेलकूद या दौड़ टालें; केवल दोपहर 1–4 बजे सड़क से दूर हल्की गतिविधि रखें और ट्रैफ़िक में N95 पहनें।"
                if is_hi
                else f"At AQI {aqi} ({cat.label_en}) in {city}, because your household includes sensitive members, skip vigorous outdoor play or running. Keep outdoor time brief and gentle between 1–4 PM away from busy roads, and use a fitted N95 near traffic. (Not medical advice.)"
            )
        else:
            answer = (
                f"{city} में AQI {aqi} ({cat.label_hi}) है। मुख्य सड़क से दूर पार्क में दोपहर के समय हल्का खेलना आरामदायक है, पर आंखों या गले में जलन लगे तो अंदर आ जाएं।"
                if is_hi
                else f"At AQI {aqi} ({cat.label_en}) in {city}, normal outdoor play and light exercise in parks away from busy roads are comfortable—especially in the afternoon. Head indoors if anyone notices throat or eye irritation."
            )
        return ChatReply(answer=answer)

    if intent == "plants":
        answer = (
            "ईमानदार जवाब: स्नेक प्लांट या अरेका पाम अच्छे दिखते हैं, पर वास्तविक शहरी स्मॉग में वे कमरे का PM2.5 लगभग नहीं घटा पाते। असली असर के लिए पीक घंटों में खिड़कियां बंद रखें, गीला पोंछा लगाएं और True HEPA या DIY बॉक्स-फैन फ़िल्टर उपयोग करें।"
            if is_hi
            else f"Honest answer: Houseplants like snake plant and areca palm remove negligible PM2.5 during real urban smog—you would need hundreds per room to match one small filter. For real relief in {city} (AQI {aqi}), seal gaps during peak smog, wet-mop daily, and use a True HEPA or DIY box-fan filter."
        )
        return ChatReply(answer=answer)

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
        answer = (
            f"{city} (AQI {aqi}) के लिए कपड़ा या ढीला सर्जिकल मास्क PM2.5 नहीं रोकता। बिना वाल्व वाला फिटेड N95/FFP2 मास्क पहनें, नाक की क्लिप दबाएं और {extra}"
            if is_hi
            else f"For {city} (AQI {aqi}, {cat.label_en}), cloth and loose surgical masks leak fine PM2.5. Choose an unvalved certified N95 or FFP2 respirator, press the nose clip snugly so glasses don't fog, and {extra}"
        )
        return ChatReply(answer=answer)

    if intent == "purifier_diy":
        if profile.has_air_purifier:
            answer = (
                "चूंकि आपके पास पहले से एयर प्यूरीफायर है: इसे दीवार से 30 सेमी दूर एक बंद बेडरूम में चलाएं, सोने से 30 मिनट पहले हाई मोड पर चलाएं और हर 14 दिन में प्री-फ़िल्टर साफ करें।"
                if is_hi
                else "Since you already own an air purifier: run it in one closed bedroom (not an open hall) 30 cm from walls, run on high 30 minutes before bed, and vacuum the mesh pre-filter every 2 weeks."
            )
        else:
            answer = (
                f"आपके {profile.budget} बजट के लिए: ₹1,200–₹2,000 के True HEPA फ़िल्टर को बॉक्स या टेबल फैन के पीछे कार्डबोर्ड और टेप से सील करके असरदार DIY बेडरूम प्यूरीफायर बनाया जा सकता है।"
                if is_hi
                else f"For your {profile.budget} budget: sealing a replacement True HEPA filter (₹1,200–₹2,000) onto the intake of a box or table fan with cardboard creates a high-value DIY bedroom cleaner. If buying retail, pick an ozone-free True HEPA H13 unit."
            )
        return ChatReply(answer=answer)

    if intent == "cheapest_indoor":
        answer = (
            f"{city} (AQI {aqi}) में सस्ते असरदार उपाय: (1) मुफ्त: सुबह 6–10 और शाम 6–10 खिड़कियां बंद रखें, दोपहर 1–4 बजे 20 मिनट खोलें। (2) मुफ्त: गीला पोंछा लगाएं और अगरबत्ती न जलाएं। (3) ~₹300: दरवाज़ों पर फोम टेप लगाएं। (4) ~₹1,500: DIY बॉक्स-फैन HEPA बनाएं।"
            if is_hi
            else f"The 4 cheapest high-impact indoor fixes for {city} (AQI {aqi}): (1) Free: shut windows 6–10 AM and 6–10 PM, cross-ventilate 20 min between 1–4 PM. (2) Free: wet-mop instead of dry sweeping and skip incense/coils. (3) ~₹300: add EPDM foam door seals. (4) ~₹1,500: build a DIY box-fan + HEPA cleaner."
        )
        return ChatReply(answer=answer)

    if intent == "cooking":
        if profile.cooking_fuel == "biomass_wood":
            answer = (
                "लकड़ी/बायोमास का धुआं बाहरी स्मॉग से भी अधिक PM2.5 पैदा करता है। खाना बनाते समय पूरी क्रॉस-वेंटिलेशन या खुली जगह चुनें और LPG/इंडक्शन पर शिफ्ट को प्राथमिकता दें।"
                if is_hi
                else "Indoor wood or biomass smoke creates far more PM2.5 than outdoor smog. Cook with maximum ventilation or outdoors under cover immediately, and prioritize transitioning to LPG or induction."
            )
        else:
            answer = (
                "तड़का या तलने के समय किचन एग्जॉस्ट फैन चलाएं, रसोई का दरवाज़ा बंद रखें और चाय/उबालने के लिए इलेक्ट्रिक केतली या इंडक्शन का उपयोग करें।"
                if is_hi
                else "Run your kitchen exhaust fan during tadka and frying with the kitchen door closed so smoke stays out of bedrooms, and use an electric kettle or induction burner for boiling water or tea."
            )
        return ChatReply(answer=answer)

    if intent == "commute":
        if profile.commute_mode == "work_from_home":
            answer = (
                "आप पहले से घर से काम कर रहे हैं! बस शाम के ट्रैफ़िक पीक के बजाय ज़रूरी काम दोपहर 1–4 बजे एक साथ निपटाएं।"
                if is_hi
                else f"Working from home already avoids daily rush-hour exhaust. Simply batch outdoor errands into one 1–4 PM trip instead of peak evening smog in {city}."
            )
        elif profile.commute_mode == "car":
            answer = (
                f"{city} (AQI {aqi}) में {profile.commute_km} किमी यात्रा के लिए कार AC रीसर्कुलेशन मोड पर रखें, PUC अपडेट रखें और सप्ताह में 3 दिन मेट्रो/कारपूल आज़माएं।"
                if is_hi
                else f"For your {profile.commute_km} km drive in {city} (AQI {aqi}), keep cabin AC on recirculation in traffic, stay current on PUC checks, and shift 3 days/week to metro or carpooling."
            )
        else:
            answer = (
                f"{city} (AQI {aqi}) में {profile.commute_km} किमी यात्रा के लिए मेट्रो/AC बस सबसे सुरक्षित हैं; पैदल या दोपहिया चरण में फिटेड N95 पहनें।"
                if is_hi
                else f"For your {profile.commute_km} km commute in {city} (AQI {aqi}), metro or AC buses cut roadside exposure; wear a fitted N95 during open-air walking or two-wheeler legs."
            )
        return ChatReply(answer=answer)

    if intent == "ventilation":
        answer = (
            "सर्दियों में सुबह 6–10 और शाम 6–10 बजे इनवर्ज़न के कारण प्रदूषण ज़मीन के पास फंसा रहता है—इन घंटों में खिड़कियां बंद रखें और दोपहर 1–4 बजे 15–20 मिनट विपरीत खिड़कियां खोलें।"
            if is_hi
            else "Winter thermal inversion traps smog low between 6–10 AM and 6–10 PM—keep windows shut then. Open opposite windows for 15–20 minutes between 1–4 PM when afternoon warmth lifts the smog layer."
        )
        return ChatReply(answer=answer)

    snippet = safe_q[:90]
    answer = (
        f'आपके सवाल ("{snippet}") के लिए: {city} में वर्तमान AQI {aqi} ({cat.label_hi}) के अनुसार अपनी दिनचर्या और इनडोर उपाय देखें। आप बच्चों के बाहर खेलने, N95 मास्क, वेंटिलेशन समय या सस्ते घरेलू उपायों के बारे में भी पूछ सकते हैं।'
        if is_hi
        else f'About your question ("{snippet}"): for {city} at AQI {aqi} ({cat.label_en}), review your low-emission routine and indoor hacks above, or test swaps in the Impact Simulator. Feel free to ask specifically about kids playing outside, N95 masks, ventilation windows, cooking smoke, or budget indoor fixes.'
    )
    return ChatReply(answer=answer)
