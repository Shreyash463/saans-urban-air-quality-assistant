// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSamplePlan, buildSampleProfile } from '../../tests/fixtures/samplePlan';
import { useSaansAppState } from '../hooks/useSaansAppState';
import * as api from '../services/api';

const TEST_PROFILE = buildSampleProfile({
  city: 'Pune',
  householdSize: 3,
  hasRespiratoryCondition: false,
  budget: 'medium',
});

describe('useSaansAppState orchestrator hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('manages hero AQI loading/error, plan submit/retry, language toggle, and clear', async () => {
    const mockPlan = buildSamplePlan();
    vi.spyOn(api, 'getAirQuality')
      .mockResolvedValueOnce(mockPlan.aqi)
      .mockRejectedValueOnce(new Error('Network down'));
    vi.spyOn(api, 'generatePlan')
      .mockRejectedValueOnce(new api.ApiRequestError('rate_limit', 'Busy'))
      .mockResolvedValue(mockPlan);

    const { result } = renderHook(() => useSaansAppState(vi.fn()));
    await waitFor(() => expect(result.current.previewReading).toEqual(mockPlan.aqi));

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

  it('aborts stale language regeneration requests, prevents rapid-toggle duplicates, and surfaces failures', async () => {
    const basePlan = buildSamplePlan();
    let capturedSignal: AbortSignal | undefined;
    const genSpy = vi
      .spyOn(api, 'generatePlan')
      .mockResolvedValueOnce(basePlan)
      .mockImplementationOnce(
        (_profile, _coords, signal) =>
          new Promise((_resolve, reject) => {
            capturedSignal = signal;
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
      .mockRejectedValueOnce(new api.ApiRequestError('rate_limit', 'Too busy'))
      .mockResolvedValueOnce({ ...basePlan, summary: 'Retried Hindi summary' });

    vi.spyOn(api, 'getAirQuality').mockResolvedValue(basePlan.aqi);
    const { result } = renderHook(() => useSaansAppState(vi.fn()));
    await waitFor(() => expect(result.current.previewReading).toEqual(basePlan.aqi));

    await act(async () => {
      await result.current.handleSubmitProfile(TEST_PROFILE);
    });
    expect(genSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.toggleLanguage();
      result.current.toggleLanguage();
    });
    expect(capturedSignal?.aborted).toBe(true);
    expect(genSpy).toHaveBeenCalledTimes(2);
    expect(result.current.profile.language).toBe('en');

    act(() => result.current.toggleLanguage());
    await waitFor(() => expect(result.current.langSyncError).toBe('rate_limit'));
    expect(result.current.plan).toEqual(basePlan);
    await waitFor(() => expect(result.current.statusMessage).not.toBe(''));

    act(() => result.current.retryLanguageSync());
    await waitFor(() =>
      expect(result.current.plan?.summary).toBe('Retried Hindi summary')
    );
    expect(result.current.langSyncError).toBeNull();
  });
});
