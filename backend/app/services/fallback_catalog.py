"""Table-driven bilingual templates for deterministic fallback plans."""

from __future__ import annotations

from app.schemas import CommunityAction, CostLevel, IndoorHack, RoutineItem, UserProfile

_MORNING_BY_MODE: dict[str, tuple[tuple[str, str], tuple[str, str], tuple[str, str]]] = {
    "two_wheeler": (
        (
            "सुबह की दोपहिया यात्रा में फिटेड N95 पहनें और खिड़कियां बंद रखें",
            "Wear a sealed N95/FFP2 under your helmet and keep windows closed (6–10 AM)",
        ),
        (
            "सुबह 6–10 बजे सर्दियों के थर्मल इनवर्ज़न के कारण {city} में PM2.5 सबसे अधिक रहता है। हेलमेट के नीचे नाक-क्लिप वाला N95 पहनें, डीज़ल बसों के पीछे न रुकें और घर की खिड़कियां बंद रखें।",
            "Winter thermal inversion traps exhaust near street level between 6–10 AM in {city}. Wear a snug nose-clip N95 under your helmet, avoid idling behind diesel buses, and keep home windows closed.",
        ),
        (
            "सड़क के स्तर पर सांस के साथ जाने वाले PM2.5 को ~35–50% कम करता है और सुबह का स्मॉग घर में आने से रोकता है।",
            "Cuts inhaled roadside PM2.5 by ~35–50% during your ride and blocks morning inversion smog indoors.",
        ),
    ),
    "walk_cycle": (
        (
            "सुबह की पैदल/साइकिल यात्रा धीमी रखें, N95 पहनें और घर बंद रखें",
            "Pace morning walks/rides gently with an N95 and keep windows shut (6–10 AM)",
        ),
        (
            "सुबह 6–10 बजे {city} में थर्मल इनवर्ज़न सड़क पर धुआं रोके रखता है। शांत गलियां चुनें, फिटेड N95 पहनें और तीव्र व्यायाम दोपहर या घर के अंदर करें।",
            "Between 6–10 AM in {city}, winter inversion keeps exhaust at breathing height. Use quieter side streets with a fitted N95, avoid heavy morning cardio, and keep home windows sealed.",
        ),
        (
            "गहरी सांस से होने वाला PM2.5 प्रवेश कम होता है और आप शून्य वाहन उत्सर्जन के साथ सुरक्षित रहते हैं।",
            "Lowers deep-breathing PM2.5 intake while maintaining your zero-tailpipe commute.",
        ),
    ),
    "work_from_home": (
        (
            "सुबह 10 बजे तक खिड़कियां बंद रखें और गीले पोंछे से सफाई करें",
            "Keep windows shut until 10 AM and wet-mop your home workspace",
        ),
        (
            "घर से काम करते समय सुबह 10 बजे तक बालकनी और खिड़कियां बंद रखें। सूखी झाड़ू के बजाय गीले पोंछे से सफाई करें ताकि धूल दोबारा हवा में न उड़े।",
            "Keep balcony doors and windows sealed until 10 AM while winter inversion holds smog low. Use damp mopping instead of dry jhadu sweeping so settled dust is not kicked back into your workspace.",
        ),
        (
            "घर के अंदर धूल के दोबारा उड़ने और सुबह के स्मॉग रिसाव को ~25% कम करता है।",
            "Prevents indoor dust resuspension and blocks ~25% of morning smog infiltration.",
        ),
    ),
    "public_transport": (
        (
            "मेट्रो/बस स्टॉप की पैदल दूरी पर N95 पहनें और घर की खिड़कियां बंद रखें",
            "Wear an N95 on your metro/bus walk and keep home windows shut (6–10 AM)",
        ),
        (
            "मेट्रो या बस स्टॉप तक पैदल चलते समय फिटेड N95 मास्क पहनें और सुबह 6–10 बजे के इनवर्ज़न के दौरान घर की खिड़कियां बंद रखें।",
            "Wear a snugly fitted N95/FFP2 mask on your walk to the metro or bus stop where roadside exhaust spikes, and keep home windows closed during the 6–10 AM winter inversion.",
        ),
        (
            "लास्ट-माइल यात्रा में सड़क के PM2.5 से बचाता है और घर में सुबह का स्मॉग आने से रोकता है।",
            "Protects you from last-mile roadside PM2.5 spikes while keeping morning smog out of your home.",
        ),
    ),
}


def pick_lang(is_hi: bool, hi_text: str, en_text: str) -> str:
    return hi_text if is_hi else en_text


