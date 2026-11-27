import limitsContract from '../../../contract/limits.json';
import { validateContractModel } from './contractValidator';
import type { AirQualityReading, ChatReply, PlanResponse, UserProfile } from '../types';

export const CITY_MAX_LENGTH = limitsContract.cityMaxLength;
export const CHAT_MAX_LENGTH = limitsContract.questionMaxLength;
export const MIN_HOUSEHOLD_SIZE = limitsContract.householdSizeMin;
export const MAX_HOUSEHOLD_SIZE = limitsContract.householdSizeMax;
export const MIN_COMMUTE_KM = limitsContract.commuteKmMin;
export const MAX_COMMUTE_KM = limitsContract.commuteKmMax;

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

function validateBoundedText(
  raw: string,
  maxLen: number,
  emptyKey: ValidationResult['errorKey'],
  tooLongKey: ValidationResult['errorKey'],
  pattern?: RegExp,
  invalidKey?: ValidationResult['errorKey']
): ValidationResult {
  const cleaned = stripControlChars(raw);
  if (cleaned.length === 0) return { valid: false, sanitized: '', errorKey: emptyKey };
  if (cleaned.length > maxLen) {
    return { valid: false, sanitized: cleaned.slice(0, maxLen), errorKey: tooLongKey };
  }
  if (pattern && !pattern.test(cleaned)) {
    return { valid: false, sanitized: cleaned, errorKey: invalidKey };
  }
  return { valid: true, sanitized: cleaned };
}

/** Validates a city string (1-60 Unicode letters, spaces, commas, periods, hyphens). */
export function validateCity(rawCity: string): ValidationResult {
  return validateBoundedText(
    rawCity,
    CITY_MAX_LENGTH,
    'errorCityRequired',
    'errorCityTooLong',
    ALLOWED_CITY_REGEX,
    'errorCityInvalidChars'
  );
}

/** Sanitizes a follow-up chat question and limits length to CHAT_MAX_LENGTH (500). */
export function sanitizeChatQuestion(rawQuestion: string): string {
  return stripControlChars(rawQuestion).slice(0, CHAT_MAX_LENGTH);
}

/** Validates a follow-up chat question for submission. */
export function validateChatQuestion(rawQuestion: string): ValidationResult {
  return validateBoundedText(
    rawQuestion,
    CHAT_MAX_LENGTH,
    'errorChatRequired',
    'errorChatTooLong'
  );
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
    (value as AirQualityReading).city.trim().length > 0
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
    (value as ChatReply).answer.trim().length > 0
  );
}
