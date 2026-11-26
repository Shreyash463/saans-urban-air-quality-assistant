import { describe, expect, it } from 'vitest';
import enLocale from '../locales/en.json';
import hiLocale from '../locales/hi.json';

describe('Bilingual EN/HI locale parity', () => {
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
});
