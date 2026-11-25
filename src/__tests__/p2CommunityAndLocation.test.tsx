// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityActionsSection } from '../components/CommunityActionsSection';
import { getMockAirQuality, QUICK_PICK_CITIES } from '../lib/demoCities';
import { loadLanguageBundle, t } from '../lib/i18n';
import { formatPlanAsText } from '../lib/planExport';
import { isPlanResponse } from '../lib/validation';
import { ProfileForm } from '../sections/ProfileForm';
import Simulator from '../sections/Simulator';
import { generatePlan, getAirQualityByCoords } from '../services/api';
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

describe('Community actions, community scaling simulator, lazy Hindi, and opt-in geolocation', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('loads Hindi dictionary dynamically via loadLanguageBundle without throwing', async () => {
    const hiDict = await loadLanguageBundle('hi');
    expect(hiDict.communityHeading).toBe('इसे सामुदायिक पहल बनाएं');
    expect(t('hi', 'useMyLocation')).toBe('मेरा स्थान उपयोग करें');

    const enDict = await loadLanguageBundle('en');
    expect(enDict.communityHeading).toBe('Make it a community effort');
  });

  it('exports communityActions in plain-text plan output and validates mock demo cities', () => {
    expect(QUICK_PICK_CITIES).toContain('Delhi');
    expect(getMockAirQuality('Mumbai').aqi).toBe(150);

    const plan = generateMockPlan(SAMPLE_PROFILE);
    expect(plan.communityActions?.length).toBeGreaterThanOrEqual(3);
    expect(isPlanResponse(plan)).toBe(true);

    const exported = formatPlanAsText(plan, 'en');
    expect(exported).toContain('[Make it a community effort]');
  });

  it('fetches AQI and plan by ephemeral coordinates via api.ts cleanly', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
    const mockPlan = {
      ...generateMockPlan(SAMPLE_PROFILE),
      aqi: {
        city: 'Your location (approx.)',
        aqi: 275,
        dominantPollutant: 'PM2.5',
        updatedAt: '2026-11-25T15:00:00+05:30',
        source: 'live' as const,
        sourceDetail: 'Open-Meteo, PM-based CPCB estimate',
      },
      generatedBy: 'gemini' as const,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockPlan.aqi })
      .mockResolvedValueOnce({ ok: true, json: async () => mockPlan });
    vi.stubGlobal('fetch', fetchMock);

    const aq = await getAirQualityByCoords(28.6139, 77.209);
    expect(aq.city).toBe('Your location (approx.)');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/air-quality?lat=28.6139&lon=77.2090',
      expect.anything()
    );

    const plan = await generatePlan(SAMPLE_PROFILE, { lat: 28.6139, lon: 77.209 });
    expect(plan.aqi.city).toBe('Your location (approx.)');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/plan?lat=28.6139&lon=77.2090',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('renders CommunityActionsSection and Simulator community multiplier slider cleanly', async () => {
    const plan = generateMockPlan(SAMPLE_PROFILE);
    const { container } = render(
      <CommunityActionsSection actions={plan.communityActions ?? []} language="en" />
    );
    expect(screen.getByText('Make it a community effort')).toBeInTheDocument();
    const axeRes = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(axeRes.violations).toEqual([]);
    cleanup();

    render(<Simulator profile={SAMPLE_PROFILE} />);
    const transitToggle = document.getElementById('sim-switch-commute_transit');
    expect(transitToggle).not.toBeNull();
    fireEvent.click(transitToggle!);
    const slider = screen.getByRole('slider', { name: /Participating households/i });
    const co2Before = screen.getByTestId('community-co2-value').textContent;
    fireEvent.change(slider, { target: { value: '200' } });
    const co2After = screen.getByTestId('community-co2-value').textContent;
    expect(co2After).not.toBe(co2Before);
  });

  it('handles opt-in Use my location button (success & permission denied) cleanly', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: {
          latitude: 28.61,
          longitude: 77.2,
          accuracy: 100,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      } as GeolocationPosition)
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const onChangeProfile = vi.fn();
    const onLocationChange = vi.fn();
    render(
      <ProfileForm
        profile={SAMPLE_PROFILE}
        onChangeProfile={onChangeProfile}
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
    cleanup();

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn(
          (_ok: PositionCallback, err?: PositionErrorCallback) =>
            err?.({
              code: 1,
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError)
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
