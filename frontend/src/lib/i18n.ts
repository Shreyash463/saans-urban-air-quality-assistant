import enTranslations from '../locales/en.json';
import type { LanguageCode } from '../types';

export type TranslationKey = keyof typeof enTranslations;
export type TranslationDictionary = Record<TranslationKey, string>;
export type HindiBundleLoader = () => Promise<TranslationDictionary>;

async function loadDefaultHindiBundle(): Promise<TranslationDictionary> {
  const [jsonMod] = await Promise.all([
    import('../locales/hi.json'),
    import('../locales/hiFonts'),
  ]);
  return jsonMod.default as TranslationDictionary;
}

/**
 * Encapsulates translation dictionary state and lazy Hindi chunk loading so
 * English sessions incur zero Hindi copy or Devanagari font downloads.
 */
export class I18nLoader {
  private readonly enDictionary: TranslationDictionary;
  private readonly loadHindi: HindiBundleLoader;
  private hindiDictionary: TranslationDictionary | null = null;
  private hindiLoadPromise: Promise<TranslationDictionary> | null = null;

  constructor(
    enDictionary: TranslationDictionary,
    loadHindi: HindiBundleLoader = loadDefaultHindiBundle
  ) {
    this.enDictionary = enDictionary;
    this.loadHindi = loadHindi;
  }

  get isHindiLoaded(): boolean {
    return this.hindiDictionary !== null;
  }

  async loadLanguageBundle(language: LanguageCode): Promise<TranslationDictionary> {
    if (language === 'en') {
      return this.enDictionary;
    }
    if (this.hindiDictionary !== null) {
      return this.hindiDictionary;
    }
    if (this.hindiLoadPromise === null) {
      this.hindiLoadPromise = this.loadHindi().then((dict) => {
        this.hindiDictionary = dict;
        return dict;
      });
    }
    return this.hindiLoadPromise;
  }

  t(language: LanguageCode, key: TranslationKey): string {
    if (language === 'hi' && this.hindiDictionary !== null) {
      return this.hindiDictionary[key];
    }
    return this.enDictionary[key];
  }
}

const defaultLoader = new I18nLoader(enTranslations);

export function loadLanguageBundle(
  language: LanguageCode
): Promise<TranslationDictionary> {
  return defaultLoader.loadLanguageBundle(language);
}

export function t(language: LanguageCode, key: TranslationKey): string {
  return defaultLoader.t(language, key);
}
