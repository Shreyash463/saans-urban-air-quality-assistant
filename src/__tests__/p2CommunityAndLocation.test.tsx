// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiBusyRetryNotice } from '../components/DashboardPlanCards';
import { CommunityActionsSection } from '../components/CommunityActionsSection';
import { Hero } from '../sections/Hero';
import { QUICK_PICK_CITIES } from '../lib/cities';
import { getMockAirQuality } from '../../tests/fixtures/demoCities';
import { loadLanguageBundle, t } from '../lib/i18n';
import { formatPlanAsText } from '../lib/planExport';
import { isPlanResponse } from '../lib/validation';
import { ProfileForm } from '../sections/ProfileForm';
import Simulator from '../sections/Simulator';
import { generatePlan, getAirQualityByCoords } from '../services/api';
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

  it('fetches AQI and plan by ephemeral coordinates via POST bodies cleanly', async () => {
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

  it('shows AI-busy countdown and retry button only for ai_busy/ai_error, and Hero labels demo vs live cleanly', () => {
    const basePlan = generateMockPlan(SAMPLE_PROFILE);
    const noKeyPlan = {
      ...basePlan,
      generatedBy: 'rules' as const,
      fallbackReason: 'no_key' as const,
    };
    const { rerender } = render(
      <AiBusyRetryNotice
        plan={noKeyPlan}
        language="en"
        isLoading={false}
        onRetryGemini={vi.fn()}
      />
    );
    expect(screen.queryByTestId('ai-busy-notice')).toBeNull();

    vi.useFakeTimers();
    const onRetry = vi.fn();
    const busyPlan = {
      ...basePlan,
      generatedBy: 'rules' as const,
      fallbackReason: 'ai_busy' as const,
      retryAfterSeconds: 2,
    };
    rerender(
      <AiBusyRetryNotice
        plan={busyPlan}
        language="en"
        isLoading={false}
        onRetryGemini={onRetry}
      />
    );
    expect(screen.getByTestId('ai-busy-notice')).toHaveTextContent(
      /try again in 2 seconds/i
    );
    const btn = screen.getByRole('button', { name: 'Try Gemini again' });
    expect(btn).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    cleanup();

    const { rerender: rerenderHero } = render(
      <Hero
        language="en"
        previewReading={{
          city: 'Delhi',
          aqi: 310,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T10:00:00+05:30',
          source: 'demo',
        }}
        reducedMotion={true}
        isDark={false}
      />
    );
    expect(screen.getByText('Sample reading for demo')).toBeInTheDocument();

    rerenderHero(
      <Hero
        language="en"
        previewReading={{
          city: 'Your location (approx.)',
          aqi: 180,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T10:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo',
        }}
        reducedMotion={true}
        isDark={false}
      />
    );
    expect(screen.queryByText('Sample reading for demo')).toBeNull();
    expect(screen.getByText(/^Live ·/i)).toBeInTheDocument();
    expect(screen.getByText('Your location (approx.)')).toBeInTheDocument();
  });
});
