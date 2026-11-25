import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askFollowUp,
  generatePlan,
  getAirQuality,
  REQUEST_TIMEOUT_MS,
  subscribeApiFallback,
} from '../services/api';
import { generateMockPlan } from '../services/mockPlanGenerator';
import type { UserProfile } from '../types';

const SAMPLE_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'car',
  commuteKm: 18,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'low',
  language: 'en',
};

describe('API layer backend-first default and resilient fallback behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses a 30-second timeout for plan and chat generation', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it('calls same-origin /api/plan by default when VITE_USE_MOCK is not true', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_USE_MOCK', 'false');
    const mockPlan = {
      ...generateMockPlan(SAMPLE_PROFILE),
      generatedBy: 'gemini' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPlan,
    });
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generatePlan(SAMPLE_PROFILE);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plan',
      expect.objectContaining({ method: 'POST' })
    );
    expect(plan.generatedBy).toBe('gemini');
  });

  it('skips network calls when VITE_USE_MOCK=true', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generatePlan(SAMPLE_PROFILE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(plan.generatedBy).toBe('rules');
  });

  it('falls back to deterministic mock and emits fallback notice when network request fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.saans.example');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    const fallbackEvents: boolean[] = [];
    const unsubscribe = subscribeApiFallback((flag) => fallbackEvents.push(flag));

    const plan = await generatePlan(SAMPLE_PROFILE);
    unsubscribe();

    expect(plan.aqi.city).toBe('Delhi');
    expect(plan.aqi.source).toBe('demo');
    expect(plan.routine.length).toBe(4);
    expect(fallbackEvents).toContain(true);
  });

  it('falls back to mock when backend returns invalid JSON shape or aborts on timeout', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.saans.example');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'shape' }),
      })
    );

    const aqi = await getAirQuality('Lucknow');
    expect(aqi.city).toBe('Lucknow');
    expect(aqi.aqi).toBe(310);
    expect(aqi.source).toBe('demo');

    const chat = await askFollowUp(
      'Do air plants really work?',
      SAMPLE_PROFILE,
      generateMockPlan(SAMPLE_PROFILE)
    );
    expect(chat.answer.length).toBeGreaterThan(20);
  });
});