def build_morning_routine(profile: UserProfile, vulnerable: bool) -> RoutineItem:
    is_hi = profile.language == "hi"
    if profile.commute_mode == "car":
        extra_hi = "संवेदनशील सदस्यों की सुबह की सैर टालें।" if vulnerable else "दोपहर तक घर की खिड़कियां बंद रखें।"
        extra_en = (
            "Move school drop-offs indoors-to-car and skip morning outdoor walks for sensitive family members."
            if vulnerable
            else "Keep home windows closed until midday sunlight lifts the winter inversion layer."
        )
        return RoutineItem(
            time_slot="morning",
            title=pick_lang(is_hi, "कार AC को रीसर्कुलेशन मोड पर रखें और सुबह 6–10 बजे खिड़कियां बंद रखें", "Set car AC to recirculate and keep home windows shut (6–10 AM)"),
            detail=pick_lang(is_hi, f"सुबह की यात्रा में कार AC को रीसर्कुलेशन मोड पर रखें ताकि ट्रैफ़िक का धुआं केबिन में न घुसे। {extra_hi}", f"Switch your car cabin AC to recirculation mode in traffic so tailpipe fumes stay outside. {extra_en}"),
            impact_note=pick_lang(is_hi, "कार केबिन में बाहरी धुएं का प्रवेश ~40% घटता है और घर में सुबह का स्मॉग रुकता है।", "Cuts in-cabin exhaust spikes by ~40% and keeps morning inversion smog out of your home."),
        )
    spec = _MORNING_BY_MODE.get(profile.commute_mode, _MORNING_BY_MODE["public_transport"])
    return RoutineItem(
        time_slot="morning",
        title=pick_lang(is_hi, spec[0][0], spec[0][1]),
        detail=pick_lang(is_hi, spec[1][0], spec[1][1]).format(city=profile.city),
        impact_note=pick_lang(is_hi, spec[2][0], spec[2][1]),
    )


def _hack(is_hi: bool, hi: tuple[str, str, str], en: tuple[str, str, str], cost: CostLevel) -> IndoorHack:
    return IndoorHack(
        title=pick_lang(is_hi, hi[0], en[0]),
        how_to=pick_lang(is_hi, hi[1], en[1]),
        estimated_benefit=pick_lang(is_hi, hi[2], en[2]),
        cost_level=cost,
    )


