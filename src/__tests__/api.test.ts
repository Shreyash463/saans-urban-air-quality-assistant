import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  askFollowUp,
  generatePlan,
  getAirQuality,
  getAirQualityByCoords,
  REQUEST_TIMEOUT_MS,
} from '../services/api';
import { generateMockPlan } from '../../tests/fixtures/mockPlanGenerator';
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

describe('API layer: strict server-backed responses and coordinate POST privacy', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses a 35-second timeout for plan and chat generation', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(35_000);
  });

  it('calls POST /api/plan with JSON body and passes coords only inside body', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const mockPlan = {
      ...generateMockPlan(SAMPLE_PROFILE),
      generatedBy: 'gemini' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPlan,
    });
    vi.stubGlobal('fetch', fetchMock);

    const plan = await generatePlan(SAMPLE_PROFILE, {
      lat: 28.61394,
      lon: 77.20904,
    });
    expect(plan.generatedBy).toBe('gemini');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plan',
      expect.objectContaining({ method: 'POST' })
    );
    const callInit = fetchMock.mock.calls[0]?.[1] as { body?: string };
    const sent = JSON.parse(callInit.body ?? '{}') as Record<string, unknown>;
    expect(sent.coords).toEqual({ lat: 28.6139, lon: 77.209 });
    expect(sent.preferCoords).toBe(true);
  });

  it('uses POST /api/air-quality body for coordinates and GET for city only', async () => {
    const sampleAqi = generateMockPlan(SAMPLE_PROFILE).aqi;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...sampleAqi, source: 'live' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await getAirQuality('Pune');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/air-quality?city=Pune',
      expect.objectContaining({ method: 'GET' })
    );

    await getAirQualityByCoords(18.52041, 73.85671);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/air-quality',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lat: 18.5204, lon: 73.8567 }),
      })
    );
  });

  it('throws typed ApiRequestError on network failure, HTTP 429, timeout, and invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    await expect(generatePlan(SAMPLE_PROFILE)).rejects.toMatchObject({
      name: 'ApiRequestError',
      kind: 'network',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    );
    await expect(generatePlan(SAMPLE_PROFILE)).rejects.toMatchObject({
      kind: 'timeout',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(generatePlan(SAMPLE_PROFILE)).rejects.toMatchObject({
      kind: 'rate_limit',
      status: 429,
    });

    const samplePlan = generateMockPlan(SAMPLE_PROFILE);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bad: true }) })
    );
    await expect(getAirQuality('Lucknow')).rejects.toBeInstanceOf(ApiRequestError);
    await expect(
      askFollowUp('Do air plants work?', SAMPLE_PROFILE, samplePlan)
    ).rejects.toMatchObject({ kind: 'invalid_payload' });
  });
});
