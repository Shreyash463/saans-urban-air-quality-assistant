import { getAqiCategory } from '../lib/aqi';
import { getAlternativeMetrics } from '../lib/impactFactors';
import { sanitizeCity } from '../lib/validation';
import type {
  AirQualityReading,
  Alternative,
  BudgetLevel,
  ChatReply,
  IndoorHack,
  PlanResponse,
  RoutineItem,
  UserProfile,
} from '../types';
import { generateSmartMockChatReply } from './mockChat';

interface DemoCityEntry {
  displayName: string;
  aqi: number;
  dominantPollutant: string;
}

const DEMO_CITY_TABLE: Readonly<Record<string, DemoCityEntry>> = {
  delhi: { displayName: 'Delhi', aqi: 380, dominantPollutant: 'PM2.5' },
  'new delhi': { displayName: 'New Delhi', aqi: 380, dominantPollutant: 'PM2.5' },
  lucknow: { displayName: 'Lucknow', aqi: 310, dominantPollutant: 'PM2.5' },
  kolkata: { displayName: 'Kolkata', aqi: 240, dominantPollutant: 'PM2.5' },
  mumbai: { displayName: 'Mumbai', aqi: 150, dominantPollutant: 'PM10' },
  pune: { displayName: 'Pune', aqi: 130, dominantPollutant: 'PM10' },
  noida: { displayName: 'Noida', aqi: 365, dominantPollutant: 'PM2.5' },
  gurugram: { displayName: 'Gurugram', aqi: 350, dominantPollutant: 'PM2.5' },
  patna: { displayName: 'Patna', aqi: 295, dominantPollutant: 'PM2.5' },
  bengaluru: { displayName: 'Bengaluru', aqi: 95, dominantPollutant: 'PM10' },
  chennai: { displayName: 'Chennai', aqi: 110, dominantPollutant: 'PM10' },
};

const UNKNOWN_CITY_AQI = 160;

/** Quick-pick demo cities displayed in the profile form. */
export const QUICK_PICK_CITIES: readonly string[] = [
  'Delhi',
  'Mumbai',
  'Pune',
  'Lucknow',
  'Kolkata',
];

/**
 * Deterministic lookup of a city's demo AQI reading.
 * Returns fixed values for known Indian cities and 160 for unknown cities.
 */
export function getMockAirQuality(city: string): AirQualityReading {
  const cleaned = sanitizeCity(city) || 'Delhi';
  const normalized = cleaned.toLowerCase();
  const entry = DEMO_CITY_TABLE[normalized];

  if (entry) {
    return {
      city: entry.displayName,
      aqi: entry.aqi,
      dominantPollutant: entry.dominantPollutant,
      updatedAt: '',
      source: 'demo',
      sourceDetail: 'Sample reading',
    };
  }

  return {
    city: cleaned,
    aqi: UNKNOWN_CITY_AQI,
    dominantPollutant: 'PM2.5',
    updatedAt: '',
    source: 'demo',
    sourceDetail: 'Sample reading',
  };
}

function sortHacksByBudget(hacks: IndoorHack[], budget: BudgetLevel): IndoorHack[] {
  const rankMap: Record<BudgetLevel, Record<IndoorHack['costLevel'], number>> = {
    low: { free: 0, low: 1, medium: 2, high: 3 },
    medium: { low: 0, free: 1, medium: 2, high: 3 },
    high: { high: 0, medium: 1, low: 2, free: 3 },
  };
  const order = rankMap[budget];
  return [...hacks].sort((a, b) => order[a.costLevel] - order[b.costLevel]);
}

