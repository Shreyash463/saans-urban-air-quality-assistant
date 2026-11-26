import enTranslations from '../locales/en.json';
import type { LanguageCode } from '../types';

export type TranslationKey = keyof typeof enTranslations;
export type TranslationDictionary = Record<TranslationKey, string>;

const ENGLISH_TRANSLATIONS: TranslationDictionary = enTranslations;

let hindiDictionary: TranslationDictionary | null = null;
let hindiLoadPromise: Promise<TranslationDictionary> | null = null;

/**
 * Dynamically loads the Hindi locale JSON and Devanagari font subset only when
 * Hindi is selected (0 bytes loaded on English sessions).
 */
export async function loadLanguageBundle(
  language: LanguageCode
): Promise<TranslationDictionary> {
  if (language === 'en') {
    return ENGLISH_TRANSLATIONS;
  }
  if (hindiDictionary !== null) {
    return hindiDictionary;
  }
  if (hindiLoadPromise === null) {
    hindiLoadPromise = Promise.all([
      import('../locales/hi.json'),
      import('../locales/hiFonts'),
    ]).then(([jsonMod]) => {
      hindiDictionary = jsonMod.default as TranslationDictionary;
      return hindiDictionary;
    });
  }
  return hindiLoadPromise;
}

/**
 * Looks up a localized string for the active language ('en' or 'hi').
 * Falls back cleanly to English if the async Hindi chunk is still loading.
 */
export function t(language: LanguageCode, key: TranslationKey): string {
  if (language === 'hi' && hindiDictionary !== null) {
    return hindiDictionary[key];
  }
  return ENGLISH_TRANSLATIONS[key];
}
