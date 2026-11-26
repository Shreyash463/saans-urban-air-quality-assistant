import aqiContract from '../../../contract/aqi-categories.json';
import type { LanguageCode } from '../types';

type AqiCategoryKey =
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
  label: { en: string; hi: string };
  shortAdvice: { en: string; hi: string };
  icon: AqiIconName;
  strokeColor: string;
  badgeClasses: string;
  textClasses: string;
}

const AQI_MIN = aqiContract.aqiRange.min;
const AQI_MAX = aqiContract.aqiRange.max;

/**
 * Official Indian CPCB National Air Quality Index categories loaded from contract/aqi-categories.json.
 */
const CPCB_AQI_CATEGORIES = aqiContract.categories as readonly AqiCategoryInfo[];

/** Clamps a numeric AQI value into the valid Indian CPCB scale [0, 500]. */
export function clampAqi(aqi: number): number {
  if (!Number.isFinite(aqi)) {
    return AQI_MIN;
  }
  return Math.min(AQI_MAX, Math.max(AQI_MIN, Math.round(aqi)));
}

/** Maps a numeric AQI reading to its Indian CPCB category metadata. */
export function getAqiCategory(aqi: number): AqiCategoryInfo {
  const clamped = clampAqi(aqi);
  const found = CPCB_AQI_CATEGORIES.find(
    (category) => clamped >= category.min && clamped <= category.max
  );
  return found ?? CPCB_AQI_CATEGORIES[CPCB_AQI_CATEGORIES.length - 1];
}

/** Computes the normalized fill ratio (0 to 1) for rendering an AQI gauge arc. */
export function getAqiGaugeRatio(aqi: number): number {
  return clampAqi(aqi) / AQI_MAX;
}

/** Builds an accessible text alternative for screen readers describing an AQI gauge. */
export function getAqiAriaLabel(aqi: number, language: LanguageCode): string {
  const clamped = clampAqi(aqi);
  const category = getAqiCategory(clamped);
  return language === 'hi'
    ? `वायु गुणवत्ता सूचकांक ${clamped}, ${category.label.hi}`
    : `Air Quality Index ${clamped}, ${category.label.en}`;
}
