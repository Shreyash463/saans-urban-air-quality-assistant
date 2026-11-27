// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeolocationAqi } from '../hooks/useGeolocationAqi';
import * as api from '../services/api';

describe('useGeolocationAqi hook', () => {
  const originalGeo = navigator.geolocation;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeo,
    });
  });

  it('reports unsupported notice when navigator.geolocation is absent', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() =>
      useGeolocationAqi({ language: 'en', onLocationChange: vi.fn() })
    );
    act(() => result.current.triggerGeo());
    expect(result.current.locStatus).toBe('notice');
    expect(result.current.locNoticeKey).toBe('locationUnsupportedNotice');
  });

  it('handles denied permission and resets coordinates cleanly', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({ code: 1, message: 'Denied' } as GeolocationPositionError),
      },
    });
    const onLoc = vi.fn();
    const { result } = renderHook(() =>
      useGeolocationAqi({ language: 'en', onLocationChange: onLoc })
    );
    act(() => result.current.triggerGeo());
    expect(result.current.locNoticeKey).toBe('locationDeniedNotice');
    act(() => result.current.resetLoc());
    expect(result.current.locStatus).toBe('idle');
    expect(onLoc).toHaveBeenLastCalledWith(null);
  });

  it('emits reading on success and surfaces lookup errors without crashing', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({
            coords: { latitude: 18.52, longitude: 73.85 },
          } as unknown as GeolocationPosition),
      },
    });
    const getSpy = vi
      .spyOn(api, 'getAirQualityByCoords')
      .mockResolvedValueOnce({
        city: 'Your location (approx.)',
        aqi: 92,
        dominantPollutant: 'PM2.5',
        updatedAt: '2026-11-26T12:00:00+05:30',
        source: 'live',
      })
      .mockRejectedValueOnce(new Error('timeout'));

    const onLoc = vi.fn();
    const onPreview = vi.fn();
    const { result } = renderHook(() =>
      useGeolocationAqi({
        language: 'en',
        onLocationChange: onLoc,
        onPreviewReadingChange: onPreview,
      })
    );

    act(() => result.current.triggerGeo());
    await waitFor(() => expect(result.current.locStatus).toBe('active'));
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ aqi: 92, city: 'Your location (approx.)' })
    );
    expect(onLoc).toHaveBeenCalledWith({ lat: 18.52, lon: 73.85 });

    act(() => result.current.triggerGeo());
    await waitFor(() =>
      expect(result.current.locNoticeKey).toBe('cityPreviewErrorNotice')
    );
    expect(result.current.locStatus).toBe('active');
    expect(getSpy).toHaveBeenCalledTimes(2);
  });
});
