import { describe, expect, it, vi } from 'vitest';
import { I18nLoader } from '../lib/i18n';
import enLocale from '../locales/en.json';
import hiLocale from '../locales/hi.json';

describe('Bilingual EN/HI locale parity and I18nLoader encapsulation', () => {
  it('keeps identical key sets and non-empty strings in en.json and hi.json', () => {
    const enKeys = Object.keys(enLocale).sort();
    const hiKeys = Object.keys(hiLocale).sort();
    expect(hiKeys).toEqual(enKeys);

    for (const key of enKeys) {
      expect(
        String(enLocale[key as keyof typeof enLocale]).trim().length
      ).toBeGreaterThan(0);
      expect(
        String(hiLocale[key as keyof typeof hiLocale]).trim().length
      ).toBeGreaterThan(0);
    }
  });

  it('keeps Hindi unloaded until requested and deduplicates concurrent loadLanguageBundle calls', async () => {
    const loadHindi = vi.fn().mockResolvedValue(hiLocale);
    const loader = new I18nLoader(enLocale, loadHindi);

    expect(loader.isHindiLoaded).toBe(false);
    expect(loader.t('hi', 'communityHeading')).toBe(enLocale.communityHeading);
    await expect(loader.loadLanguageBundle('en')).resolves.toBe(enLocale);
    expect(loadHindi).not.toHaveBeenCalled();

    const [first, second] = await Promise.all([
      loader.loadLanguageBundle('hi'),
      loader.loadLanguageBundle('hi'),
    ]);
    expect(first).toBe(hiLocale);
    expect(second).toBe(hiLocale);
    expect(loadHindi).toHaveBeenCalledTimes(1);
    expect(loader.isHindiLoaded).toBe(true);
    expect(loader.t('hi', 'communityHeading')).toBe(hiLocale.communityHeading);
  });
});
