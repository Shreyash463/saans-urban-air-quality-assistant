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

/** Resolves base URL from VITE_API_BASE_URL (empty string uses same-origin /api/...). */
function buildApiUrl(path: string): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '')
      : '';
  const base = raw.trim().replace(/\/+$/, '');
  return base ? `${base}${path}` : path;
}

async function parseJsonResponse(
  response: Response,
  ext?: AbortSignal
): Promise<unknown> {
  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiRequestError('rate_limit', 'Rate limit exceeded', 429);
    }
    throw new ApiRequestError('http', `HTTP ${response.status}`, response.status);
  }
  try {
    return (await response.json()) as unknown;
  } catch (err) {
    if (ext?.aborted) {
      throw err instanceof DOMException
        ? err
        : new DOMException('Aborted', 'AbortError');
    }
    throw new ApiRequestError('invalid_payload', 'Invalid JSON response');
  }
}

function mapFetchError(err: unknown, ext?: AbortSignal): Error {
  if (ext?.aborted) {
    return err instanceof DOMException
      ? err
      : new DOMException('Aborted', 'AbortError');
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ApiRequestError('timeout', 'Request timed out');
  }
  return new ApiRequestError('network', 'Network request failed');
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  const ext = init.signal ?? undefined;
  if (ext?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  ext?.addEventListener('abort', onAbort, { once: true });
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
    throw mapFetchError(err, ext);
  } finally {
    ext?.removeEventListener('abort', onAbort);
    globalThis.clearTimeout(timeoutId);
  }
  return parseJsonResponse(response, ext);
}

function roundCoords(coords: Coordinates): Coordinates {
  return {
    lat: Number(coords.lat.toFixed(4)),
    lon: Number(coords.lon.toFixed(4)),
  };
}

async function fetchValidated<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  guard: (v: unknown) => v is T,
  label: string
): Promise<T> {
  const payload = await fetchJsonWithTimeout(buildApiUrl(path), init, timeoutMs);
  if (!guard(payload)) {
    throw new ApiRequestError('invalid_payload', `Invalid ${label} payload`);
  }
  return payload;
}

/**
 * Generates a personalized clean-air plan for the given household profile.
 * Passes ephemeral coordinates inside the JSON body rather than query strings.
 */
export function generatePlan(
  profile: UserProfile,
  coords?: Coordinates | null,
  signal?: AbortSignal
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

  return fetchValidated(
    '/api/plan',
    { method: 'POST', body: JSON.stringify(body), signal },
    REQUEST_TIMEOUT_MS,
    isPlanResponse,
    'PlanResponse'
  );
}

/**
 * Sends a follow-up question contextualized by the user's profile and active plan.
 */
export function askFollowUp(
  question: string,
  profile: UserProfile,
  plan: PlanResponse
): Promise<ChatReply> {
  return fetchValidated(
    '/api/chat',
    {
      method: 'POST',
      body: JSON.stringify({
        question: sanitizeChatQuestion(question),
        profile: sanitizeUserProfile(profile),
        plan,
      }),
    },
    REQUEST_TIMEOUT_MS,
    isChatReply,
    'ChatReply'
  );
}

/**
 * Fetches live air quality for a city via GET /api/air-quality.
 */
export function getAirQuality(city: string): Promise<AirQualityReading> {
  const cleanCity = sanitizeCity(city) || 'Delhi';
  return fetchValidated(
    `/api/air-quality?city=${encodeURIComponent(cleanCity)}`,
    { method: 'GET' },
    AIR_QUALITY_TIMEOUT_MS,
    isAirQualityReading,
    'AirQualityReading'
  );
}

/**
 * Fetches live air quality for ephemeral coordinates via POST /api/air-quality body
 * so latitude and longitude never appear in URL query strings or access logs.
 */
export function getAirQualityByCoords(
  lat: number,
  lon: number
): Promise<AirQualityReading> {
  return fetchValidated(
    '/api/air-quality',
    { method: 'POST', body: JSON.stringify(roundCoords({ lat, lon })) },
    AIR_QUALITY_TIMEOUT_MS,
    isAirQualityReading,
    'AirQualityReading'
  );
}
