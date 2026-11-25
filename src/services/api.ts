/**
 * ============================================================================
 * Saans API Layer — Single Network Boundary
 * ============================================================================
 * This is the ONLY file in the frontend that performs network requests.
 *
 * Configuration:
 *   VITE_API_BASE_URL (default: "" — same-origin /api, proxied to FastAPI in dev)
 *   VITE_USE_MOCK     ("true" forces built-in deterministic mock mode)
 *
 * Resilience & Security:
 * - Enforces a 30-second AbortController timeout for plan/chat requests.
 * - Sanitizes all user inputs before dispatch.
 * - Validates every response against strict runtime type guards.
 * - Network, timeout, HTTP, or schema errors fall back seamlessly to the
 *   deterministic mock generator and emit a non-blocking notice to the UI.
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
import type { AirQualityReading, ChatReply, PlanResponse, UserProfile } from '../types';
import {
  generateMockChatReply,
  generateMockPlan,
  getMockAirQuality,
} from './mockPlanGenerator';

export const REQUEST_TIMEOUT_MS = 35_000;
export const AIR_QUALITY_TIMEOUT_MS = 12_000;

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
 * Calls POST {API_BASE_URL}/api/plan by default, or uses mock when forced/unreachable.
 */
export async function generatePlan(profile: UserProfile): Promise<PlanResponse> {
  const cleanProfile = sanitizeUserProfile(profile);

  if (isMockForced()) {
    notifyFallback(false);
    return generateMockPlan(cleanProfile);
  }

  try {
    const payload = await fetchJsonWithTimeout(
      buildApiUrl('/api/plan'),
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
    return generateMockPlan(cleanProfile);
  }
}

/**
 * Sends a follow-up question contextualized by the user's profile and active plan.
 * Calls POST {API_BASE_URL}/api/chat by default, or uses mock when forced/unreachable.
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
    return generateMockChatReply(cleanQuestion, cleanProfile, plan);
  }
}

/**
 * Fetches the current air quality reading for a city.
 * Calls GET {API_BASE_URL}/api/air-quality?city=... by default, or uses mock when forced/unreachable.
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
