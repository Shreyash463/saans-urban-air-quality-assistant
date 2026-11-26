import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMockPlan } from '../../tests/fixtures/mockPlanGenerator';
import { useChatController } from '../hooks/useChatController';
import { useSaansAppState } from '../hooks/useSaansAppState';
import { SMOG_ADAPTIVE_WINDOW_FRAMES, SMOG_MAX_AVG_FRAME_MS } from '../lib/motion';
import {
  checkAdaptivePerformance,
  createSmogParticles,
  drawSmogFrame,
} from '../lib/smogEngine';
import * as api from '../services/api';
import type { AirQualityReading, UserProfile } from '../types';

const TEST_PROFILE: UserProfile = {
  city: 'Pune',
  householdSize: 3,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'car',
  commuteKm: 18,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'medium',
  language: 'en',
};

describe('Smog engine physics & adaptive frame guard', () => {
  it('creates particles, steps pointer repulsion, and trips adaptive guard on slow frames', () => {
    const particles = createSmogParticles(800, 600);
    expect(particles.length).toBeGreaterThan(0);

    const ctx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    drawSmogFrame(
      ctx,
      particles,
      { x: particles[0].x + 10, y: particles[0].y + 10, active: true },
      800,
      600,
      true
    );
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    expect(ctx.fill).toHaveBeenCalledTimes(2);

    const tracker = { lastTs: 0, sum: 0, count: 0 };
    expect(checkAdaptivePerformance(tracker, 100)).toBe(true);
    let ts = 100;
    let ok = true;
    for (let i = 0; i < SMOG_ADAPTIVE_WINDOW_FRAMES; i += 1) {
      ts += SMOG_MAX_AVG_FRAME_MS + 10;
      ok = checkAdaptivePerformance(tracker, ts);
    }
    expect(ok).toBe(false);
  });
});

describe('Chat and App state controllers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('validates chat questions, sends follow-ups, and handles rate-limit/network errors', async () => {
    const plan = generateMockPlan(TEST_PROFILE);
    const askSpy = vi
      .spyOn(api, 'askFollowUp')
      .mockResolvedValueOnce({ answer: 'Wear N95 near traffic.' })
      .mockRejectedValueOnce(new api.ApiRequestError('rate_limit', 'Too busy'))
      .mockRejectedValueOnce(new Error('Offline'));

    const { result } = renderHook(() => useChatController(TEST_PROFILE, plan));
    await act(async () => {
      await result.current.submitQuestion('   ');
    });
    expect(result.current.errorKey).toBe('errorChatRequired');

    await act(async () => {
      await result.current.submitQuestion('Which mask works?');
    });
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].text).toContain('Wear N95');

    await act(async () => {
      await result.current.submitQuestion('Follow up 1');
      await result.current.submitQuestion('Follow up 2');
    });
    expect(askSpy).toHaveBeenCalledTimes(3);
    expect(result.current.messages).toHaveLength(6);
  });

  it('manages hero AQI loading/error, plan submit/retry/error, language toggle, and clear', async () => {
    const mockPlan = generateMockPlan(TEST_PROFILE);
    const reading: AirQualityReading = mockPlan.aqi;
    vi.spyOn(api, 'getAirQuality')
      .mockResolvedValueOnce(reading)
      .mockRejectedValueOnce(new Error('Network down'));
    vi.spyOn(api, 'generatePlan')
      .mockRejectedValueOnce(new api.ApiRequestError('rate_limit', 'Busy'))
      .mockResolvedValue(mockPlan);
    const scrollToElement = vi.fn();

    const { result } = renderHook(() => useSaansAppState(scrollToElement));
    await waitFor(() => expect(result.current.previewReading).toEqual(reading));

    act(() => result.current.reloadHeroAqi());
    await waitFor(() => expect(result.current.aqiError).toBe(true));

    await act(async () => {
      await result.current.handleSubmitProfile(TEST_PROFILE);
    });
    expect(result.current.planError).toBe('rate_limit');

    await act(async () => {
      result.current.handleRetryGemini();
    });
    await waitFor(() => expect(result.current.plan).toEqual(mockPlan));

    act(() => result.current.toggleLanguage());
    expect(result.current.profile.language).toBe('hi');

    act(() => result.current.handleClearData());
    expect(result.current.plan).toBeNull();
  });
});