def build_base_indoor_hacks(profile: UserProfile) -> list[IndoorHack]:
    is_hi = profile.language == "hi"
    seal_hi = ("बालकनी स्लाइडिंग डोर और मेन डोर की दरारें सील करें", "Weather-strip balcony sliding doors and entrance gaps")
    seal_en = ("बाहरी दरवाज़ों पर ड्राफ्ट स्टॉपर और खिड़कियों पर सील लगाएं", "Add door sweeps and window seals on road-facing rooms")
    seal_pair = seal_hi if profile.home_type == "apartment" else seal_en

    base = [
        _hack(is_hi, ("सूखी झाड़ू के बजाय गीला पोंछा (Wet Mopping)", "सुबह और शाम सूखी झाड़ू या डस्टिंग न करें—हल्के गीले माइक्रोफाइबर कपड़े या पोंछे से फर्श साफ करें।", "~20–30% कम उड़ती धूल (PM10/PM2.5)"), ("Switch from dry sweeping to wet mopping", "Replace dry jhadu sweeping and dry dusting with a damp microfiber mop or cloth once daily, especially near entryways.", "~20–30% less resuspended indoor dust (PM10/PM2.5)"), "free"),
        _hack(is_hi, ("घर में अगरबत्ती, धूप और मच्छर कॉइल से बचें", "बंद सर्दियों के कमरों में अगरबत्ती और कॉइल भारी PM2.5 छोड़ते हैं। मच्छरदानी या लिक्विड वेपोराइज़र चुनें और दीया जलाते समय एग्जॉस्ट चालू रखें।", "घर के भीतर के सबसे तेज़ PM2.5 उछाल से बचाव"), ("Skip incense sticks, dhoop, and mosquito coils indoors", "Burning incense or mosquito coils in closed winter rooms spikes indoor PM2.5 above outdoor smog. Use mosquito nets and run exhaust if lighting diyas.", "Eliminates sharp indoor smoke spikes (often 200–500 µg/m³)"), "free"),
        _hack(is_hi, (seal_pair[0], "हार्डवेयर की दुकान से ₹200–₹400 की EPDM फोम टेप लगाकर दरवाज़ों और खिड़कियों की दरारें बंद करें।", "~15% कम बाहरी स्मॉग रिसाव"), (seal_pair[1], "Apply inexpensive self-adhesive EPDM foam weather-stripping around loose window sashes and attach an under-door brush sweep.", "~15% lower outdoor smog seepage; doubles filtration efficiency"), "low"),
        _hack(is_hi, ("इंडोर पौधों पर भरोसा न करें — वास्तविक फ़िल्ट्रेशन चुनें", "अरेका पाम या स्नेक प्लांट अच्छे दिखते हैं, पर वैज्ञानिक परीक्षण बताते हैं कि वे कमरे का PM2.5 नाममात्र ही घटाते हैं। सीलिंग, गीले पोंछे और HEPA फ़िल्टर पर ध्यान दें।", "झूठी सुरक्षा से बचाव और सही उपायों पर बजट खर्च"), ("Don't rely on indoor plants for PM2.5 — use real filtration", "Houseplants like snake plant and areca palm remove negligible PM2.5 during severe urban smog. Prioritize airtight sealing and mechanical HEPA filtration.", "Prevents false confidence so your budget goes to real PM2.5 cuts"), "free"),
        _hack(is_hi, ("तड़के और तलने के समय किचन एग्जॉस्ट फैन चलाएं", "खाना पकाते समय रसोई का दरवाज़ा बंद रखें और एग्जॉस्ट फैन या चिमनी चलाकर तेल का धुआं बाहर निकालें।", "लिविंग रूम और बेडरूम में रसोई का PM2.5 फैलना रुकता है"), ("Run kitchen exhaust and keep the kitchen door closed while cooking", "Close the kitchen door and run an exhaust fan or chimney during tadka and frying so cooking aerosols do not drift into bedrooms.", "Prevents kitchen oil aerosols from spreading into living and sleeping rooms"), "free"),
    ]
    if profile.has_air_purifier:
        extra = [
            _hack(is_hi, ("प्यूरीफायर की सही जगह और हर 14 दिन में प्री-फ़िल्टर सफाई", "अपने प्यूरीफायर को दीवार से 30 सेमी दूर एक बंद बेडरूम में चलाएं (खुले हॉल में नहीं), और जालीदार प्री-फ़िल्टर को हर 14 दिन में साफ करें।", "एयरफ्लो (CADR) 25–35% बेहतर बना रहता है"), ("Optimize existing purifier placement & clean pre-filter fortnightly", "Place your existing purifier 30 cm away from walls in a closed bedroom (not an open hall) and vacuum the mesh pre-filter every 2 weeks; never wash paper HEPA.", "Maintains 25–35% higher clean-air delivery (CADR) during winter peaks"), "free"),
            _hack(is_hi, ("पोर्टेबल लेज़र PM2.5 मॉनिटर से रिसाव जांचें", "बेडरूम और रसोई में PM2.5 जांचकर समझें कि किस खिड़की से धुंध आ रही है और वेंटिलेशन कब सुरक्षित है।", "सटीक वेंटिलेशन समय और बिजली की बचत"), ("Spot hidden window drafts with a compact PM2.5 sensor", "Track indoor PM2.5 across rooms to detect leaky window frames and verify when indoor air drops below 35 µg/m³.", "Verifies clean indoor air (<35 µg/m³) and eliminates guesswork"), "medium"),
        ]
    else:
        extra = [
            _hack(is_hi, ("DIY बॉक्स-फैन + HEPA फ़िल्टर बनाएं (कम खर्च)", "एक टेबल या बॉक्स फैन के पीछे ₹1,200–₹2,000 का रिप्लेसमेंट True HEPA फ़िल्टर कार्डबोर्ड और डक्ट टेप से सील करके लगाएं।", "बंद बेडरूम में PM2.5 में ~50–70% कमी"), ("Build a DIY box-fan + HEPA filter (budget air cleaner)", "Seal a standard replacement True HEPA filter (₹1,200–₹2,000) snugly to the intake side of an existing box or table fan using cardboard shrouding.", "~50–70% bedroom PM2.5 drop at a quarter of retail cost"), "low"),
            _hack(is_hi, ("मुख्य बेडरूम के लिए True HEPA H13 प्यूरीफायर चुनें", "बिना आयनाइज़र वाला True HEPA H13 मॉडल चुनें जिसका CADR आपके कमरे के अनुसार 250–350 m³/hr हो।", "रात भर बंद कमरे में PM2.5 में ~70–85% कमी"), ("Add an ozone-free True HEPA H13 purifier for the main bedroom", "Choose an ozone-free True HEPA H13 unit sized to your bedroom (CADR 250–350 m³/hr) with affordable replacement filters.", "Reduces overnight bedroom PM2.5 by ~70–85% with doors shut"), "high"),
        ]
    return [*base, *extra]


