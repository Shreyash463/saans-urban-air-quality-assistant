import { describe, expect, it } from 'vitest';
import {
  formatAqiSourceLabel,
  formatAqiTimestampIst,
  formatPlanAsText,
} from '../lib/planExport';
import { generateMockPlan } from '../../tests/fixtures/mockPlanGenerator';
import type { UserProfile } from '../types';

const PROFILE: UserProfile = {
  city: 'Pune',
  householdSize: 3,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'public_transport',
  commuteKm: 12,
  homeType: 'apartment',
  hasAirPurifier: true,
  cookingFuel: 'induction_electric',
  budget: 'medium',
  language: 'en',
};

describe('Plan plain-text exporter and IST timestamp formatting', () => {
  it('formats live Open-Meteo timestamps into IST and labels demo readings honestly', () => {
    expect(formatAqiTimestampIst('2026-11-25T06:30:00Z')).toBe('12:00 IST');
    expect(formatAqiTimestampIst('')).toBe('');

    const liveLabel = formatAqiSourceLabel(
      {
        city: 'Pune',
        aqi: 130,
        dominantPollutant: 'PM10',
        updatedAt: '2026-11-25T12:00:00+05:30',
        source: 'live',
      },
      'en'
    );
    expect(liveLabel).toBe('Live · updated 12:00 IST (Open-Meteo)');

    const demoLabel = formatAqiSourceLabel(
      {
        city: 'Pune',
        aqi: 130,
        dominantPollutant: 'PM10',
        updatedAt: '',
        source: 'demo',
      },
      'en'
    );
    expect(demoLabel).toBe('Sample reading for demo');
  });

  it('exports a clean plain-text plan with PM2.5-only label when CO2 savings is 0', () => {
    const plan = generateMockPlan(PROFILE);
    const txt = formatPlanAsText(plan, 'en');
    expect(txt).toContain('Pune: AQI 130');
    expect(txt).toContain('Rule-based fallback');
    expect(txt).toContain('PM2.5 only');
    expect(txt).toContain('Not medical advice');
  });
});
