import type {
  AirQualityReading,
  Alternative,
  ChatReply,
  IndoorHack,
  PlanResponse,
  RoutineItem,
  UserProfile,
} from '../types';

export const CITY_MAX_LENGTH = 60;
export const CHAT_MAX_LENGTH = 500;
export const MIN_HOUSEHOLD_SIZE = 1;
export const MAX_HOUSEHOLD_SIZE = 15;
export const MIN_COMMUTE_KM = 0;
export const MAX_COMMUTE_KM = 120;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/g;
/**
 * Allows Unicode letters (including Devanagari), spaces, commas, hyphens, and periods.
 */
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

/**
 * Strips ASCII/Unicode control characters and collapses excessive whitespace.
 */
export function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '').replace(/\s+/g, ' ').trim();
}

/**
 * Sanitizes a city input string by removing control characters and truncating
 * strictly to CITY_MAX_LENGTH (60 characters).
 */
export function sanitizeCity(rawCity: string): string {
  return stripControlChars(rawCity).slice(0, CITY_MAX_LENGTH);
}

/**
 * Validates a city string: must be non-empty, <= 60 chars, and contain only
 * letters, spaces, commas, hyphens, or periods.
 */
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
    return {
      valid: false,
      sanitized: cleaned,
      errorKey: 'errorCityInvalidChars',
    };
  }
  return { valid: true, sanitized: cleaned };
}

/**
 * Sanitizes a follow-up chat question: strips control characters and limits
 * length strictly to CHAT_MAX_LENGTH (500 characters).
 */
export function sanitizeChatQuestion(rawQuestion: string): string {
  return stripControlChars(rawQuestion).slice(0, CHAT_MAX_LENGTH);
}

/**
 * Validates a follow-up chat question for submission.
 */
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

/**
 * Clamps household size into [MIN_HOUSEHOLD_SIZE, MAX_HOUSEHOLD_SIZE].
 */
export function clampHouseholdSize(size: number): number {
  if (!Number.isFinite(size)) {
    return 3;
  }
  return Math.min(MAX_HOUSEHOLD_SIZE, Math.max(MIN_HOUSEHOLD_SIZE, Math.round(size)));
}

/**
 * Clamps daily commute distance (km) into [MIN_COMMUTE_KM, MAX_COMMUTE_KM].
 */
export function clampCommuteKm(km: number): number {
  if (!Number.isFinite(km)) {
    return 0;
  }
  return Math.min(MAX_COMMUTE_KM, Math.max(MIN_COMMUTE_KM, Math.round(km)));
}

/**
 * Produces a sanitized copy of a UserProfile before sending to the API layer or storage.
 */
export function sanitizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    city: sanitizeCity(profile.city),
    householdSize: clampHouseholdSize(profile.householdSize),
    commuteKm:
      profile.commuteMode === 'work_from_home' ? 0 : clampCommuteKm(profile.commuteKm),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard verifying an external API payload matches AirQualityReading.
 */
export function isAirQualityReading(value: unknown): value is AirQualityReading {
  if (!isRecord(value)) return false;
  return (
    typeof value.city === 'string' &&
    value.city.trim().length > 0 &&
    typeof value.aqi === 'number' &&
    Number.isFinite(value.aqi) &&
    value.aqi >= 0 &&
    value.aqi <= 1000 &&
    typeof value.dominantPollutant === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.source === 'live' || value.source === 'demo') &&
    (value.sourceDetail === undefined || typeof value.sourceDetail === 'string')
  );
}

function isRoutineItem(value: unknown): value is RoutineItem {
  if (!isRecord(value)) return false;
  const validSlots = ['morning', 'midday', 'evening', 'night'];
  return (
    typeof value.timeSlot === 'string' &&
    validSlots.includes(value.timeSlot) &&
    typeof value.title === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.impactNote === 'string'
  );
}

function isIndoorHack(value: unknown): value is IndoorHack {
  if (!isRecord(value)) return false;
  const validCosts = ['free', 'low', 'medium', 'high'];
  return (
    typeof value.title === 'string' &&
    typeof value.howTo === 'string' &&
    typeof value.estimatedBenefit === 'string' &&
    typeof value.costLevel === 'string' &&
    validCosts.includes(value.costLevel)
  );
}

function isAlternative(value: unknown): value is Alternative {
  if (!isRecord(value)) return false;
  return (
    typeof value.current === 'string' &&
    typeof value.swap === 'string' &&
    typeof value.why === 'string' &&
    typeof value.pm25ReductionPct === 'number' &&
    Number.isFinite(value.pm25ReductionPct) &&
    typeof value.co2SavedKgPerMonth === 'number' &&
    Number.isFinite(value.co2SavedKgPerMonth)
  );
}

/**
 * Type guard verifying an external API payload matches PlanResponse.
 */
export function isPlanResponse(value: unknown): value is PlanResponse {
  if (!isRecord(value)) return false;
  return (
    isAirQualityReading(value.aqi) &&
    typeof value.summary === 'string' &&
    typeof value.healthAdvisory === 'string' &&
    Array.isArray(value.routine) &&
    value.routine.length > 0 &&
    value.routine.every(isRoutineItem) &&
    Array.isArray(value.indoorHacks) &&
    value.indoorHacks.length > 0 &&
    value.indoorHacks.every(isIndoorHack) &&
    Array.isArray(value.alternatives) &&
    value.alternatives.length > 0 &&
    value.alternatives.every(isAlternative) &&
    typeof value.maskGuidance === 'string' &&
    typeof value.disclaimer === 'string' &&
    (value.generatedBy === undefined ||
      value.generatedBy === 'gemini' ||
      value.generatedBy === 'rules')
  );
}

/**
 * Type guard verifying an external API payload matches ChatReply.
 */
export function isChatReply(value: unknown): value is ChatReply {
  if (!isRecord(value)) return false;
  return typeof value.answer === 'string' && value.answer.trim().length > 0;
}
