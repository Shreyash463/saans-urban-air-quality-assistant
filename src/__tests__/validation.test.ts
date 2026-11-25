import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_LENGTH,
  CITY_MAX_LENGTH,
  clampCommuteKm,
  clampHouseholdSize,
  isAirQualityReading,
  isChatReply,
  isPlanResponse,
  sanitizeChatQuestion,
  sanitizeCity,
  validateChatQuestion,
  validateCity,
} from '../lib/validation';

describe('Input sanitization and validation', () => {
  it('accepts valid city names including spaces, hyphens, and Devanagari script', () => {
    expect(validateCity('New Delhi').valid).toBe(true);
    expect(validateCity('Navi-Mumbai, MH').valid).toBe(true);
    expect(validateCity('दिल्ली').valid).toBe(true);
  });

  it('rejects empty city, invalid symbols/script injection, and overlong city names', () => {
    expect(validateCity('   ').valid).toBe(false);
    expect(validateCity('   ').errorKey).toBe('errorCityRequired');

    expect(validateCity('<script>alert(1)</script>').valid).toBe(false);
    expect(validateCity('<script>alert(1)</script>').errorKey).toBe(
      'errorCityInvalidChars'
    );

    const tooLong = 'a'.repeat(CITY_MAX_LENGTH + 10);
    expect(validateCity(tooLong).valid).toBe(false);
    expect(validateCity(tooLong).errorKey).toBe('errorCityTooLong');
    expect(sanitizeCity(tooLong).length).toBe(CITY_MAX_LENGTH);
  });

  it('strips control characters and enforces the 500-char limit on chat questions', () => {
    const dirty = 'Is it\u0000 safe\u0007 today?\n\t';
    expect(sanitizeChatQuestion(dirty)).toBe('Is it safe today?');

    const overlong = 'x'.repeat(CHAT_MAX_LENGTH + 40);
    expect(validateChatQuestion(overlong).valid).toBe(false);
    expect(validateChatQuestion(overlong).errorKey).toBe('errorChatTooLong');
    expect(sanitizeChatQuestion(overlong).length).toBe(CHAT_MAX_LENGTH);
  });

  it('clamps numeric household size and commute distance safely', () => {
    expect(clampHouseholdSize(0)).toBe(1);
    expect(clampHouseholdSize(99)).toBe(15);
    expect(clampCommuteKm(-5)).toBe(0);
    expect(clampCommuteKm(500)).toBe(120);
  });

  it('rejects malformed external API response shapes via type guards', () => {
    expect(isAirQualityReading({ city: 'Delhi', aqi: 'bad' })).toBe(false);
    expect(isPlanResponse({ aqi: null })).toBe(false);
    expect(isChatReply({ answer: '' })).toBe(false);
    expect(isChatReply({ answer: 'Stay indoors during peak smog.' })).toBe(true);
  });
});