function buildRoutine(profile: UserProfile, aqi: number): RoutineItem[] {
  const isHi = profile.language === 'hi';
  const isHighSmog = aqi >= 201;
  const isVulnerable =
    profile.hasChildren || profile.hasElderly || profile.hasRespiratoryCondition;

  let morningTitle: string;
  let morningDetail: string;
  let morningImpact: string;

  if (profile.commuteMode === 'two_wheeler') {
    morningTitle = isHi
      ? 'सुबह की दोपहिया यात्रा में फिटेड N95 पहनें और खिड़कियां बंद रखें'
      : 'Wear a sealed N95/FFP2 under your helmet and keep windows closed (6–10 AM)';
    morningDetail = isHi
      ? `सुबह 6–10 बजे सर्दियों के थर्मल इनवर्ज़न के कारण ${profile.city} में PM2.5 सबसे अधिक रहता है। हेलमेट के नीचे नाक-क्लप वाला N95 पहनें, डीज़ल बसों के पीछे न रुकें और घर की खिड़कियां बंद रखें।`
      : `Winter thermal inversion traps exhaust near street level between 6–10 AM in ${profile.city}. Wear a snug nose-clip N95 under your helmet, avoid idling behind diesel buses, and keep home windows closed.`;
    morningImpact = isHi
      ? 'सड़क के स्तर पर सांस के साथ जाने वाले PM2.5 को ~35–50% कम करता है और सुबह का स्मॉग घर में आने से रोकता है।'
      : 'Cuts inhaled roadside PM2.5 by ~35–50% during your ride and blocks morning inversion smog indoors.';
  } else if (profile.commuteMode === 'walk_cycle') {
    morningTitle = isHi
      ? 'सुबह की पैदल/साइकिल यात्रा धीमी रखें, N95 पहनें और घर बंद रखें'
      : 'Pace morning walks/rides gently with an N95 and keep windows shut (6–10 AM)';
    morningDetail = isHi
      ? `सुबह 6–10 बजे ${profile.city} में थर्मल इनवर्ज़न सड़क पर धुआं रोके रखता है। शांत गलियां चुनें, फिटेड N95 पहनें और तीव्र व्यायाम दोपहर या घर के अंदर करें।`
      : `Between 6–10 AM in ${profile.city}, winter inversion keeps exhaust at breathing height. Use quieter side streets with a fitted N95, avoid heavy morning cardio, and keep home windows sealed.`;
    morningImpact = isHi
      ? 'गहरी सांस से होने वाला PM2.5 प्रवेश कम होता है और आप शून्य वाहन उत्सर्जन के साथ सुरक्षित रहते हैं।'
      : 'Lowers deep-breathing PM2.5 intake while maintaining your zero-tailpipe commute.';
  } else if (profile.commuteMode === 'car') {
    morningTitle = isHi
      ? 'कार AC को रीसर्कुलेशन मोड पर रखें और सुबह 6–10 बजे खिड़कियां बंद रखें'
      : 'Set car AC to recirculate and keep home windows shut (6–10 AM)';
    morningDetail = isHi
      ? `ऑफिस जाते समय कार AC को रीसर्कुलेशन मोड पर रखें ताकि बाहर का स्मॉग केबिन में न घुसे। ${
          isVulnerable
            ? 'घर के संवेदनशील सदस्यों की सुबह की सैर टालें।'
            : 'दोपहर तक घर की खिड़कियां बंद रखें।'
        }`
      : `Switch your car cabin AC to recirculation mode in traffic so tailpipe fumes stay outside. ${
          isVulnerable
            ? 'Move school drop-offs indoors-to-car and skip morning outdoor walks for sensitive family members.'
            : 'Keep home windows closed until midday sunlight breaks the winter inversion layer.'
        }`;
    morningImpact = isHi
      ? 'केबिन में बाहरी धुएं का प्रवेश ~40% घटता है और घर में सुबह का स्मॉग रुकता है।'
      : 'Cuts in-cabin exhaust spikes by ~40% and keeps morning inversion smog out of your home.';
  } else if (profile.commuteMode === 'work_from_home') {
    morningTitle = isHi
      ? 'सुबह 10 बजे तक खिड़कियां बंद रखें और गीले पोंछे से सफाई करें'
      : 'Keep windows shut until 10 AM and wet-mop your home workspace';
    morningDetail = isHi
      ? 'घर से काम करते समय सुबह 10 बजे तक बालकनी और खिड़कियां बंद रखें। सूखी झाड़ू के बजाय गीले पोंछे से सफाई करें ताकि धूल हवा में न उड़े।'
      : 'Keep windows sealed until 10 AM while winter inversion holds smog low. Use wet mopping instead of dry jhadu sweeping so settled fine dust is not kicked back into your workspace.';
    morningImpact = isHi
      ? 'घर के अंदर धूल के दोबारा उड़ने और सुबह के स्मॉग रिसाव को ~25% कम करता है।'
      : 'Prevents indoor dust resuspension and blocks ~25% of morning smog infiltration.';
  } else {
    // public_transport: coherent title, detail, and impactNote without claiming private tailpipe elimination
    morningTitle = isHi
      ? 'मेट्रो/बस स्टॉप की पैदल दूरी पर N95 पहनें और घर की खिड़कियां बंद रखें'
      : 'Wear an N95 on your metro/bus walk and keep home windows shut (6–10 AM)';
    morningDetail = isHi
      ? 'मेट्रो या बस स्टॉप तक पैदल चलते समय फिटेड N95 मास्क पहनें और सुबह 6–10 बजे के इनवर्ज़न के दौरान घर की खिड़कियां बंद रखें।'
      : 'Wear a snugly fitted N95/FFP2 mask on the walk to the metro or bus stop where roadside exhaust spikes, and keep home windows closed during the 6–10 AM winter inversion.';
    morningImpact = isHi
      ? 'लास्ट-माइल पैदल यात्रा में सड़क के PM2.5 से बचाता है और घर में सुबह का स्मॉग आने से रोकता है।'
      : 'Protects you from last-mile roadside PM2.5 spikes while keeping morning smog out of your home.';
  }

  const middayTitle = isHi
    ? 'दोपहर 1–4 बजे 20 मिनट क्रॉस-वेंटिलेशन करें'
    : 'Ventilate your home for 20 minutes during the 1–4 PM AQI dip';
  const middayDetail =
    profile.homeType === 'apartment'
      ? isHi
        ? 'दोपहर में धूप से हवा ऊपर उठती है और AQI दिन का सबसे निचला स्तर छूता है। फ्लैट के विपरीत किनारों की खिड़कियां 15–20 मिनट खोलकर अंदर जमा CO2 और खाना पकाने का धुआं बाहर निकालें।'
        : 'Afternoon warmth lifts the inversion layer, making 1–4 PM the cleanest window of the day. Open opposite apartment windows for 15–20 minutes to flush trapped indoor CO2 and kitchen fumes.'
      : isHi
        ? 'दोपहर 1–4 बजे जब सड़क की धूल और स्मॉग थोड़ा कम हो, ऊपरी मंजिल या बगीचे की तरफ की खिड़कियां खोलें। सड़क के ठीक सामने के दरवाज़े सीमित समय के लिए खोलें।'
        : 'Between 1–4 PM, open courtyard or upper-floor windows away from the main street for 15–20 minutes to refresh stale indoor air without pulling in ground-level road dust.';
  const middayImpact = isHi
    ? 'घर में फंसी बासी हवा और रसोई के धुएं को बाहर निकालता है बिना सुबह-शाम का स्मॉग लाए।'
    : 'Flushes indoor CO2 and cooking aerosols during the lowest-AQI window of the day.';

  const eveningTitle = isHi
    ? 'शाम 5:30 बजे तक खिड़कियां सील करें और रसोई का धुआं नियंत्रित रखें'
    : 'Seal windows by 5:30 PM and minimize evening indoor smoke';
  const eveningDetail = isHi
    ? `सूर्यास्त के बाद तापमान गिरते ही पराली और ट्रैफ़िक का धुआं फिर ज़मीन के पास जमने लगता है। ${
        profile.cookingFuel === 'biomass_wood'
          ? 'चूल्हे/लकड़ी का धुआं कमरे में न फैलने दें; खाना बनाते समय पूरी निकासी रखें और LPG/इंडक्शन पर शिफ्ट होने की योजना बनाएं।'
          : 'तड़का या तलने के समय एग्जॉस्ट फैन/चिमनी चलाएं और अगरबत्ती/धूप जलाने से बचें।'
      }`
    : `As evening temperatures drop, winter inversion returns and traffic plus seasonal stubble smoke sinks back to breathing height. ${
        profile.cookingFuel === 'biomass_wood'
          ? 'Keep solid-fuel cooking strictly ventilated outdoors or under a hood, and avoid indoor smoke buildup.'
          : 'Run the kitchen exhaust fan during tadka or frying, and skip incense sticks (agarbatti) or dhoop indoors.'
      }`;
  const eveningImpact = isHi
    ? 'शाम के पीक स्मॉग और रसोई/अगरबत्ती से होने वाले PM2.5 उछाल को रोकता है।'
    : 'Prevents indoor PM2.5 spikes from evening inversion, tadka smoke, and incense.';

  const nightTitle = profile.hasAirPurifier
    ? isHi
      ? 'बेडरूम का दरवाज़ा बंद कर अपना HEPA प्यूरीफायर रात भर चलाएं'
      : 'Run your existing HEPA purifier in a closed bedroom all night'
    : isHi
      ? 'बेडरूम के दरवाज़े के नीचे गीला तौलिया/ड्राफ्ट स्टॉपर लगाएं'
      : 'Create a sealed low-smog sleep zone in the bedroom';
  const nightDetail = profile.hasAirPurifier
    ? isHi
      ? 'सोने से 30 मिनट पहले प्यूरीफायर को हाई स्पीड पर चलाएं, फिर रात भर साइलेंट/मीडियम मोड पर रखें। हर 2 सप्ताह में प्री-फ़िल्टर वैक्यूम या गीले कपड़े से साफ करें।'
      : 'Run your purifier on high 30 minutes before bedtime to pull bedroom PM2.5 down, then keep it on sleep/medium overnight with doors shut. Vacuum the pre-filter every 2 weeks during winter smog.'
    : isHi
      ? `बेडरूम के दरवाज़े की दरार को ड्राफ्ट स्टॉपर या मुड़े हुए तौलिये से बंद रखें और सोने से पहले गीला पोंछा लगाएं।${
          isHighSmog ? ' उच्च AQI के दिनों में DIY बॉक्स-फैन + HEPA फ़िल्टर का उपयोग करें।' : ''
        }`
      : `Close bedroom doors tightly and block under-door slits with a rolled towel or foam weather-strip. Wet-wipe surfaces before bed so overnight breathing stays cleaner.${
          isHighSmog
            ? ' On Poor or worse winter nights, consider a DIY box-fan + HEPA filter in the main bedroom.'
            : ''
        }`;
  const nightImpact = profile.hasAirPurifier
    ? isHi
      ? '8 घंटे की नींद में साफ हवा मिलने से पूरे 24 घंटे का PM2.5 संपर्क ~42% तक घटता है।'
      : '8 hours of clean sleep air cuts total 24-hour personal PM2.5 exposure by ~42%.'
    : isHi
      ? 'रात भर बाहर से आने वाले धुएं का रिसाव ~15–20% तक कम होता है।'
      : 'Reduces overnight outdoor smog seepage into your sleeping space by ~15–20%.';

  return [
    {
      timeSlot: 'morning',
      title: morningTitle,
      detail: morningDetail,
      impactNote: morningImpact,
    },
    {
      timeSlot: 'midday',
      title: middayTitle,
      detail: middayDetail,
      impactNote: middayImpact,
    },
    {
      timeSlot: 'evening',
      title: eveningTitle,
      detail: eveningDetail,
      impactNote: eveningImpact,
    },
    {
      timeSlot: 'night',
      title: nightTitle,
      detail: nightDetail,
      impactNote: nightImpact,
    },
  ];
}

