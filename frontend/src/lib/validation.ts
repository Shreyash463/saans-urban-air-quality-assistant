import limitsContract from '../../../contract/limits.json';
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
const ROUTINE_SLOTS = new Set(['morning', 'midday', 'evening', 'night']);
const COST_LEVELS = new Set(['free', 'low', 'medium', 'high']);
const COMMUNITY_ACTORS = new Set(['rwa', 'school', 'workplace', 'neighbours']);
const EFFORT_LEVELS = new Set(['low', 'medium', 'high']);
const READING_SOURCES = new Set(['live', 'demo']);
const GENERATED_BY_VALUES = new Set(['gemini', 'rules']);
const FALLBACK_REASONS = new Set(['no_key', 'ai_busy', 'ai_error']);

type JsonRecord = Record<string, unknown>;

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

function stripControlChars(input: string): string {
  return input.replace(CONTROL_CHAR_REGEX, '').replace(/\s+/g, ' ').trim();
}

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

export function sanitizeChatQuestion(rawQuestion: string): string {
  return stripControlChars(rawQuestion).slice(0, CHAT_MAX_LENGTH);
}

export function validateChatQuestion(rawQuestion: string): ValidationResult {
  return validateBoundedText(
    rawQuestion,
    CHAT_MAX_LENGTH,
    'errorChatRequired',
    'errorChatTooLong'
  );
}

export function clampHouseholdSize(size: number): number {
  if (!Number.isFinite(size)) return 3;
  return Math.min(MAX_HOUSEHOLD_SIZE, Math.max(MIN_HOUSEHOLD_SIZE, Math.round(size)));
}

export function clampCommuteKm(km: number): number {
  if (!Number.isFinite(km)) return 0;
  return Math.min(MAX_COMMUTE_KM, Math.max(MIN_COMMUTE_KM, Math.round(km)));
}

export function sanitizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    city: sanitizeCity(profile.city),
    householdSize: clampHouseholdSize(profile.householdSize),
    commuteKm:
      profile.commuteMode === 'work_from_home' ? 0 : clampCommuteKm(profile.commuteKm),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(rec: JsonRecord, key: string): boolean {
  const val = rec[key];
  return typeof val === 'string' && val.length > 0;
}

function isBoundedInt(val: unknown, min: number, max: number): boolean {
  return typeof val === 'number' && Number.isInteger(val) && val >= min && val <= max;
}

function isOptional(val: unknown, check: (v: unknown) => boolean): boolean {
  return val === undefined || val === null || check(val);
}

function isRoutineItem(val: unknown): boolean {
  return (
    isRecord(val) &&
    ROUTINE_SLOTS.has(String(val.timeSlot)) &&
    hasText(val, 'title') &&
    hasText(val, 'detail') &&
    hasText(val, 'impactNote')
  );
}

function isIndoorHack(val: unknown): boolean {
  return (
    isRecord(val) &&
    hasText(val, 'title') &&
    hasText(val, 'howTo') &&
    hasText(val, 'estimatedBenefit') &&
    COST_LEVELS.has(String(val.costLevel))
  );
}

function isAlternative(val: unknown): boolean {
  return (
    isRecord(val) &&
    hasText(val, 'current') &&
    hasText(val, 'swap') &&
    hasText(val, 'why') &&
    isBoundedInt(val.pm25ReductionPct, 0, 95) &&
    isBoundedInt(val.co2SavedKgPerMonth, 0, 1000)
  );
}

function isCommunityAction(val: unknown): boolean {
  return (
    isRecord(val) &&
    hasText(val, 'title') &&
    COMMUNITY_ACTORS.has(String(val.who)) &&
    hasText(val, 'howTo') &&
    hasText(val, 'estimatedImpact') &&
    EFFORT_LEVELS.has(String(val.effort))
  );
}

function isListOf(
  val: unknown,
  minLen: number,
  check: (item: unknown) => boolean
): boolean {
  return Array.isArray(val) && val.length >= minLen && val.every(check);
}

/** Validates an external API payload against the AirQualityReading response contract. */
export function isAirQualityReading(value: unknown): value is AirQualityReading {
  if (!isRecord(value)) return false;
  return (
    hasText(value, 'city') &&
    String(value.city).trim().length > 0 &&
    isBoundedInt(value.aqi, 0, 500) &&
    hasText(value, 'dominantPollutant') &&
    typeof value.updatedAt === 'string' &&
    READING_SOURCES.has(String(value.source)) &&
    isOptional(value.sourceDetail, (v) => typeof v === 'string')
  );
}

function hasValidPlanOptionals(value: JsonRecord): boolean {
  return (
    isOptional(value.communityActions, (v) => isListOf(v, 0, isCommunityAction)) &&
    isOptional(value.generatedBy, (v) => GENERATED_BY_VALUES.has(String(v))) &&
    isOptional(value.fallbackReason, (v) => FALLBACK_REASONS.has(String(v))) &&
    isOptional(value.retryAfterSeconds, (v) => isBoundedInt(v, 0, 3600))
  );
}

/** Validates an external API payload against the PlanResponse response contract. */
export function isPlanResponse(value: unknown): value is PlanResponse {
  if (!isRecord(value) || !isAirQualityReading(value.aqi)) return false;
  return (
    hasText(value, 'summary') &&
    hasText(value, 'healthAdvisory') &&
    hasText(value, 'maskGuidance') &&
    hasText(value, 'disclaimer') &&
    isListOf(value.routine, 4, isRoutineItem) &&
    isListOf(value.indoorHacks, 1, isIndoorHack) &&
    isListOf(value.alternatives, 1, isAlternative) &&
    hasValidPlanOptionals(value)
  );
}

/** Validates an external API payload against the ChatReply response contract. */
export function isChatReply(value: unknown): value is ChatReply {
  return (
    isRecord(value) &&
    typeof value.answer === 'string' &&
    value.answer.trim().length > 0
  );
}
