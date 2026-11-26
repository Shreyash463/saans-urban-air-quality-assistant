import { getAqiCategory } from '../../src/lib/aqi';
import type { ChatReply, PlanResponse, UserProfile } from '../../src/types';

export type ChatIntent =
  | 'greeting'
  | 'symptoms'
  | 'outdoor_play'
  | 'mask'
  | 'cheapest_indoor'
  | 'plants'
  | 'purifier_diy'
  | 'cooking'
  | 'commute'
  | 'ventilation'
  | 'fallback';

interface IntentRule {
  intent: Exclude<ChatIntent, 'fallback'>;
  patterns: readonly RegExp[];
}

const INTENT_RULES: readonly IntentRule[] = [
  {
    intent: 'greeting',
    patterns: [
      /^(?:hi+|hello+|hey+|namaste|namaskar|good\s+(?:morning|afternoon|evening)|thanks?|thank\s+you)[\s!.,?]*$/i,
      /^(?:नमस्ते|नमस्कार|हैलो|धन्यवाद|शुक्रिया)[\s!।.,?]*$/,
    ],
  },
  {
    // Health symptoms checked early for safety
    intent: 'symptoms',
    patterns: [
      /\b(cough|coughing|wheez\w*|breathless\w*|asthma attack|chest tight|chest pain|shortness of breath|inhaler|throat hurt|sore throat|dizzy|sick)\b/i,
      /(खांसी|सांस फूल|घरघराहट|दमा|सीने में|डॉक्टर|चक्कर)/i,
    ],
  },
  {
    intent: 'plants',
    patterns: [
      /\b(plant|plants|areca|snake plant|money plant|peace lily|aloe)\b/i,
      /(पौध|अरेका|स्नेक प्लांट)/i,
    ],
  },
  {
    intent: 'mask',
    patterns: [
      /\b(mask|masks|n95|n99|ffp2|kn95|surgical|cloth mask|respirator)\b/i,
      /(मास्क|एन95)/i,
    ],
  },
  {
    intent: 'purifier_diy',
    patterns: [
      /\b(purifier|hepa|cadr|corsi|box fan|diy filter|ionizer|filter)\b/i,
      /(प्यूरीफायर|फ़िल्टर|फिल्टर|बॉक्स फैन)/i,
    ],
  },
  {
    intent: 'outdoor_play',
    patterns: [
      /\b(kid|kids|child|children|play|playground|school|walk|walking|running|jog|jogging|morning run|outdoor run|exercise|safe to go out|go outside|outdoor)\b/i,
      /(बच्च|खेल|बाहर जाना|व्यायाम|स्कूल|सैर)/i,
    ],
  },
  {
    intent: 'cheapest_indoor',
    patterns: [
      /\b(cheap|cheapest|free|low cost|budget|affordable|save money|indoor air|improve indoor)\b/i,
      /(सस्त|मुफ्त|कम खर्च|बजट|घर की हवा)/i,
    ],
  },
  {
    intent: 'cooking',
    patterns: [
      /\b(cook|cooking|kitchen|lpg|induction|gas|biomass|wood|chulha|tadka|chimney|exhaust|smoke)\b/i,
      /(रसोई|खाना|गैस|इंडक्शन|चूल्हा|लकड़ी|तड़का)/i,
    ],
  },
  {
    intent: 'commute',
    patterns: [
      /\b(commute|car|metro|bus|bike|scooter|two wheeler|traffic|carpool|drive|office)\b/i,
      /(यात्रा|कार|मेट्रो|बस|बाइक|स्कूटर|ट्रैफ़िक|कारपूल)/i,
    ],
  },
  {
    intent: 'ventilation',
    patterns: [
      /\b(window|windows|ventilat\w*|open door|fresh air|morning air|afternoon|inversion|seal|draft)\b/i,
      /(खिड़क|दरवाज़|वेंटिलेशन|ताज़ी हवा|सुबह|दोपहर)/i,
    ],
  },
];

/**
 * Classifies a user follow-up question into a deterministic domain intent.
 */
export function detectChatIntent(question: string): ChatIntent {
  const trimmed = question.trim();
  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(trimmed))) {
      return rule.intent;
    }
  }
  return 'fallback';
}

/**
 * Generates a deterministic, profile- and AQI-aware answer for "Ask Saans"
 * across greetings, 9 focused intents, and a helpful fallback.
 */
