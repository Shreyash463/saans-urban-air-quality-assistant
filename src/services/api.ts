/**
 * ============================================================================
 * Saans API Layer — Single Network Boundary
 * ============================================================================
 * This is the ONLY file in the frontend that performs network requests.
 *
 * Resilience & Security:
 * - Enforces explicit AbortController timeouts for plan, chat, and AQI calls.
 * - Sanitizes all user inputs before dispatch.
 * - Dynamically imports deterministic mock generators only when forced or offline
 *   so the initial JS bundle stays lean.
 * - Never persists or logs geolocation coordinates.
 * ============================================================================
 */

import { getMockAirQuality } from '../lib/demoCities';
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
export const AIR_QUALITY_TIMEOUT_MS = 12_000;
const APPROX_LOCATION_LABEL = 'Your location (approx.)';

/**
 * Returns true only when VITE_USE_MOCK="true" is explicitly configured.
 */
export function isMockForced(): boolean {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? ((import.meta.env.VITE_USE_MOCK as string | undefined) ?? '')
      : '';
  return raw.trim().toLowerCase() === 'true';
}

/**
 * Resolves the configured backend base URL (trimmed, without trailing slash).
 * Empty string means same-origin requests (/api/...).
 */
export function getApiBaseUrl(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env
      ? ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '')
      : '';
  return raw.trim().replace(/\/+$/, '');
}

type FallbackListener = (usingFallback: boolean) => void;
const fallbackListeners = new Set<FallbackListener>();

/**
 * Registers a UI listener notified whenever a live API request falls back
 * to the deterministic mock due to network, timeout, HTTP, or schema errors.
 */
export function subscribeApiFallback(listener: FallbackListener): () => void {
  fallbackListeners.add(listener);
  return () => {
    fallbackListeners.delete(listener);
  };
}

function notifyFallback(usingFallback: boolean): void {
  for (const listener of fallbackListeners) {
    listener(usingFallback);
  }
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as unknown;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Generates a personalized clean-air plan for the given household profile.
 * Optionally passes ephemeral geolocation coordinates via query parameters
 * without ever storing them in the profile or browser storage.
 */
export async function generatePlan(
  profile: UserProfile,
  coords?: Coordinates | null
): Promise<PlanResponse> {
  const cleanProfile = sanitizeUserProfile(profile);

  if (isMockForced()) {
    notifyFallback(false);
    const { generateMockPlan } = await import('./mockPlanGenerator');
    const mock = generateMockPlan(cleanProfile);
    return coords
      ? { ...mock, aqi: { ...mock.aqi, city: APPROX_LOCATION_LABEL } }
      : mock;
  }

  try {
    const path =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon)
        ? `/api/plan?lat=${encodeURIComponent(coords.lat.toFixed(4))}&lon=${encodeURIComponent(coords.lon.toFixed(4))}`
        : '/api/plan';
    const payload = await fetchJsonWithTimeout(
      buildApiUrl(path),
      {
        method: 'POST',
        body: JSON.stringify(cleanProfile),
      },
      REQUEST_TIMEOUT_MS
    );

    if (!isPlanResponse(payload)) {
      throw new Error('Invalid PlanResponse payload');
    }

    notifyFallback(false);
    return payload;
  } catch {
    notifyFallback(true);
    const { generateMockPlan } = await import('./mockPlanGenerator');
    const mock = generateMockPlan(cleanProfile);
    return coords
      ? { ...mock, aqi: { ...mock.aqi, city: APPROX_LOCATION_LABEL } }
      : mock;
  }
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

  if (isMockForced()) {
    notifyFallback(false);
    const { generateMockChatReply } = await import('./mockPlanGenerator');
    return generateMockChatReply(cleanQuestion, cleanProfile, plan);
  }

  try {
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
      throw new Error('Invalid ChatReply payload');
    }

    notifyFallback(false);
    return payload;
  } catch {
    notifyFallback(true);
    const { generateMockChatReply } = await import('./mockPlanGenerator');
    return generateMockChatReply(cleanQuestion, cleanProfile, plan);
  }
}

/**
 * Fetches the current air quality reading for a city.
 */
export async function getAirQuality(city: string): Promise<AirQualityReading> {
  const cleanCity = sanitizeCity(city) || 'Delhi';

  if (isMockForced()) {
    notifyFallback(false);
    return getMockAirQuality(cleanCity);
  }

  try {
    const url = buildApiUrl(`/api/air-quality?city=${encodeURIComponent(cleanCity)}`);
    const payload = await fetchJsonWithTimeout(
      url,
      { method: 'GET' },
      AIR_QUALITY_TIMEOUT_MS
    );

    if (!isAirQualityReading(payload)) {
      throw new Error('Invalid AirQualityReading payload');
    }

    notifyFallback(false);
    return payload;
  } catch {
    notifyFallback(true);
    return getMockAirQuality(cleanCity);
  }
}

/**
 * Fetches live air quality directly for ephemeral geolocation coordinates.
 */
export async function getAirQualityByCoords(
  lat: number,
  lon: number
): Promise<AirQualityReading> {
  if (isMockForced()) {
    notifyFallback(false);
    return { ...getMockAirQuality('Delhi'), city: APPROX_LOCATION_LABEL };
  }

  try {
    const url = buildApiUrl(
      `/api/air-quality?lat=${encodeURIComponent(lat.toFixed(4))}&lon=${encodeURIComponent(lon.toFixed(4))}`
    );
    const payload = await fetchJsonWithTimeout(
      url,
      { method: 'GET' },
      AIR_QUALITY_TIMEOUT_MS
    );

    if (!isAirQualityReading(payload)) {
      throw new Error('Invalid AirQualityReading payload');
    }

    notifyFallback(false);
    return payload;
  } catch {
    notifyFallback(true);
    return { ...getMockAirQuality('Delhi'), city: APPROX_LOCATION_LABEL };
  }
}