def build_community_actions_list(profile: UserProfile, aqi: int) -> list[CommunityAction]:
    is_hi = profile.language == "hi"
    city = profile.city
    actions = [
        CommunityAction(
            title=pick_lang(is_hi, "RWA में अलाव की जगह गार्डों के लिए इलेक्ट्रिक हीटर और पत्तों की खाद", "Replace winter watchman bonfires with shared RWA electric heaters & leaf composting"),
            who="rwa",
            how_to=pick_lang(is_hi, f"{city} की RWA/सोसाइटी बैठक में गार्ड केबिन के लिए ₹1,500–₹2,500 का रूम हीटर और बगीचे के पत्तों के लिए खाद गड्ढा रखने का प्रस्ताव दें ताकि रात में आग न जलाई जाए।", f"Propose that your RWA/apartment association place low-watt electric heaters in security cabins and set up a leaf-compost pit so staff stop burning garden waste at night in {city}."),
            estimated_impact=pick_lang(is_hi, "~16% मोहल्ला-स्तरीय PM2.5 कमी और 50 घरों में ~1,400 किग्रा CO2/माह बचाव", "Cuts stagnant night-time block PM2.5 spikes (~16% local cut) and avoids ~1,400 kg CO2/mo across 50 homes."),
            effort="low",
        ),
        CommunityAction(
            title=pick_lang(is_hi, "पड़ोसियों के साथ 'नो-बर्निंग' अलर्ट और निर्माण धूल नियंत्रण ग्रुप", "Start a lane WhatsApp alert for wet construction cover and zero waste burning"),
            who="neighbours",
            how_to=pick_lang(is_hi, "आस-पास के 20–50 घरों के साथ कचरा न जलाने, सुबह सड़क पर हल्का पानी छिड़कने और निर्माण सामग्री को हरे कपड़े से ढकने की साझा सहमति बनाएं।", "Coordinate 20–50 neighboring households to report open trash fires cleanly, water-sprinkle dusty lanes instead of dry sweeping, and ask local builders to tarp sand/cement."),
            estimated_impact=pick_lang(is_hi, "आस-पास की धूल और स्थानीय धुएं में तुरंत कमी", "Prevents sudden neighborhood PM10/PM2.5 spikes within your immediate residential lane."),
            effort="low",
        ),
    ]
    if profile.has_children or aqi >= 201:
        actions.append(CommunityAction(
            title=pick_lang(is_hi, "स्कूलों में उच्च AQI पर इनडोर खेल और कारपूल ड्रॉप-ऑफ नियम", "Request an AQI-triggered indoor recess & anti-idling carpool zone at local schools"),
            who="school",
            how_to=pick_lang(is_hi, "अभिभावक समूह के माध्यम से स्कूल को AQI >= 201 होने पर सुबह की असेंबली व खेल हॉल के अंदर करने और गेट के बाहर इंजन बंद रखने की सलाह दें।", "Encourage your PTA/school group to shift assemblies and sports indoors whenever CPCB AQI exceeds 200 and adopt engine-off + shared carpool pick-up lanes."),
            estimated_impact=pick_lang(is_hi, "बच्चों के पीक-आवर PM2.5 संपर्क में भारी कमी", "Shields students from 6–10 AM peak inversion fumes and cuts school-gate tailpipe exhaust."),
            effort="medium",
        ))
    else:
        actions.append(CommunityAction(
            title=pick_lang(is_hi, "दफ़्तर में हाइब्रिड स्मॉग डेज़ और सहकर्मी कारपूल बोर्ड", "Organize a workplace smog-day WFH policy and route carpool board"),
            who="workplace",
            how_to=pick_lang(is_hi, f"AQI {aqi}+ जैसे खराब दिनों में वैकल्पिक वर्क-फ्रॉम-होम और एक ही रूट के साथियों की साप्ताहिक कारपूल शीट शुरू करें।", f"Ask your workplace HR/team to allow flexible WFH during Severe AQI episodes and maintain a corridor carpool/metro-buddy sheet in {city}."),
            estimated_impact=pick_lang(is_hi, "प्रत्येक भागीदार से प्रति माह ~34–62 किग्रा CO2 बचाव", "Saves ~34–62 kg CO2/month per participating commuter while trimming peak rush-hour emissions."),
            effort="medium",
        ))
    return actions
