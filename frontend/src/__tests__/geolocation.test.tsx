// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSamplePlan, buildSampleProfile } from '../../tests/fixtures/samplePlan';
import { ProfileForm } from '../sections/ProfileForm';
import { generatePlan, getAirQualityByCoords } from '../services/api';

const SAMPLE_PROFILE = buildSampleProfile({ hasRespiratoryCondition: false });

describe('Opt-in browser geolocation and ephemeral POST coordinate flows', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('fetches AQI and plan by ephemeral coordinates via POST bodies cleanly', async () => {
    const mockPlan = buildSamplePlan({
      aqi: {
        city: 'Your location (approx.)',
        aqi: 275,
        dominantPollutant: 'PM2.5',
        updatedAt: '2026-11-25T15:00:00+05:30',
        source: 'live',
        sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
      },
      generatedBy: 'gemini',
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockPlan.aqi })
      .mockResolvedValueOnce({ ok: true, json: async () => mockPlan });
    vi.stubGlobal('fetch', fetchMock);

    const aq = await getAirQualityByCoords(28.6139, 77.209);
    expect(aq.city).toBe('Your location (approx.)');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/air-quality',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lat: 28.6139, lon: 77.209 }),
      })
    );

    const plan = await generatePlan(SAMPLE_PROFILE, { lat: 28.6139, lon: 77.209 });
    expect(plan.aqi.city).toBe('Your location (approx.)');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/plan',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('triggers Use my location lookup without persisting coordinates to localStorage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          city: 'Your location (approx.)',
          aqi: 185,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T12:00:00+05:30',
          source: 'live',
        }),
      })
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: { latitude: 28.61, longitude: 77.2, accuracy: 100 },
            timestamp: Date.now(),
          } as unknown as GeolocationPosition)
        ),
      },
    });

    const onLocationChange = vi.fn();
    render(
      <ProfileForm
        profile={SAMPLE_PROFILE}
        onChangeProfile={vi.fn()}
        onSubmitProfile={vi.fn(async () => {})}
        onClearData={vi.fn()}
        isSubmitting={false}
        onLocationChange={onLocationChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    await waitFor(() => {
      expect(onLocationChange).toHaveBeenCalledWith({ lat: 28.61, lon: 77.2 });
    });
    expect(window.localStorage.getItem('saans_user_prefs_v1')).toBeNull();
  });

  it('shows honest permission-denied notice when browser denies geolocation', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(
          (_ok: PositionCallback, err?: PositionErrorCallback) =>
            err?.({ code: 1, message: 'Denied' } as GeolocationPositionError)
        ),
      },
    });
    render(
      <ProfileForm
        profile={SAMPLE_PROFILE}
        onChangeProfile={vi.fn()}
        onSubmitProfile={vi.fn(async () => {})}
        onClearData={vi.fn()}
        isSubmitting={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use my location' }));
    expect(screen.getByText(/Location permission declined/i)).toBeInTheDocument();
  });
});
