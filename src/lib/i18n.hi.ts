import '@fontsource/noto-sans-devanagari/devanagari-400.css';
import '@fontsource/noto-sans-devanagari/devanagari-600.css';
import '@fontsource/noto-sans-devanagari/devanagari-700.css';
import type { TranslationDictionary } from './i18n';

export const HINDI_TRANSLATIONS: TranslationDictionary = {
  // Skip & Navigation
  skipToMain: 'मुख्य सामग्री पर जाएं',
  brandName: 'सांस (Saans)',
  navHowItWorks: 'यह कैसे काम करता है',
  navProfile: 'आपकी प्रोफ़ाइल',
  navPlan: 'आपकी योजना',
  navSimulator: 'प्रभाव सिम्युलेटर',
  navChat: 'सांस से पूछें',
  navGetPlan: 'योजना बनाएं',
  switchToLight: 'लाइट थीम पर जाएं',
  switchToDark: 'डार्क थीम पर जाएं',
  switchLanguageLabel: 'EN — भाषा अंग्रेज़ी में बदलें',
  reduceMotionLabel: 'कम गति मोड',
  reduceMotionOn: 'गति कम है',
  reduceMotionOff: 'गति कम करें',

  // Hero
  heroEyebrow: 'शहरी वायु गुणवत्ता सहायक · भारतीय CPCB पैमाना',
  heroTitle: 'सांस',
  heroPromise: 'हर समझदार कदम के साथ लें साफ सांस',
  heroDescription:
    'सर्दियों के घने स्मॉग और शहरी वायु प्रदूषण से निपटने के लिए अपनी दिनचर्या, घर की हवा साफ रखने के व्यावहारिक उपाय और टिकाऊ विकल्प पाएं—हर बदलाव के स्पष्ट प्रभाव के साथ।',
  heroPrimaryCta: 'मेरी स्वच्छ-वायु योजना बनाएं',
  heroSecondaryCta: 'जानें यह कैसे काम करता है',
  heroDemoCaption: 'डेमो के लिए नमूना रीडिंग',
  sampleReadingForDemo: 'डेमो के लिए नमूना रीडिंग',
  demoInfoTooltipLabel: 'नमूना डेमो रीडिंग की जानकारी',
  demoInfoTooltipText: 'बैकएंड सक्षम होने पर लाइव डेटा जुड़ जाता है।',

  // How it works
  howItWorksHeading: 'सांस कैसे काम करता है',
  step1Title: 'अपनी दिनचर्या बताएं',
  step1Desc:
    'अपना शहर, परिवार के सदस्य, यात्रा का तरीका, घर का प्रकार, रसोई ईंधन और बजट चुनें।',
  step2Title: 'व्यक्तिगत योजना पाएं',
  step2Desc:
    'CPCB आधारित दैनिक दिनचर्या, घर के अंदर हवा सुधारने के उपाय, मास्क सलाह और टिकाऊ विकल्प पाएं।',
  step3Title: 'हर विकल्प का असर देखें',
  step3Desc: 'लाइव सिम्युलेटर में आदतें बदलकर PM2.5 संपर्क और मासिक CO2 में अनुमानित कमी देखें।',

  // Profile form
  profileHeading: 'अपने जीवन के बारे में बताएं',
  profileSubheading:
    'अपने शहर और परिवार के अनुसार दैनिक दिनचर्या, इनडोर उपाय और टिकाऊ विकल्प तैयार करें।',
  cityLabel: 'आपका शहर',
  cityPlaceholder: 'जैसे: Delhi, Lucknow, Pune',
  cityQuickPickLabel: 'डेमो शहर चुनें:',
  useMyLocation: 'मेरा स्थान उपयोग करें',
  useMyLocationLoading: 'स्थान खोज रहे हैं...',
  locationApproxLabel: 'आपका स्थान (अनुमानित)',
  locationDeniedNotice:
    'स्थान की अनुमति नहीं मिली—कृपया ऊपर शहर का नाम टाइप करें या डेमो शहर चुनें।',
  locationUnsupportedNotice: 'इस ब्राउज़र में स्थान सेवा उपलब्ध नहीं है—कृपया ऊपर अपना शहर लिखें।',
  householdSizeLabel: 'परिवार के सदस्य',
  householdSizeDecrease: 'सदस्यों की संख्या घटाएं',
  householdSizeIncrease: 'सदस्यों की संख्या बढ़ाएं',
  householdMembersUnit: 'लोग',
  sensitivityLegend: 'परिवार का स्वास्थ्य और संवेदनशीलता',
  hasChildrenLabel: 'घर में बच्चे हैं (14 वर्ष से कम)',
  hasElderlyLabel: 'बुजुर्ग सदस्य हैं (60+)',
  hasRespiratoryLabel: 'दमा, COPD या सांस की संवेदनशीलता',
  commuteLegend: 'दैनिक यात्रा का मुख्य तरीका',
  commuteCar: 'निजी कार',
  commuteTwoWheeler: 'दोपहिया वाहन',
  commutePublic: 'मेट्रो / बस',
  commuteWalkCycle: 'पैदल / साइकिल',
  commuteWfh: 'घर से काम (WFH)',
  commuteKmLabel: 'दैनिक आने-जाने की दूरी',
  commuteKmUnit: 'किमी / दिन',
  homeLegend: 'घर का वातावरण',
  homeTypeLabel: 'घर का प्रकार',
  homeApartment: 'अपार्टमेंट / फ्लैट',
  homeHouse: 'स्वतंत्र मकान',
  purifierLabel: 'क्या आपके पास पहले से एयर प्यूरीफायर है?',
  yes: 'हाँ',
  no: 'नहीं',
  cookingLegend: 'खाना पकाने का मुख्य ईंधन',
  fuelLpg: 'LPG सिलेंडर',
  fuelInduction: 'इंडक्शन / इलेक्ट्रिक',
  fuelPipedGas: 'पाइप्ड गैस (PNG)',
  fuelBiomass: 'लकड़ी / बायोमास / कोयला',
  budgetLegend: 'स्वच्छ हवा के उपायों के लिए मासिक बजट',
  budgetLow: 'कम (मुफ्त और DIY प्राथमिकता)',
  budgetMedium: 'मध्यम (संतुलित)',
  budgetHigh: 'अधिक (पूर्ण सुरक्षा)',
  submitProfile: 'मेरी स्वच्छ-वायु योजना बनाएं',
  submitProfileLoading: 'आपकी योजना तैयार हो रही है...',
  clearMyData: 'मेरा डेटा हटाएं',
  dataClearedNotice: 'ब्राउज़र में सहेजी गई प्राथमिकताएं हटा दी गई हैं।',

  // Validation Errors
  errorCityRequired: 'कृपया शहर का नाम दर्ज करें या ऊपर से डेमो शहर चुनें।',
  errorCityInvalidChars: 'शहर के नाम में केवल अक्षर, स्पेस, कॉमा, बिंदु या हाइफ़न हो सकते हैं।',
  errorCityTooLong: 'शहर का नाम 60 अक्षरों या उससे कम होना चाहिए।',
  errorChatRequired: 'कृपया भेजने से पहले एक प्रश्न लिखें।',
  errorChatTooLong: 'प्रश्न 500 अक्षरों या उससे कम होना चाहिए।',

  // Dashboard
  planReadyAnnouncement: 'आपकी व्यक्तिगत स्वच्छ-वायु योजना तैयार है।',
  planLoadingLabel: 'आपकी व्यक्तिगत योजना तैयार की जा रही है...',
  loadingStageAqi: 'लाइव वायु गुणवत्ता जांच रहे हैं',
  loadingStageGemini: 'Gemini के साथ व्यक्तिगत योजना बना रहे हैं',
  loadingStageSafety: 'सुरक्षा जांच कर रहे हैं',
  loadingWakingServer:
    'पहले अनुरोध पर सर्वर शुरू होने में 15–30 सेकंड लग सकते हैं — कृपया प्रतीक्षा करें।',
  generatedByGemini: 'Gemini द्वारा तैयार',
  generatedByRules: 'नियम-आधारित फ़ॉलबैक',
  aiBusyNotice:
    'जेमिनी अभी व्यस्त है, इसलिए यह नियम-आधारित योजना है। आप {seconds} सेकंड बाद फिर प्रयास कर सकते हैं।',
  aiBusyReadyNotice:
    'जेमिनी अभी व्यस्त है, इसलिए यह नियम-आधारित योजना है। अब आप जेमिनी से फिर प्रयास कर सकते हैं।',
  retryGeminiButton: 'जेमिनी से फिर प्रयास करें',
  retryGeminiLoading: 'जेमिनी पुनः प्रयास...',
  dashboardHeading: 'आपकी व्यक्तिगत स्वच्छ-वायु योजना',
  dashboardEmptyHeading: 'शुरू करने के लिए तैयार',
  dashboardEmptyBody:
    'CPCB आधारित दिनचर्या, इनडोर उपाय और टिकाऊ विकल्प पाने के लिए ऊपर अपनी पारिवारिक प्रोफ़ाइल भरें।',
  printPlanButton: 'योजना प्रिंट / सेव करें',
  downloadPlanButton: 'डाउनलोड (.txt)',
  copyPlanButton: 'योजना कॉपी करें',
  copiedConfirmation: 'स्वच्छ-वायु योजना क्लिपबोर्ड पर कॉपी हो गई है।',
  downloadedConfirmation: 'स्वच्छ-वायु योजना टेक्स्ट फ़ाइल के रूप में डाउनलोड हो गई है।',
  printBlockedNotice:
    'इस विंडो में प्रिंट संवाद उपलब्ध नहीं है—कृपया डाउनलोड (.txt) या कॉपी करें का उपयोग करें।',
  sourceLive: 'लाइव AQI',
  sourceDemo: 'डेमो AQI',
  dominantPollutantLabel: 'मुख्य प्रदूषक',
  updatedAtLabel: 'अपडेट समय',
  cpcbScaleLabel: 'भारतीय CPCB AQI पैमाना',
  healthAdvisoryHeading: 'व्यक्तिगत स्वास्थ्य सलाह',
  notMedicalAdviceBadge: 'चिकित्सीय सलाह नहीं',
  routineHeading: 'आज की कम-उत्सर्जन दिनचर्या',
  slotMorning: 'सुबह (6–10 बजे)',
  slotMidday: 'दोपहर (12–4 बजे)',
  slotEvening: 'शाम (5–9 बजे)',
  slotNight: 'रात (9 बजे–6 बजे)',
  impactLabel: 'सीधा प्रभाव',
  indoorHacksHeading: 'घर की हवा साफ रखने के उपाय',
  indoorHacksSubtitle: 'आपके बजट और घर के अनुसार क्रमबद्ध',
  estimatedBenefitLabel: 'अनुमानित लाभ',
  costFree: 'निःशुल्क',
  costLow: 'कम खर्च',
  costMedium: 'मध्यम खर्च',
  costHigh: 'अधिक खर्च',
  alternativesHeading: 'टिकाऊ विकल्प',
  alternativesSubtitle:
    'व्यावहारिक बदलाव जो व्यक्तिगत PM2.5 और मासिक कार्बन उत्सर्जन दोनों घटाते हैं',
  currentHabitLabel: 'वर्तमान आदत',
  betterSwapLabel: 'बेहतर विकल्प',
  pm25DropLabel: 'PM2.5 में कमी',
  co2SavedLabel: 'मासिक CO2 बचत',
  co2Pm25Only: 'केवल PM2.5',
  communityHeading: 'इसे सामुदायिक पहल बनाएं',
  communitySubtitle: 'मोहल्ले, RWA, स्कूल या दफ़्तर में मिलकर उठाए जाने वाले कदम',
  communityActorRwa: 'RWA / सोसाइटी',
  communityActorSchool: 'स्कूल',
  communityActorWorkplace: 'कार्यस्थल',
  communityActorNeighbours: 'पड़ोसी',
  effortLow: 'कम प्रयास',
  effortMedium: 'मध्यम प्रयास',
  effortHigh: 'अधिक प्रयास',
  communityImpactLabel: 'सामुदायिक प्रभाव',
  maskGuidanceHeading: 'मास्क और बाहरी गतिविधियों की सलाह',

  // Impact Simulator
  simulatorHeading: 'अपने विकल्पों का प्रभाव देखें',
  simulatorSubheading:
    'आपकी प्रोफ़ाइल के अनुसार: जो आदतें आप पहले से अपना रहे हैं वे बेसलाइन में गिनी जाती हैं, और नए बदलाव अतिरिक्त लाभ दिखाते हैं।',
  simulatorReset: 'विकल्प रीसेट करें',
  alreadyDoingBadge: 'पहले से कर रहे हैं ✓',
  alreadyDoingNote: 'आपके आज के बेसलाइन में शामिल',
  recommendedBadge: 'आपके लिए अनुशंसित',
  notApplicableNote: 'आपकी वर्तमान यात्रा पर लागू नहीं',
  exposureTodayLabel: 'आज आपका संपर्क',
  exposureAfterLabel: 'चुने हुए बदलावों के साथ',
  meterPm25Label: 'अतिरिक्त PM2.5 कमी',
  meterCo2Label: 'नई मासिक CO2 बचत',
  meterScoreLabel: 'वायु-अनुकूल स्कोर',
  meterOutOf100: '/ 100',
  scoreFormulaNote: 'स्कोर = 100 − शेष संपर्क (अधिकतम 95)',
  co2NotApplicable: 'CO2: —',
  meterActiveChoicesHeading: 'आपके चुने गए नए बदलावों का असर',
  meterEmptyChoices: 'अतिरिक्त लाभ देखने के लिए ऊपर दिए गए एक या अधिक लागू स्विच चालू करें।',
  communityScaleHeading: 'इसे अपने समुदाय तक बढ़ाएं',
  communityScaleLabel: 'भाग लेने वाले परिवार',
  communityScaleHomesUnit: 'परिवार',
  communityScaleCo2Label: 'अनुमानित सामुदायिक CO2 बचत / माह',
  communityScaleWasteNote: 'अनुमानित परिवार जो कचरा/बायोमास जलाना बंद करते हैं',
  communityScaleSelectHint:
    'प्रत्येक परिवार के लिए ये उपाय अपनाने पर कुल अनुमानित मासिक बचत (सामुदायिक गुणक)।',
  howCalculatedToggle: 'हमने इसकी गणना कैसे की',
  howCalculatedIntro:
    'ये सभी आंकड़े योजना बनाने के लिए अनुमानित पारिवारिक स्तर के मान हैं—लैब माप नहीं। आपकी मौजूदा आदतें बेसलाइन तय करती हैं और नए बदलाव गुणात्मक रूप से (1 − Π(1 − rᵢ)) जुड़ते हैं (अधिकतम 95% सीमा)। स्कोर = round(100 − शेष संपर्क)। CO2 केवल उत्सर्जन घटाने वाले कदमों के लिए गिना जाता है। "समुदाय तक बढ़ाएं" स्लाइडर प्रति-परिवार मासिक CO2 बचत को चुने गए परिवारों की संख्या (10–500) से गुणा करता है।',

  // Chat
  chatHeading: 'सांस से पूछें',
  chatSubheading:
    'स्मॉग, घर की हवा, मास्क या बच्चों के बाहर खेलने के बारे में कोई सवाल है? नीचे पूछें।',
  chatSuggestionsLabel: 'सुझाए गए प्रश्न',
  chatSuggestion1: 'क्या आज मेरे बच्चे का बाहर खेलना सुरक्षित है?',
  chatSuggestion2: 'घर की हवा सुधारने का सबसे सस्ता तरीका क्या है?',
  chatSuggestion3: 'क्या इंडोर पौधे सच में हवा साफ करते हैं?',
  chatInputLabel: 'अपना अगला प्रश्न पूछें',
  chatInputPlaceholder: 'मास्क, वेंटिलेशन समय, DIY फ़िल्टर, रसोई या लक्षणों के बारे में पूछें...',
  chatSend: 'पूछें',
  chatSending: 'सोच रहा है...',
  chatTypingSr: 'सांस उत्तर तैयार कर रहा है',
  chatEmptyState:
    'अपनी पारिवारिक प्रोफ़ाइल के आधार पर सलाह पाने के लिए सुझाया गया प्रश्न चुनें या अपना सवाल लिखें।',
  chatErrorFallback: 'अभी सहायक से संपर्क नहीं हो सका। कृपया कुछ क्षण बाद पुनः प्रयास करें।',

  // Fallback notice
  apiFallbackNotice:
    'लाइव बैकएंड अभी उपलब्ध नहीं है—अंतर्निहित सांस डेमो मार्गदर्शन दिखाया जा रहा है।',

  // Footer
  footerAboutHeading: 'सांस के बारे में',
  footerAboutText:
    'सांस एक शहरी वायु गुणवत्ता सहायक है जो परिवारों और समुदायों को सर्दियों के गंभीर स्मॉग से निपटने के लिए स्पष्ट, कम-उत्सर्जन उपाय सुझाता है।',
  footerMedicalHeading: 'स्वास्थ्य अस्वीकरण',
  footerMedicalText:
    'यह चिकित्सीय सलाह नहीं है। सांस सामान्य वायु-गुणवत्ता मार्गदर्शन और अनुमानित प्रभाव देता है। दमा, COPD या गंभीर लक्षणों के लिए डॉक्टर से परामर्श लें।',
  footerPrivacyHeading: 'डेटा और गोपनीयता',
  footerPrivacyText:
    'जब तक आप योजना के लिए सबमिट नहीं करते, आपके उत्तर केवल आपके ब्राउज़र में रहते हैं। कोई खाता, कुकी या स्थान डेटा सहेजा नहीं जाता।',
  footerA11yHeading: 'सुगम्यता (Accessibility)',
  footerA11yText:
    'कीबोर्ड नेविगेशन, स्क्रीन रीडर, लाइट और डार्क दोनों मोड में WCAG AA कंट्रास्ट, कम गति (reduced motion) और द्विभाषी (EN/HI) पठन के लिए डिज़ाइन किया गया।',
};