export function generateSmartMockChatReply(
  question: string,
  profile: UserProfile,
  plan: PlanResponse
): ChatReply {
  const intent = detectChatIntent(question);
  const isHi = profile.language === 'hi';
  const { aqi, city } = plan.aqi;
  const category = getAqiCategory(aqi);
  const hasVulnerability =
    profile.hasChildren || profile.hasElderly || profile.hasRespiratoryCondition;

  switch (intent) {
    case 'greeting':
      return {
        answer: isHi
          ? `नमस्ते! ${city} में अभी AQI ${aqi} (${category.label.hi}) है—मास्क, बच्चों के बाहर खेलने, वेंटिलेशन या घर की हवा के बारे में कुछ भी पूछें।`
          : `Hello! ${city} is currently at AQI ${aqi} (${category.label.en})—ask me anything about masks, kids playing outside, ventilation windows, or indoor air hacks.`,
      };

    case 'symptoms':
      return {
        answer: isHi
          ? `महत्वपूर्ण स्वास्थ्य नोट: यदि किसी को खांसी, घरघराहट, सीने में जकड़न या सांस लेने में दिक्कत हो रही है, तो कृपया तुरंत योग्य डॉक्टर से सलाह लें—सांस चिकित्सीय सलाह नहीं देता। अभी के लिए ${city} (AQI ${aqi}) में घर के अंदर शांत कमरे में रहें, खिड़कियां बंद रखें और डॉक्टर द्वारा दिया गया इन्हेलर/दवा पास रखें।`
          : `Important health note: If anyone is experiencing coughing, wheezing, chest tightness, or shortness of breath, please consult a qualified doctor promptly—Saans is not a substitute for medical care. Until you speak with a clinician, stay indoors in the cleanest room available in ${city} (AQI ${aqi}), keep windows shut, and keep prescribed reliever medication within reach.`,
      };

    case 'outdoor_play':
      if (aqi >= 201) {
        return {
          answer: isHi
            ? `${city} में अभी AQI ${aqi} (${category.label.hi}) है। इस स्तर पर बच्चों का बाहर खेलना या किसी के भी द्वारा बाहरी व्यायाम करना सुरक्षित नहीं है। आज खेलकूद घर के अंदर रखें; यदि बाहर जाना अनिवार्य हो तो सबसे कम धुंध वाले दोपहर 1–4 बजे का समय चुनें और फिटेड N95/FFP2 मास्क पहनें। (यह चिकित्सीय सलाह नहीं है।)`
            : `At AQI ${aqi} (${category.label.en}) in ${city}, outdoor play and exertion should be avoided for everyone—especially children and sensitive family members. Move play and exercise indoors today. For unavoidable errands, stick to the 1–4 PM afternoon dip and wear a snugly fitted N95/FFP2 mask. (Not medical advice.)`,
        };
      }
      if (aqi >= 101 && hasVulnerability) {
        return {
          answer: isHi
            ? `${city} में AQI ${aqi} (${category.label.hi}) है और आपके परिवार में संवेदनशील सदस्य हैं। भारी बाहरी खेलकूद या दौड़ को टालें—केवल दोपहर 1–4 बजे के बीच सड़क से दूर हल्की गतिविधि तक सीमित रहें और ज़रूरी बाहर निकलने पर N95 मास्क रखें। (चिकित्सीय सलाह नहीं।)`
            : `At AQI ${aqi} (${category.label.en}) in ${city}, because your household includes sensitive members, skip vigorous outdoor sports or running. Limit outdoor time to brief, gentle activity during the 1–4 PM daylight window away from main roads, and use a fitted N95 for essential traffic trips. (Not medical advice.)`,
        };
      }
      return {
        answer: isHi
          ? `${city} में AQI ${aqi} (${category.label.hi}) है। मुख्य सड़क से दूर पार्क में दोपहर के समय हल्का खेलना और सामान्य सैर सुरक्षित है, फिर भी धुंध या आंखों में जलन लगे तो अंदर आ जाएं।`
          : `At AQI ${aqi} (${category.label.en}) in ${city}, normal outdoor play and light exercise in a park away from main traffic are reasonable—especially during the afternoon window. Head indoors if anyone notices throat irritation.`,
      };

    case 'plants':
      return {
        answer: isHi
          ? `ईमानदार जवाब: स्नेक प्लांट, अरेका पाम और मनी प्लांट घर को सुकून देते हैं, लेकिन वैज्ञानिक परीक्षणों में वे वास्तविक शहरी स्मॉग में कमरे का PM2.5 लगभग नहीं घटा पाते (एक कमरे को साफ करने के लिए सैकड़ों पौधे लगेंगे)। असली असर के लिए पीक घंटों में खिड़कियां बंद रखें, गीला पोंछा लगाएं और True HEPA या DIY बॉक्स-फैन फ़िल्टर का उपयोग करें।`
          : `Honest answer: Houseplants like snake plant and areca palm look soothing, but peer-reviewed chamber tests show they remove negligible PM2.5 during real urban smog—you would need hundreds of plants per room to match one small filter. For real indoor relief in ${city} (AQI ${aqi}), seal gaps during peak smog, switch to wet mopping, and use a True HEPA or DIY box-fan filter.`,
      };

    case 'mask':
      return {
        answer: isHi
          ? `${city} (AQI ${aqi}, ${category.label.hi}) के लिए साधारण कपड़ा या ढीला सर्जिकल मास्क PM2.5 को नहीं रोकता। बिना वाल्व वाला प्रमाणित N95 या FFP2 मास्क पहनें, नाक की पट्टी को कसकर दबाएं ताकि किनारों से हवा न घुसे, और ${
              profile.hasChildren
                ? 'बच्चों के लिए सही छोटे साइज का किड्स KN95/N95 चुनें।'
                : '30–40 घंटे उपयोग या ढीला होने पर नया मास्क बदल लें।'
            }`
          : `For ${city} (AQI ${aqi}, ${category.label.en}), cloth and loose surgical masks let fine PM2.5 leak past the edges. Choose an unvalved certified N95 or FFP2 respirator, press the metal nose clip tightly so glasses do not fog, and ${
              profile.hasChildren
                ? 'use a properly sized child KN95/N95 for school commutes.'
                : 'replace the mask once straps loosen or breathing resistance rises (roughly 30–40 hours of wear).'
            }`,
      };

    case 'purifier_diy':
      return {
        answer: profile.hasAirPurifier
          ? isHi
            ? `चूंकि आपके पास पहले से एयर प्यूरीफायर है: इसे दीवार से 30 सेमी दूर एक बंद बेडरूम में चलाएं (खुले हॉल में नहीं), सोने से 30 मिनट पहले हाई मोड पर चलाएं, और हर 14 दिन में प्री-फ़िल्टर साफ करें (पेपर HEPA को पानी से न धोएं)।`
            : `Since you already own an air purifier: run it in one closed bedroom (not an open living hall) at least 30 cm from walls, pre-clean on high 30 minutes before bed, and vacuum the mesh pre-filter every 2 weeks during winter smog. Never wash the paper HEPA cartridge.`
          : isHi
            ? `आपके ${profile.budget} बजट के अनुसार: कम खर्च में आप एक साधारण बॉक्स/टेबल फैन के पीछे रिप्लेसमेंट True HEPA फ़िल्टर (₹1,200–₹2,000) को कार्डबोर्ड और टेप से सील करके असरदार DIY बेडरूम प्यूरीफायर बना सकते हैं। रिटेल मॉडल लेने पर बिना आयनाइज़र (ozone-free) वाला True HEPA H13 चुनें।`
            : `For your ${profile.budget} budget: the highest-value DIY option is sealing a replacement True HEPA filter (₹1,200–₹2,000) onto the intake side of an existing box or table fan with cardboard shrouding. If buying retail, pick a simple ozone-free True HEPA H13 unit sized to your bedroom (CADR 250–350 m³/hr).`,
      };

    case 'cheapest_indoor':
      return {
        answer: isHi
          ? `कम खर्च में घर की हवा सुधारने के 4 सबसे प्रभावी कदम: (1) निःशुल्क: सुबह 6–10 और शाम 6–10 बजे खिड़कियां बंद रखें और दोपहर 1–4 बजे 20 मिनट खोलें। (2) निःशुल्क: सूखी झाड़ू के बजाय गीला पोंछा लगाएं और अगरबत्ती/कॉइल से बचें। (3) ~₹300: दरवाज़ों की दरारों पर EPDM फोम टेप लगाएं। (4) ~₹1,500–₹2,500: DIY बॉक्स-फैन + HEPA फ़िल्टर बनाएं।`
          : `The 4 cheapest high-impact indoor upgrades for ${city} (AQI ${aqi}): (1) Free: Close windows during 6–10 AM and 6–10 PM peaks, and cross-ventilate 20 minutes between 1–4 PM. (2) Free: Wet-mop instead of dry sweeping and skip indoor incense or mosquito coils. (3) ~₹300: Apply EPDM foam weather-stripping to door/window gaps. (4) ~₹1,500–₹2,500: Build a DIY box-fan + HEPA bedroom cleaner.`,
      };

    case 'cooking':
      return {
        answer:
          profile.cookingFuel === 'biomass_wood'
            ? isHi
              ? `घर में लकड़ी/बायोमास का धुआं बाहरी स्मॉग से भी अधिक PM2.5 पैदा करता है। तत्काल उपाय के तौर पर खाना पकाते समय पूरी क्रॉस-वेंटिलेशन या खुली जगह चुनें और LPG (उज्ज्वला) या सिंगल-बर्नर इंडक्शन पर शिफ्ट करने को पहली प्राथमिकता दें।`
              : `Indoor wood or biomass smoke creates far higher PM2.5 than outdoor winter smog. As an immediate step, cook only with maximum cross-ventilation or outdoors under cover, and prioritize transitioning to LPG or a single-burner induction cooktop—it is the single largest health gain in your plan.`
            : isHi
              ? `तड़का या तलने के समय किचन एग्जॉस्ट फैन/चिमनी चलाएं और रसोई का दरवाज़ा बंद रखें ताकि धुआं बेडरूम में न फैले। पानी उबालने और चाय के लिए इलेक्ट्रिक केतली/इंडक्शन का उपयोग करने से रसोई का NO2 और PM2.5 दोनों घटते हैं।`
              : `Run your kitchen exhaust fan or chimney during tadka and frying while keeping the kitchen door closed so plumes do not drift into bedrooms. Shifting boiling and simmering tasks onto an electric kettle or induction burner cuts indoor NO2 and fine particles noticeably.`,
      };

    case 'commute':
      return {
        answer:
          profile.commuteMode === 'work_from_home'
            ? isHi
              ? `आप पहले से घर से काम कर रहे हैं, जो आपकी रोज़ाना सड़क के धुएं से बड़ी सुरक्षा है! बस शाम के ट्रैफ़िक पीक (6–9 PM) में छोटे कामों के लिए बाहर निकलने के बजाय उन्हें दोपहर 1–4 बजे एक साथ निपटाएं।`
              : `Working from home already eliminates daily rush-hour tailpipe exposure. Your main commute tip is batching errands into a single 1–4 PM trip instead of multiple evening trips when ${city} smog peaks.`
            : isHi
              ? `${city} (AQI ${aqi}) में ${profile.commuteKm} किमी की दैनिक यात्रा के लिए: ${
                  profile.commuteMode === 'car'
                    ? 'ट्रैफ़िक में कार AC को रीसर्कुलेशन मोड पर रखें, PUC अपडेट रखें, और सप्ताह में 2–3 दिन मेट्रो या कारपूल आज़माएं।'
                    : 'मेट्रो/AC बस सबसे सुरक्षित विकल्प हैं; बाहर या दोपहिया पर चलते समय फिटेड N95 पहनें और डीज़ल बसों के ठीक पीछे न रुकें।'
                }`
              : `For your ${profile.commuteKm} km daily commute in ${city} (AQI ${aqi}): ${
                  profile.commuteMode === 'car'
                    ? 'switch cabin AC to recirculation in heavy traffic, keep your PUC current, and try metro or carpooling 3 days/week to cut both exposure and monthly CO2.'
                    : 'metro or AC buses cut roadside PM2.5 substantially compared to open roads; wear a fitted N95 during walking or two-wheeler legs and avoid idling behind diesel exhaust.'
                }`,
      };

    case 'ventilation':
      return {
        answer: isHi
          ? `सर्दियों में सुबह 6–10 और शाम 6–10 बजे थर्मल इनवर्ज़न के कारण प्रदूषण ज़मीन के पास फंसा रहता है—इन घंटों में खिड़कियां बंद रखें। दोपहर 1–4 बजे जब धूप से हवा ऊपर उठती है, तब 15–20 मिनट विपरीत खिड़कियां खोलकर घर की बासी हवा बाहर निकालें।`
          : `During winter thermal inversion, smog sits lowest between 6–10 AM and 6–10 PM—keep windows tightly shut then. Open opposite windows for 15–20 minutes between 1–4 PM, when daytime warmth lifts the inversion layer, to flush trapped indoor CO2 and kitchen fumes safely.`,
      };

    case 'fallback': {
      const snippet = question.trim().slice(0, 90);
      return {
        answer: isHi
          ? `आपके सवाल ("${snippet}") के संदर्भ में: ${city} में वर्तमान AQI ${aqi} (${category.label.hi}) के आधार पर अपनी योजना में 'आज की कम-उत्सर्जन दिनचर्या', 'घर की हवा साफ रखने के उपाय' और ऊपर दिए गए 'प्रभाव सिम्युलेटर' को देखें। आप मास्क, बच्चों के बाहर खेलने, वेंटिलेशन समय या सस्ते इनडोर उपायों के बारे में भी सीधे पूछ सकते हैं।`
          : `About your question ("${snippet}"): for ${city} at AQI ${aqi} (${category.label.en}), check your "Today's low-emission routine" and "Indoor air quality hacks" sections above, or test swaps in the Impact Simulator. You can also ask me directly about kids playing outside, N95 masks, ventilation windows, cooking smoke, or low-budget indoor fixes.`,
      };
    }
  }
}
