import type { LanguageCode } from '../types';

export type AqiCategoryKey =
  'good' | 'satisfactory' | 'moderate' | 'poor' | 'very_poor' | 'severe';

export type AqiIconName =
  | 'check-circle'
  | 'wind'
  | 'cloud-sun'
  | 'cloud-fog'
  | 'alert-triangle'
  | 'shield-alert';

export interface AqiCategoryInfo {
  key: AqiCategoryKey;
  min: number;
  max: number;
  label: {
    en: string;
    hi: string;
  };
  shortAdvice: {
    en: string;
    hi: string;
  };
  icon: AqiIconName;
  /** Accessible stroke color for the SVG AQI arc */
  strokeColor: string;
  /** WCAG AA text & border classes for light and dark surfaces */
  badgeClasses: string;
  textClasses: string;
}

export const AQI_MIN = 0;
export const AQI_MAX = 500;

/**
 * Official Indian CPCB (Central Pollution Control Board) National Air Quality Index scale.
 */
export const CPCB_AQI_CATEGORIES: readonly AqiCategoryInfo[] = [
  {
    key: 'good',
    min: 0,
    max: 50,
    label: { en: 'Good', hi: 'अच्छा' },
    shortAdvice: {
      en: 'Minimal health impact. Great time to cross-ventilate your home.',
      hi: 'स्वास्थ्य पर न्यूनतम प्रभाव। घर में ताज़ी हवा आने देने का बढ़िया समय।',
    },
    icon: 'check-circle',
    strokeColor: '#16A34A',
    badgeClasses:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800',
    textClasses: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    key: 'satisfactory',
    min: 51,
    max: 100,
    label: { en: 'Satisfactory', hi: 'संतोषजनक' },
    shortAdvice: {
      en: 'Minor breathing discomfort possible for very sensitive individuals.',
      hi: 'अत्यधिक संवेदनशील लोगों को हल्की सांस की तकलीफ हो सकती है।',
    },
    icon: 'wind',
    strokeColor: '#65A30D',
    badgeClasses:
      'bg-lime-50 text-lime-900 border-lime-300 dark:bg-lime-950/60 dark:text-lime-200 dark:border-lime-800',
    textClasses: 'text-lime-800 dark:text-lime-300',
  },
  {
    key: 'moderate',
    min: 101,
    max: 200,
    label: { en: 'Moderate', hi: 'मध्यम' },
    shortAdvice: {
      en: 'Discomfort for people with asthma, children, and older adults.',
      hi: 'दमा रोगियों, बच्चों और बुजुर्गों को सांस लेने में तकलीफ हो सकती है।',
    },
    icon: 'cloud-sun',
    strokeColor: '#D97706',
    badgeClasses:
      'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800',
    textClasses: 'text-amber-800 dark:text-amber-300',
  },
  {
    key: 'poor',
    min: 201,
    max: 300,
    label: { en: 'Poor', hi: 'खराब' },
    shortAdvice: {
      en: 'Breathing discomfort on prolonged exposure. Wear an N95 outdoors.',
      hi: 'लंबे समय तक बाहर रहने पर सांस की तकलीफ। बाहर N95 मास्क पहनें।',
    },
    icon: 'cloud-fog',
    strokeColor: '#EA580C',
    badgeClasses:
      'bg-orange-50 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800',
    textClasses: 'text-orange-800 dark:text-orange-300',
  },
  {
    key: 'very_poor',
    min: 301,
    max: 400,
    label: { en: 'Very Poor', hi: 'बहुत खराब' },
    shortAdvice: {
      en: 'Respiratory illness risk on prolonged exposure. Avoid morning outdoor exercise.',
      hi: 'लंबे समय तक संपर्क में रहने से श्वसन रोग का जोखिम। सुबह बाहर व्यायाम न करें।',
    },
    icon: 'alert-triangle',
    strokeColor: '#DC2626',
    badgeClasses:
      'bg-red-50 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800',
    textClasses: 'text-red-800 dark:text-red-300',
  },
  {
    key: 'severe',
    min: 401,
    max: 500,
    label: { en: 'Severe', hi: 'गंभीर' },
    shortAdvice: {
      en: 'Affects healthy people and seriously impacts vulnerable groups. Stay indoors.',
      hi: 'स्वस्थ लोगों पर भी असर और संवेदनशील वर्गों पर गंभीर प्रभाव। घर के अंदर रहें।',
    },
    icon: 'shield-alert',
    strokeColor: '#991B1B',
    badgeClasses:
      'bg-rose-100 text-rose-950 border-rose-400 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-700',
    textClasses: 'text-rose-900 dark:text-rose-300',
  },
] as const;

/**
 * Clamps a numeric AQI value into the valid Indian CPCB scale [0, 500].
 * Non-finite inputs default to 0.
 */
export function clampAqi(aqi: number): number {
  if (!Number.isFinite(aqi)) {
    return AQI_MIN;
  }
  return Math.min(AQI_MAX, Math.max(AQI_MIN, Math.round(aqi)));
}

/**
 * Maps a numeric AQI reading to its Indian CPCB category metadata.
 * Boundaries: 0-50 Good, 51-100 Satisfactory, 101-200 Moderate,
 * 201-300 Poor, 301-400 Very Poor, 401-500 Severe.
 */
export function getAqiCategory(aqi: number): AqiCategoryInfo {
  const clamped = clampAqi(aqi);
  const found = CPCB_AQI_CATEGORIES.find(
    (category) => clamped >= category.min && clamped <= category.max
  );
  return found ?? CPCB_AQI_CATEGORIES[CPCB_AQI_CATEGORIES.length - 1];
}

/**
 * Computes the normalized fill ratio (0 to 1) for rendering an AQI gauge arc.
 */
export function getAqiGaugeRatio(aqi: number): number {
  return clampAqi(aqi) / AQI_MAX;
}

/**
 * Builds an accessible text alternative for screen readers describing an AQI gauge.
 */
export function getAqiAriaLabel(aqi: number, language: LanguageCode): string {
  const clamped = clampAqi(aqi);
  const category = getAqiCategory(clamped);
  if (language === 'hi') {
    return `वायु गुणवत्ता सूचकांक ${clamped}, ${category.label.hi}`;
  }
  return `Air Quality Index ${clamped}, ${category.label.en}`;
}