function buildIndoorHacks(profile: UserProfile): IndoorHack[] {
  const isHi = profile.language === 'hi';
  const hacks: IndoorHack[] = [
    {
      title: isHi
        ? 'सूखी झाड़ू के बजाय गीला पोंछा (Wet Mopping)'
        : 'Switch from dry sweeping to wet mopping',
      howTo: isHi
        ? 'सुबह और शाम सूखी झाड़ू या डस्टिंग न करें—हल्के गीले माइक्रोफाइबर कपड़े या पोंछे से फर्श और टेबल साफ करें।'
        : 'Replace dry jhadu sweeping and dry dusting with a damp microfiber mop or cloth once daily, especially near entryways.',
      estimatedBenefit: isHi
        ? 'घर के अंदर उड़ने वाली PM10/PM2.5 धूल में ~20–30% कमी'
        : '~20–30% less resuspended indoor dust (PM10/PM2.5)',
      costLevel: 'free',
    },
    {
      title: isHi
        ? 'घर में अगरबत्ती, धूप और मच्छर कॉइल से बचें'
        : 'Skip incense sticks, dhoop, and mosquito coils indoors',
      howTo: isHi
        ? 'बंद सर्दियों के कमरों में अगरबत्ती और कॉइल भारी PM2.5 छोड़ते हैं। मच्छरदानी या लिक्विड वेपोराइज़र का उपयोग करें और पूजा के समय एग्जॉस्ट चालू रखें।'
        : 'Burning incense or mosquito coils in closed winter rooms spikes indoor PM2.5 above outdoor smog levels. Use mosquito nets and keep exhaust running if lighting diyas.',
      estimatedBenefit: isHi
        ? 'घर के भीतर के सबसे तेज़ PM2.5 उछाल से पूर्ण बचाव'
        : 'Eliminates sharp indoor smoke spikes (often 200–500 µg/m³)',
      costLevel: 'free',
    },
    {
      title:
        profile.homeType === 'apartment'
          ? isHi
            ? 'बालकनी स्लाइडिंग डोर और मेन डोर की दरारें सील करें'
            : 'Weather-strip balcony sliding doors and entrance gaps'
          : isHi
            ? 'बाहरी दरवाज़ों पर ड्राफ्ट स्टॉपर और जाली पर बारीक मेश लगाएं'
            : 'Add door sweeps and window seals on road-facing rooms',
      howTo: isHi
        ? 'हार्डवेयर की दुकान से ₹200–₹400 की सेल्फ-एडहेसिव फोम टेप (EPDM) लगाकर दरवाज़ों और खिड़कियों के बीच के गैप बंद करें।'
        : 'Apply inexpensive self-adhesive EPDM foam weather-stripping around loose window sashes and attach an under-door brush sweep.',
      estimatedBenefit: isHi
        ? 'बाहरी स्मॉग रिसाव में ~15% कमी और फ़िल्ट्रेशन में सुधार'
        : '~15% lower outdoor smog seepage; doubles filtration efficiency',
      costLevel: 'low',
    },
    {
      title: isHi
        ? 'इंडोर पौधों पर भरोसा न करें — व्यावहारिक फ़िल्ट्रेशन चुनें'
        : "Don't rely on indoor plants for PM2.5 — use real filtration",
      howTo: isHi
        ? 'अरेका पाम या स्नेक प्लांट अच्छे दिखते हैं, लेकिन शोध बताते हैं कि वे कमरे के PM2.5 को नाममात्र ही कम करते हैं। सफाई के लिए गीला पोंछा, सीलिंग और HEPA फ़िल्टर पर निर्भर रहें।'
        : 'Snake plants and areca palms are great for mood, but real-world tests show they remove negligible PM2.5 during severe smog. Prioritize airtight sealing and mechanical HEPA filtration.',
      estimatedBenefit: isHi
        ? 'झूठी सुरक्षा से बचाव और सही उपायों में बजट का उपयोग'
        : 'Prevents false confidence so your budget goes to real PM2.5 cuts',
      costLevel: 'free',
    },
    {
      title: isHi
        ? 'तड़के और तलने के समय किचन एग्जॉस्ट फैन चलाएं'
        : 'Run kitchen exhaust and keep the kitchen door closed while cooking',
      howTo: isHi
        ? 'खाना पकाते समय रसोई का दरवाज़ा बंद रखें और एग्जॉस्ट फैन या चिमनी चलाकर तेल का धुआं बाहर निकालें।'
        : 'Close the kitchen door and run an exhaust fan or chimney during tadka and frying so cooking aerosols do not drift into bedrooms.',
      estimatedBenefit: isHi
        ? 'लिविंग रूम और बेडरूम में रसोई का PM2.5 फैलना रुकता है'
        : 'Prevents kitchen oil aerosols from spreading into living and sleeping rooms',
      costLevel: 'free',
    },
  ];

  if (profile.hasAirPurifier) {
    hacks.push({
      title: isHi
        ? 'मौजूदा प्यूरीफायर की सही जगह और हर 14 दिन में प्री-फ़िल्टर सफाई'
        : 'Optimize your existing purifier placement & clean pre-filter fortnightly',
      howTo: isHi
        ? 'प्यूरीफायर को दीवार से कम से कम 1 फुट दूर रखें, केवल एक बंद बेडरूम में चलाएं, और जमे हुए काले धूल कणों को प्री-फ़िल्टर से नियमित साफ करें (HEPA को पानी से न धोएं)।'
        : 'Place your existing purifier 30 cm away from walls in a single closed bedroom (not an open hall), and gently vacuum the mesh pre-filter fortnightly. Never wash the paper HEPA cartridge.',
      estimatedBenefit: isHi
        ? 'एयरफ्लो (CADR) को 25–35% तक बनाए रखता है और फ़िल्टर की उम्र बढ़ाता है'
        : 'Maintains 25–35% higher airflow (CADR) through winter smog peak',
      costLevel: 'free',
    });
    hacks.push({
      title: isHi
        ? 'पोर्टेबल PM2.5 मॉनिटर से घर के अंदर की हवा जांचें'
        : 'Track indoor PM2.5 with a compact laser sensor',
      howTo: isHi
        ? 'रसोई और बेडरूम में PM2.5 जांचकर समझें कि किस खिड़की से रिसाव हो रहा है और प्यूरीफायर की स्पीड कब कम करनी है।'
        : 'Spot hidden drafts and cooking plumes quickly so you know exactly when to boost purifier speed or open windows safely.',
      estimatedBenefit: isHi
        ? 'सटीक वेंटिलेशन समय और बिजली की बचत'
        : 'Verifies clean indoor air (<35 µg/m³) and prevents guesswork',
      costLevel: 'medium',
    });
  } else {
    hacks.push({
      title: isHi
        ? 'DIY बॉक्स-फैन + HEPA फ़िल्टर (Corsi-Rosenthal तरीका)'
        : 'Build a DIY box-fan + HEPA filter (budget air cleaner)',
      howTo: isHi
        ? 'एक साधारण टेबल/एग्जॉस्ट फैन के पीछे रिप्लेसमेंट HEPA फ़िल्टर (₹1,200–₹2,000) को कार्डबोर्ड और डक्ट टेप से सील करके लगाएं। यह कम खर्च में कमरे का PM2.5 तेजी से घटाता है।'
        : 'Tape a standard replacement True HEPA filter (₹1,200–₹2,000) snugly to the intake side of a box or table fan using cardboard shrouding. Delivers real bedroom filtration at a fraction of retail cost.',
      estimatedBenefit: isHi
        ? 'बंद बेडरूम में PM2.5 में ~50–70% कमी (अनुमानित)'
        : '~50–70% bedroom PM2.5 drop at 1/4th the cost of a retail unit',
      costLevel: 'low',
    });
    hacks.push({
      title: isHi
        ? 'मुख्य बेडरूम के लिए True HEPA H13 प्यूरीफायर लें'
        : 'Add a True HEPA H13 air purifier for the main bedroom',
      howTo: isHi
        ? 'बिना आयनाइज़र (ozone-free) वाला True HEPA H13 मॉडल चुनें जिसका CADR आपके कमरे के क्षेत्रफल के अनुरूप हो (कम से कम 250–350 m³/hr)।'
        : 'Choose a simple ozone-free True HEPA H13 unit sized to your bedroom (CADR 250–350 m³/hr) with affordable replacement filters.',
      estimatedBenefit: isHi
        ? 'रात में 8 घंटे के लिए बेडरूम का PM2.5 70–85% तक कम करता है'
        : 'Reduces overnight bedroom PM2.5 by ~70–85% with doors shut',
      costLevel: 'high',
    });
  }

  return sortHacksByBudget(hacks, profile.budget);
}

