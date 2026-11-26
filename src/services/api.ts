/**
 * ============================================================================
 * Saans API Layer — Single Network Boundary (No In-Browser Fake Data)
 * ============================================================================
 * All plan, chat, and air-quality responses come strictly from the backend.
 * Network errors, timeouts, rate limits, and invalid payloads throw a typed
 * ApiRequestError so the UI displays an honest, accessible retry state.
 * Coordinates are sent exclusively inside POST JSON bodies (never query URLs).
 * ============================================================================
 */

import {
  isAirQualityReading,
  isChatReply,
  isPlanResponse,
  sanitizeChatQuestion,
  sanitizeCity,
  sanitizeUserProfile,
} from '../lib/validation';
import type {
  AirQualityReading,
  ChatReply,
  Coordinates,
  PlanResponse,
  UserProfile,
} from '../types';

export const REQUEST_TIMEOUT_MS = 35_000;
const AIR_QUALITY_TIMEOUT_MS = 12_000;

export type ApiErrorKind =
  'network' | 'timeout' | 'http' | 'rate_limit' | 'invalid_payload';

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Resolves the configured backend base URL (trimmed, without trailing slash).
 * Empty string means same-origin requests (/api/...).
 */
function getApiBaseUrl(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '')
      : '';
  return raw.trim().replace(/\/+$/, '');
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    globalThis.clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiRequestError('timeout', 'Request timed out');
    }
    throw new ApiRequestError('network', 'Network request failed');
  }

  globalThis.clearTimeout(timeoutId);

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiRequestError('rate_limit', 'Rate limit exceeded', 429);
    }
    throw new ApiRequestError('http', `HTTP ${response.status}`, response.status);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ApiRequestError('invalid_payload', 'Invalid JSON response');
  }
}

function roundCoords(coords: Coordinates): Coordinates {
  return {
    lat: Number(coords.lat.toFixed(4)),
    lon: Number(coords.lon.toFixed(4)),
  };
}

/**
 * Generates a personalized clean-air plan for the given household profile.
 * Passes ephemeral coordinates inside the JSON body rather than query strings.
 */
export async function generatePlan(
  profile: UserProfile,
  coords?: Coordinates | null
): Promise<PlanResponse> {
  const cleanProfile = sanitizeUserProfile(profile);
  const hasValidCoords =
    coords !== null &&
    coords !== undefined &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lon);

  const body = hasValidCoords
    ? { ...cleanProfile, coords: roundCoords(coords), preferCoords: true }
    : cleanProfile;

  const payload = await fetchJsonWithTimeout(
    buildApiUrl('/api/plan'),
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!isPlanResponse(payload)) {
    throw new ApiRequestError('invalid_payload', 'Invalid PlanResponse payload');
  }
  return payload;
}

/**
 * Sends a follow-up question contextualized by the user's profile and active plan.
 */
export async function askFollowUp(
  question: string,
  profile: UserProfile,
  plan: PlanResponse
): Promise<ChatReply> {
  const cleanQuestion = sanitizeChatQuestion(question);
  const cleanProfile = sanitizeUserProfile(profile);

  const payload = await fetchJsonWithTimeout(
    buildApiUrl('/api/chat'),
    {
      method: 'POST',
      body: JSON.stringify({
        question: cleanQuestion,
        profile: cleanProfile,
        plan,
      }),
    },
    REQUEST_TIMEOUT_MS
  );

  if (!isChatReply(payload)) {
    throw new ApiRequestError('invalid_payload', 'Invalid ChatReply payload');
  }
  return payload;
}

/**
 * Fetches live air quality for a city via GET /api/air-quality.
 */
export async function getAirQuality(city: string): Promise<AirQualityReading> {
  const cleanCity = sanitizeCity(city) || 'Delhi';
  const url = buildApiUrl(`/api/air-quality?city=${encodeURIComponent(cleanCity)}`);
  const payload = await fetchJsonWithTimeout(
    url,
    { method: 'GET' },
    AIR_QUALITY_TIMEOUT_MS
  );

  if (!isAirQualityReading(payload)) {
    throw new ApiRequestError('invalid_payload', 'Invalid AirQualityReading payload');
  }
  return payload;
}

/**
 * Fetches live air quality for ephemeral coordinates via POST /api/air-quality body
 * so latitude and longitude never appear in URL query strings or access logs.
 */
export async function getAirQualityByCoords(
  lat: number,
  lon: number
): Promise<AirQualityReading> {
  const payload = await fetchJsonWithTimeout(
    buildApiUrl('/api/air-quality'),
    {
      method: 'POST',
      body: JSON.stringify(roundCoords({ lat, lon })),
    },
    AIR_QUALITY_TIMEOUT_MS
  );

  if (!isAirQualityReading(payload)) {
    throw new ApiRequestError('invalid_payload', 'Invalid AirQualityReading payload');
  }
  return payload;
}
