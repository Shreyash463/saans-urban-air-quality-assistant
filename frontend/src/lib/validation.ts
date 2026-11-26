import { validateContractModel } from './contractValidator';
import type { AirQualityReading, ChatReply, PlanResponse, UserProfile } from '../types';

export const CITY_MAX_LENGTH = 60;
export const CHAT_MAX_LENGTH = 500;
export const MIN_HOUSEHOLD_SIZE = 1;
export const MAX_HOUSEHOLD_SIZE = 15;
export const MIN_COMMUTE_KM = 0;
export const MAX_COMMUTE_KM = 120;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;
const ALLOWED_CITY_REGEX = /^[\p{L}\p{M}\s,.-]+$/u;

export interface ValidationResult {
  valid: boolean;
  sanitized: string;
  errorKey?:
    | 'errorCityRequired'
    | 'errorCityInvalidChars'
    | 'errorCityTooLong'
    | 'errorChatRequired'
    | 'errorChatTooLong';
}

/** Strips ASCII/Unicode control characters and collapses whitespace. */
function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '').replace(/\s+/g, ' ').trim();
}

/** Sanitizes a city input string and truncates strictly to CITY_MAX_LENGTH (60). */
export function sanitizeCity(rawCity: string): string {
  return stripControlChars(rawCity).slice(0, CITY_MAX_LENGTH);
}

/** Validates a city string (1-60 Unicode letters, spaces, commas, periods, hyphens). */
export function validateCity(rawCity: string): ValidationResult {
  const cleaned = stripControlChars(rawCity);
  if (cleaned.length === 0) {
    return { valid: false, sanitized: '', errorKey: 'errorCityRequired' };
  }
  if (cleaned.length > CITY_MAX_LENGTH) {
    return {
      valid: false,
      sanitized: cleaned.slice(0, CITY_MAX_LENGTH),
      errorKey: 'errorCityTooLong',
    };
  }
  if (!ALLOWED_CITY_REGEX.test(cleaned)) {
    return { valid: false, sanitized: cleaned, errorKey: 'errorCityInvalidChars' };
  }
  return { valid: true, sanitized: cleaned };
}

/** Sanitizes a follow-up chat question and limits length to CHAT_MAX_LENGTH (500). */
export function sanitizeChatQuestion(rawQuestion: string): string {
  return stripControlChars(rawQuestion).slice(0, CHAT_MAX_LENGTH);
}

/** Validates a follow-up chat question for submission. */
export function validateChatQuestion(rawQuestion: string): ValidationResult {
  const cleaned = stripControlChars(rawQuestion);
  if (cleaned.length === 0) {
    return { valid: false, sanitized: '', errorKey: 'errorChatRequired' };
  }
  if (cleaned.length > CHAT_MAX_LENGTH) {
    return {
      valid: false,
      sanitized: cleaned.slice(0, CHAT_MAX_LENGTH),
      errorKey: 'errorChatTooLong',
    };
  }
  return { valid: true, sanitized: cleaned };
}

/** Clamps household size into [MIN_HOUSEHOLD_SIZE, MAX_HOUSEHOLD_SIZE]. */
export function clampHouseholdSize(size: number): number {
  if (!Number.isFinite(size)) return 3;
  return Math.min(MAX_HOUSEHOLD_SIZE, Math.max(MIN_HOUSEHOLD_SIZE, Math.round(size)));
}

/** Clamps daily commute distance (km) into [MIN_COMMUTE_KM, MAX_COMMUTE_KM]. */
export function clampCommuteKm(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.min(MAX_COMMUTE_KM, Math.max(MIN_COMMUTE_KM, Math.round(km)));
}

/** Produces a sanitized copy of a UserProfile before API dispatch or storage. */
export function sanitizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    city: sanitizeCity(profile.city),
    householdSize: clampHouseholdSize(profile.householdSize),
    commuteKm:
      profile.commuteMode === 'work_from_home' ? 0 : clampCommuteKm(profile.commuteKm),
  };
}

/** Validates an external API payload against the generated AirQualityReading schema. */
export function isAirQualityReading(value: unknown): value is AirQualityReading {
  return (
    validateContractModel('AirQualityReading', value) &&
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { city?: unknown }).city === 'string' &&
    (value as { city: string }).city.trim().length > 0
  );
}

/** Validates an external API payload against the generated PlanResponse schema. */
export function isPlanResponse(value: unknown): value is PlanResponse {
  return validateContractModel('PlanResponse', value);
}

/** Validates an external API payload against the generated ChatReply schema. */
export function isChatReply(value: unknown): value is ChatReply {
  return (
    validateContractModel('ChatReply', value) &&
    typeof (value as { answer?: unknown }).answer === 'string' &&
    (value as { answer: string }).answer.trim().length > 0
  );
}