function buildAlternatives(profile: UserProfile): Alternative[] {
  const isHi = profile.language === 'hi';
  const swaps: Alternative[] = [];

  if (profile.commuteMode === 'car') {
    const m = getAlternativeMetrics('commute_car_to_transit', profile.commuteKm);
    swaps.push({
      current: isHi
        ? `रोज़ाना ${profile.commuteKm} किमी अकेले कार चलाना`
        : `Solo private car commute (${profile.commuteKm} km/day)`,
      swap: isHi
        ? 'सप्ताह में 3 दिन मेट्रो/बस या ऑफिस कारपूल + नियमित PUC जांच'
        : 'Take metro/bus or carpool 3 days/week + stay current on PUC checks',
      why: isHi
        ? 'सर्दियों में धीमी गति से चलती कारें प्रति यात्री सबसे अधिक NO2 और PM2.5 छोड़ती हैं; शेयरिंग से तुरंत ट्रैफ़िक धुआं घटता है।'
        : 'Idling urban cars emit heavy NO2 and fine brake/exhaust dust per passenger; sharing rides immediately cuts corridor emissions and fuel costs.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  } else if (profile.commuteMode === 'two_wheeler') {
    const m = getAlternativeMetrics(
      'commute_two_wheeler_to_transit',
      profile.commuteKm
    );
    swaps.push({
      current: isHi
        ? `रोज़ाना ${profile.commuteKm} किमी पेट्रोल दोपहिया यात्रा`
        : `Daily petrol two-wheeler ride (${profile.commuteKm} km/day)`,
      swap: isHi
        ? 'उच्च-AQI दिनों में मेट्रो/AC बस चुनें या इलेक्ट्रिक स्कूटर पर विचार करें'
        : 'Switch to metro/AC bus on Poor+ AQI days or plan an EV two-wheeler upgrade',
      why: isHi
        ? 'दोपहिया सवार सीधे बसों और कारों के एग्जॉस्ट की ऊंचाई पर सांस लेते हैं। मेट्रो/बस में आपका PM2.5 संपर्क और उत्सर्जन दोनों घटते हैं।'
        : 'Two-wheeler riders breathe directly at tailpipe height; shifting high-smog commutes to metro or AC bus protects your lungs and cuts urban emissions.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  } else {
    // Already uses low-emission commute: suggest N95 mask protection (PM2.5 only, CO2 = 0)
    const m = getAlternativeMetrics('fitted_n95_mask', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'बाहरी काम या लास्ट-माइल यात्रा में कपड़े/सर्जिकल मास्क पहनना'
        : 'Wearing cloth or loose surgical masks on outdoor walks and transit legs',
      swap: isHi
        ? 'Poor+ दिनों में नाक की क्लिप वाला फिटेड N95/FFP2 मास्क पहनें'
        : 'Switch to a snugly fitted N95/FFP2 respirator on Poor+ days',
      why: isHi
        ? 'आप पहले से कम-उत्सर्जन यात्रा अपना रहे हैं; फिटेड N95 लास्ट-माइल सड़क धूल के 90% से अधिक PM2.5 को रोक देता है।'
        : 'Your commute already avoids private tailpipe emissions; a snug N95/FFP2 blocks >90% of fine PM2.5 during walking and transit legs.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  }

  if (profile.cookingFuel === 'biomass_wood') {
    const m = getAlternativeMetrics('cooking_biomass_to_clean', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'लकड़ी, उपले या कोयले के चूल्हे पर खाना बनाना'
        : 'Cooking on wood, biomass, or coal chulha',
      swap: isHi
        ? 'LPG सिलेंडर (उज्ज्वला/सब्सिडी) या इंडक्शन कुकटॉप पर शिफ्ट करें'
        : 'Transition to LPG (Ujjwala/domestic) or a single-burner induction cooktop',
      why: isHi
        ? 'घर के अंदर बायोमास का धुआं किसी भी बाहरी स्मॉग से कई गुना अधिक हानिकारक PM2.5 पैदा करता है—यह सबसे बड़ा स्वास्थ्य सुधार है।'
        : 'Indoor biomass smoke produces PM2.5 levels far higher than outdoor winter smog; switching to LPG or induction is the single largest health win for your family.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  } else if (profile.cookingFuel === 'lpg' || profile.cookingFuel === 'piped_gas') {
    const m = getAlternativeMetrics('cooking_gas_to_induction', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'उबालने, चाय और धीमी आंच के सभी काम गैस बर्नर पर करना'
        : 'Using gas burners for boiling water, tea, and long simmering',
      swap: isHi
        ? 'चाय/पानी के लिए इलेक्ट्रिक केतली या इंडक्शन + प्रेशर कुकर और एग्जॉस्ट का उपयोग'
        : 'Use an electric kettle/induction burner for boiling + keep lids on & run exhaust',
      why: isHi
        ? 'बंद सर्दियों की रसोई में गैस की लौ NO2 और बारीक कण बढ़ाती है। इंडक्शन/केतली से रसोई की हवा साफ रहती है और गैस बचती है।'
        : 'Open gas flames add indoor NO2 and ultrafine particles in sealed winter kitchens; moving boiling tasks to electric induction cleans kitchen air and lowers gas bills.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  } else {
    // Already uses induction_electric: ventilation-only swap, CO2 = 0
    const m = getAlternativeMetrics('cooking_ventilation_only', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'अधिक धुएं वाला डीप-फ्राइंग बिना चिमनी/एग्जॉस्ट के'
        : 'High-heat oil frying without kitchen ventilation',
      swap: isHi
        ? 'इंडक्शन पर पकाते समय एग्जॉस्ट चलाएं और भाप/प्रेशर कुकिंग चुनें'
        : 'Run exhaust fan during tadka/frying and favor steaming or pressure cooking',
      why: isHi
        ? 'इंडक्शन पहले से ही सबसे स्वच्छ ईंधन है; तेल के धुएं को नियंत्रित करने से रसोई में PM2.5 स्तर न्यूनतम रहता है।'
        : 'Induction already eliminates combustion fumes; venting cooking oil aerosols keeps your kitchen PM2.5 near baseline.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  }

  if (!profile.hasAirPurifier) {
    const m = getAlternativeMetrics('bedroom_purifier', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'रात भर बिना फ़िल्ट्रेशन वाले कमरे में सोना'
        : 'Sleeping 8 hours in an unfiltered bedroom during winter smog',
      swap: isHi
        ? 'बंद बेडरूम में DIY बॉक्स-फैन + HEPA फ़िल्टर या True HEPA प्यूरीफायर चलाएं'
        : 'Run a DIY box-fan + True HEPA filter (or HEPA H13 unit) in a closed bedroom overnight',
      why: isHi
        ? '8 घंटे साफ हवा में सोने से पूरे 24 घंटे में सांस के साथ जाने वाला PM2.5 लगभग आधा हो जाता है।'
        : 'Eight hours of filtered sleep air gives lungs overnight recovery and sharply reduces your 24-hour personal PM2.5 dose.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  } else {
    const m = getAlternativeMetrics('seal_door_gaps', profile.commuteKm);
    swaps.push({
      current: isHi
        ? 'खुली दरारों वाले कमरों में एयर प्यूरीफायर चलाना'
        : 'Running your air purifier in rooms with unsealed door and window gaps',
      swap: isHi
        ? 'दरवाज़ों और खिड़कियों पर EPDM फोम टेप व ड्राफ्ट स्टॉपर लगाएं'
        : 'Seal door and window gaps with EPDM weather-stripping and under-door sweeps',
      why: isHi
        ? 'आपका मौजूदा प्यूरीफायर तभी सबसे अच्छा काम करता है जब बाहर का स्मॉग दरारों से अंदर न घुसे।'
        : 'Since you already own a purifier, sealing leaky frames blocks incoming haze and helps your purifier clean faster with less filter wear.',
      pm25ReductionPct: m.pm25ReductionPct,
      co2SavedKgPerMonth: m.co2SavedKgPerMonth,
    });
  }

  const wasteMetrics = getAlternativeMetrics('stop_waste_burning', profile.commuteKm);
  swaps.push({
    current: isHi
      ? 'सर्दियों में सूखे पत्ते/कचरा जलाना या दिवाली पर पटाखे फोड़ना'
      : 'Burning dry garden leaves/waste or bursting firecrackers in winter',
    swap: isHi
      ? 'सूखे पत्तों की खाद (कम्पोस्ट) बनाएं, RWA के साथ खुले में आग रोकें, और दीयों/लाइट्स से उत्सव मनाएं'
      : 'Compost dry leaves, ask your RWA/guards to use electric heaters instead of bonfires, and celebrate with diyas/LEDs',
    why: isHi
      ? 'ठंडी शांत हवा में एक छोटा-सा कचरे का ढेर भी पूरे मोहल्ले का AQI कई घंटे तक बढ़ा देता है।'
      : 'On still winter nights, even a single neighborhood leaf or trash fire spikes PM2.5 across an entire residential block for hours.',
    pm25ReductionPct: wasteMetrics.pm25ReductionPct,
    co2SavedKgPerMonth: wasteMetrics.co2SavedKgPerMonth,
  });

  return swaps;
}

function buildHealthAdvisory(profile: UserProfile, aqi: number): string {
  const isHi = profile.language === 'hi';
  const category = getAqiCategory(aqi);
  const sentences: string[] = [];

  if (aqi >= 401) {
    sentences.push(
      isHi
        ? `वायु गुणवत्ता गंभीर स्तर (${category.label.hi}, AQI ${aqi}) पर है, जो स्वस्थ लोगों और संवेदनशील वर्गों दोनों को प्रभावित करती है।`
        : `Air quality is Severe (AQI ${aqi}), which affects healthy adults and poses serious risk to sensitive groups.`
    );
  } else if (aqi >= 301) {
    sentences.push(
      isHi
        ? `वायु गुणवत्ता बहुत खराब (${category.label.hi}, AQI ${aqi}) है, जिससे लंबे समय तक बाहर रहने पर श्वसन दबाव बढ़ सकता है।`
        : `Air quality is Very Poor (AQI ${aqi}), increasing the risk of airway irritation and respiratory strain on prolonged exposure.`
    );
  } else if (aqi >= 201) {
    sentences.push(
      isHi
        ? `वायु गुणवत्ता खराब (${category.label.hi}, AQI ${aqi}) है; आज सभी के लिए बाहरी व्यायाम से बचना आवश्यक है।`
        : `Air quality is Poor (AQI ${aqi}); everyone should avoid prolonged outdoor exertion today.`
    );
  } else if (aqi >= 101) {
    sentences.push(
      isHi
        ? `वायु गुणवत्ता मध्यम (${category.label.hi}, AQI ${aqi}) है; संवेदनशील लोगों को अतिरिक्त सावधानी बरतनी चाहिए।`
        : `Air quality is Moderate (AQI ${aqi}), which can trigger breathing discomfort for sensitive households.`
    );
  } else {
    sentences.push(
      isHi
        ? `वायु गुणवत्ता ${category.label.hi} (AQI ${aqi}) है और अधिकांश लोगों के लिए सामान्य दैनिक गतिविधियां आरामदायक हैं।`
        : `Air quality is ${category.label.en} (AQI ${aqi}), making normal daily routines comfortable for most people.`
    );
  }

  if (profile.hasChildren) {
    sentences.push(
      aqi >= 201
        ? isHi
          ? 'बच्चों के लिए: आज सुबह और शाम के बाहरी खेल रद्द करें और सभी खेलकूद घर के अंदर रखें।'
          : 'For children: Keep playtime and school sports indoors today because young lungs absorb a higher PM2.5 dose per breath.'
        : aqi >= 101
          ? isHi
            ? 'बच्चों के लिए: भारी दौड़-भाग से बचें और केवल दोपहर 1–4 बजे की स्वच्छ अवधि में हल्की गतिविधि चुनें।'
            : 'For children: Limit vigorous outdoor play and keep brief outdoor breaks to the cleaner 1–4 PM window away from busy roads.'
          : isHi
            ? 'बच्चों के लिए: सड़क से दूर पार्कों में सामान्य बाहरी खेल सुरक्षित है।'
            : 'For children: Regular outdoor play in parks away from heavy traffic is fine today.'
    );
  }

  if (profile.hasElderly) {
    sentences.push(
      aqi >= 201
        ? isHi
          ? 'बुजुर्ग सदस्यों (60+) के लिए: सुबह की सैर टालें, घर के अंदर साफ हवा वाले कमरे में रहें और पर्याप्त पानी पिएं।'
          : 'For older adults (60+): Skip morning and evening walks, stay in a well-sealed indoor room, and stay well hydrated.'
        : aqi >= 101
          ? isHi
            ? 'बुजुर्ग सदस्यों (60+) के लिए: सैर को दोपहर की धूप वाले समय तक सीमित रखें और मुख्य ट्रैफ़िक से दूर रहें।'
            : 'For older adults (60+): Shift gentle walks to the midday daylight window and pause immediately if any fatigue or shortness of breath occurs.'
          : isHi
            ? 'बुजुर्ग सदस्यों (60+) के लिए: हल्की सैर सामान्य रूप से सुरक्षित है, पर भारी ट्रैफ़िक क्षेत्रों से बचें।'
            : 'For older adults (60+): Routine walks are comfortable today, though avoiding busy intersections remains helpful.'
    );
  }

  if (profile.hasRespiratoryCondition) {
    sentences.push(
      aqi >= 101
        ? isHi
          ? 'दमा या श्वसन संवेदनशीलता के लिए: डॉक्टर द्वारा दी गई रिलीवर दवा या इन्हेलर हमेशा पास रखें, घर के अंदर की हवा साफ रखें, और बाहर जाना अनिवार्य हो तो फिटेड N95/FFP2 मास्क पहनें।'
          : 'For asthma or respiratory sensitivity: Keep prescribed reliever inhalers within reach, prioritize clean indoor air, and wear a properly fitted N95/FFP2 mask for any unavoidable outdoor trip.'
        : isHi
          ? 'दमा या श्वसन संवेदनशीलता के लिए: अपना निर्धारित इन्हेलर साथ रखें और धूल या धुएं वाले इलाकों से दूर रहें।'
          : 'For asthma or respiratory sensitivity: Keep prescribed medication handy and steer clear of localized smoke or construction dust.'
    );
  }

  sentences.push(
    isHi
      ? 'यह सामान्य जानकारी है, चिकित्सीय सलाह नहीं—खांसी, घरघराहट या सांस फूलने पर तुरंत डॉक्टर से परामर्श करें।'
      : 'This guidance is not medical advice; consult a qualified doctor promptly if coughing, wheezing, or breathlessness develops.'
  );

  return sentences.join(' ');
}

function buildMaskGuidance(profile: UserProfile, aqi: number): string {
  const isHi = profile.language === 'hi';
  const isVulnerable =
    profile.hasChildren || profile.hasElderly || profile.hasRespiratoryCondition;

  if (aqi >= 201) {
    const sentences: string[] = [
      isHi
        ? `AQI ${aqi} पर सभी के लिए बाहरी व्यायाम, दौड़ और लंबे समय तक बाहर रहने से पूरी तरह बचें।`
        : `At AQI ${aqi}, avoid outdoor exertion and prolonged outdoor exercise entirely for everyone.`,
      isVulnerable
        ? isHi
          ? 'बच्चों, बुजुर्गों और श्वसन संवेदनशील सदस्यों को घर के अंदर साफ हवा वाले कमरे में रखें। यदि बाहर निकलना अनिवार्य हो तो दोपहर 1–4 बजे का समय चुनें और बिना वाल्व वाला फिटेड N95/FFP2 मास्क पहनें।'
          : 'Keep children, older adults, and anyone with respiratory sensitivity indoors in clean air. For essential trips only, prefer the 1–4 PM window and wear a snugly fitted N95/FFP2 respirator (cloth and loose surgical masks do not block PM2.5).'
        : isHi
          ? 'ऑफिस यात्रा या आवश्यक काम के लिए बाहर निकलते हर बार नाक की क्लिप दबाकर फिटेड N95/FFP2 मास्क पहनें—कपड़े या सर्जिकल मास्क PM2.5 नहीं रोकते।'
          : 'Wear a snugly sealed N95 or FFP2 respirator for every commute or essential errand—cloth and loose surgical masks let fine PM2.5 leak past the edges.',
      isHi
        ? 'यह चिकित्सीय सलाह नहीं है; श्वसन लक्षणों के लिए डॉक्टर से मिलें।'
        : 'Not medical advice; consult a doctor if you have a respiratory or cardiac condition.',
    ];
    return sentences.join(' ');
  }

  if (aqi >= 101 && isVulnerable) {
    return isHi
      ? `AQI ${aqi} (मध्यम) पर चूंकि आपके परिवार में संवेदनशील सदस्य हैं, इसलिए बाहरी गतिविधि को सीमित रखें और भारी या मध्यम व्यायाम घर के अंदर करें। आवश्यक बाहर निकलने के लिए सबसे स्वच्छ दोपहर (1–4 बजे) का समय चुनें, फिटेड N95/FFP2 मास्क पहनें और घर के अंदर की हवा साफ रखें। यह चिकित्सीय सलाह नहीं है; आवश्यकता होने पर डॉक्टर से परामर्श लें।`
      : `At AQI ${aqi} (Moderate), because your household includes sensitive members, limit outdoor activity and move workouts indoors. Prefer the cleanest daylight window (1–4 PM), wear a fitted N95/FFP2 mask for essential trips near traffic, and keep indoor air clean. Not medical advice; consult a doctor for personalized guidance.`;
  }

  if (aqi >= 101) {
    return isHi
      ? `AQI ${aqi} (मध्यम) पर भारी बाहरी व्यायाम को कम रखें और व्यस्त सड़कों के बजाय दोपहर 1–4 बजे का समय चुनें। ट्रैफ़िक कम्यूट या निर्माण धूल के पास फिटेड N95/FFP2 मास्क पहनना सुरक्षित रहता है। यह चिकित्सीय सलाह नहीं है।`
      : `At AQI ${aqi} (Moderate), keep prolonged outdoor exertion light and shift workouts to the 1–4 PM window away from busy roads. Wearing a fitted N95/FFP2 mask during heavy-traffic commutes or near construction dust is recommended. Not medical advice.`;
  }

  if (isVulnerable) {
    return isHi
      ? `AQI ${aqi} पर संवेदनशील सदस्यों के लिए मुख्य सड़कों से दूर हल्की बाहरी गतिविधि आमतौर पर आरामदायक है। भारी ट्रैफ़िक के पास N95 मास्क साथ रखें और कोई लक्षण महसूस होने पर डॉक्टर से परामर्श लें।`
      : `At AQI ${aqi}, gentle outdoor activity away from busy roads is generally comfortable for sensitive household members. Keep an N95 handy near heavy traffic and consult a doctor if any symptoms appear.`;
  }

  return isHi
    ? `AQI ${aqi} पर सामान्य बाहरी गतिविधि और व्यायाम सुरक्षित हैं। मास्क वैकल्पिक है, हालांकि भारी ट्रैफ़िक या धूल भरे क्षेत्रों में N95 उपयोगी रहता है। यह चिकित्सीय सलाह नहीं है।`
    : `At AQI ${aqi}, normal outdoor activity and exercise are fine. Masks are optional for routine trips, though wearing an N95 near heavy traffic or construction dust remains helpful. Not medical advice.`;
}

/**
 * Generates a deterministic, rule-based clean-air plan tailored to the user's profile.
 */
export function generateMockPlan(profile: UserProfile): PlanResponse {
  const isHi = profile.language === 'hi';
  const aqiReading = getMockAirQuality(profile.city);
  const category = getAqiCategory(aqiReading.aqi);

  const summary = isHi
    ? `${aqiReading.city} के लिए डेमो AQI ${aqiReading.aqi} (${category.label.hi}) है, जिसमें ${aqiReading.dominantPollutant} मुख्य प्रदूषक है। आपके ${profile.householdSize} सदस्यों के परिवार के लिए यह योजना पीक स्मॉग से बचाव, ${
        profile.budget === 'low' ? 'कम-खर्च इनडोर उपायों' : 'प्रभावी इनडोर फ़िल्ट्रेशन'
      } और कम-उत्सर्जन आदतों पर केंद्रित है।`
    : `${aqiReading.city} shows a sample demo AQI of ${aqiReading.aqi} (${category.label.en}), driven primarily by ${aqiReading.dominantPollutant}. Built for your ${profile.householdSize}-person household, this plan prioritizes avoiding morning and evening winter inversion, ${
        profile.budget === 'low'
          ? 'free and low-cost indoor protection'
          : 'effective indoor air cleaning'
      }, and practical low-emission swaps.`;

  const disclaimer = isHi
    ? 'अस्वीकरण: यह मार्गदर्शन सामान्य सूचना के लिए है और चिकित्सीय सलाह नहीं है। दमा, हृदय रोग या गंभीर सांस के लक्षणों के लिए योग्य डॉक्टर से परामर्श करें।'
    : 'Not medical advice. This plan offers general environmental and low-emission lifestyle guidance. Always consult a qualified physician for asthma, COPD, cardiovascular conditions, or acute respiratory symptoms.';

  return {
    aqi: aqiReading,
    summary,
    healthAdvisory: buildHealthAdvisory(profile, aqiReading.aqi),
    routine: buildRoutine(profile, aqiReading.aqi),
    indoorHacks: buildIndoorHacks(profile),
    alternatives: buildAlternatives(profile),
    maskGuidance: buildMaskGuidance(profile, aqiReading.aqi),
    disclaimer,
    generatedBy: 'rules',
  };
}

/**
 * Delegates follow-up chat answers to the multi-intent deterministic chat engine.
 */
export function generateMockChatReply(
  question: string,
  profile: UserProfile,
  plan: PlanResponse
): ChatReply {
  return generateSmartMockChatReply(question, profile, plan);
}
