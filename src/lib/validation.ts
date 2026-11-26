import type {
  AirQualityReading,
  Alternative,
  ChatReply,
  CommunityAction,
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

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function allItems<T>(
  arr: unknown,
  predicate: (item: unknown) => item is T
): arr is T[] {
  return Array.isArray(arr) && arr.length > 0 && arr.every(predicate);
}

/**
 * Type guard verifying an external API payload matches AirQualityReading.
 */
export function isAirQualityReading(value: unknown): value is AirQualityReading {
  if (!isRecord(value)) return false;
  const validSource = value.source === 'live' || value.source === 'demo';
  const validDetail =
    value.sourceDetail === undefined ||
    value.sourceDetail === null ||
    isString(value.sourceDetail);
  return (
    isString(value.city) &&
    value.city.trim().length > 0 &&
    isFiniteNum(value.aqi) &&
    value.aqi >= 0 &&
    value.aqi <= 1000 &&
    isString(value.dominantPollutant) &&
    isString(value.updatedAt) &&
    validSource &&
    validDetail
  );
}

function isRoutineItem(value: unknown): value is RoutineItem {
  if (!isRecord(value)) return false;
  return (
    isString(value.timeSlot) &&
    ['morning', 'midday', 'evening', 'night'].includes(value.timeSlot) &&
    isString(value.title) &&
    isString(value.detail) &&
    isString(value.impactNote)
  );
}

function isIndoorHack(value: unknown): value is IndoorHack {
  if (!isRecord(value)) return false;
  return (
    isString(value.title) &&
    isString(value.howTo) &&
    isString(value.estimatedBenefit) &&
    isString(value.costLevel) &&
    ['free', 'low', 'medium', 'high'].includes(value.costLevel)
  );
}

function isAlternative(value: unknown): value is Alternative {
  if (!isRecord(value)) return false;
  return (
    isString(value.current) &&
    isString(value.swap) &&
    isString(value.why) &&
    isFiniteNum(value.pm25ReductionPct) &&
    isFiniteNum(value.co2SavedKgPerMonth)
  );
}

function isCommunityAction(value: unknown): value is CommunityAction {
  if (!isRecord(value)) return false;
  return (
    isString(value.title) &&
    isString(value.who) &&
    ['rwa', 'school', 'workplace', 'neighbours'].includes(value.who) &&
    isString(value.howTo) &&
    isString(value.estimatedImpact) &&
    isString(value.effort) &&
    ['low', 'medium', 'high'].includes(value.effort)
  );
}

function isUnset(value: unknown): boolean {
  return value === undefined || value === null;
}

function hasValidPlanMeta(value: Record<string, unknown>): boolean {
  const validCommunity =
    isUnset(value.communityActions) ||
    (Array.isArray(value.communityActions) &&
      value.communityActions.every(isCommunityAction));
  const validGen =
    isUnset(value.generatedBy) ||
    value.generatedBy === 'gemini' ||
    value.generatedBy === 'rules';
  const validFallbackReason =
    isUnset(value.fallbackReason) ||
    value.fallbackReason === 'no_key' ||
    value.fallbackReason === 'ai_busy' ||
    value.fallbackReason === 'ai_error';
  const validRetryAfter =
    isUnset(value.retryAfterSeconds) ||
    (isFiniteNum(value.retryAfterSeconds) && value.retryAfterSeconds >= 0);
  const validOfflineSample =
    isUnset(value.isOfflineSample) || typeof value.isOfflineSample === 'boolean';
  return (
    validCommunity &&
    validGen &&
    validFallbackReason &&
    validRetryAfter &&
    validOfflineSample
  );
}

/**
 * Type guard verifying an external API payload matches PlanResponse.
 */
export function isPlanResponse(value: unknown): value is PlanResponse {
  if (!isRecord(value)) return false;
  return (
    isAirQualityReading(value.aqi) &&
    isString(value.summary) &&
    isString(value.healthAdvisory) &&
    allItems(value.routine, isRoutineItem) &&
    allItems(value.indoorHacks, isIndoorHack) &&
    allItems(value.alternatives, isAlternative) &&
    isString(value.maskGuidance) &&
    isString(value.disclaimer) &&
    hasValidPlanMeta(value)
  );
}

/**
 * Type guard verifying an external API payload matches ChatReply.
 */
export function isChatReply(value: unknown): value is ChatReply {
  if (!isRecord(value)) return false;
  return typeof value.answer === 'string' && value.answer.trim().length > 0;
}
