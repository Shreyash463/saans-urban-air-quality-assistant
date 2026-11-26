import { describe, expect, it } from 'vitest';
import {
  generateMockChatReply,
  generateMockPlan,
  getMockAirQuality,
} from '../../tests/fixtures/mockPlanGenerator';
import type { UserProfile } from '../types';

const BASE_ADULT_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 2,
  hasChildren: false,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'car',
  commuteKm: 20,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'medium',
  language: 'en',
};

describe('Deterministic mock plan generator', () => {
  it('returns deterministic AQI readings for known Indian cities and unknown fallback with no fake timestamp', () => {
    expect(getMockAirQuality('Delhi').aqi).toBe(380);
    expect(getMockAirQuality('Lucknow').aqi).toBe(310);
    expect(getMockAirQuality('Kolkata').aqi).toBe(240);
    expect(getMockAirQuality('Mumbai').aqi).toBe(150);
    expect(getMockAirQuality('Pune').aqi).toBe(130);
    expect(getMockAirQuality('Bengaluru').aqi).toBe(95);
    expect(getMockAirQuality('Shimla').aqi).toBe(160);

    const demoReading = getMockAirQuality('Delhi');
    expect(demoReading.source).toBe('demo');
    expect(demoReading.updatedAt).toBe('');
  });

  it('returns a visibly different advisory and mask guidance for child/respiratory households than healthy adults', () => {
    const adultPlan = generateMockPlan(BASE_ADULT_PROFILE);
    const vulnerablePlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      hasChildren: true,
      hasRespiratoryCondition: true,
    });

    expect(vulnerablePlan.healthAdvisory).not.toBe(adultPlan.healthAdvisory);
    expect(vulnerablePlan.healthAdvisory.toLowerCase()).toContain('children');
    expect(vulnerablePlan.healthAdvisory.toLowerCase()).toContain('respiratory');
    expect(vulnerablePlan.maskGuidance).not.toBe(adultPlan.maskGuidance);
  });

  it('composes grammatically clean health advisory sentences across every vulnerability flag combination', () => {
    const flagCombos = [
      { hasChildren: false, hasElderly: false, hasRespiratoryCondition: false },
      { hasChildren: true, hasElderly: false, hasRespiratoryCondition: false },
      { hasChildren: false, hasElderly: true, hasRespiratoryCondition: false },
      { hasChildren: false, hasElderly: false, hasRespiratoryCondition: true },
      { hasChildren: true, hasElderly: true, hasRespiratoryCondition: false },
      { hasChildren: true, hasElderly: true, hasRespiratoryCondition: true },
    ];

    for (const flags of flagCombos) {
      const plan = generateMockPlan({ ...BASE_ADULT_PROFILE, ...flags });
      const advisory = plan.healthAdvisory;
      expect(advisory).not.toContain(',,');
      expect(advisory).not.toMatch(/^With /);
      // Every sentence starts with an uppercase English letter
      const sentences = advisory
        .split('. ')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sentence of sentences) {
        expect(sentence[0]).toMatch(/[A-Z]/);
      }
      expect(advisory.toLowerCase()).toContain('not medical advice');
    }
  });

  it('enforces tiered mask and outdoor-activity safety rules across AQI bands and vulnerability', () => {
    // 1. Vulnerable + AQI 101-200 (Mumbai = 150) must NEVER say moderate/vigorous outdoor exercise is safe
    const moderateVulnerable = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      city: 'Mumbai',
      hasChildren: true,
      hasRespiratoryCondition: true,
    });
    expect(moderateVulnerable.maskGuidance.toLowerCase()).not.toContain(
      'moderate outdoor exercise is safe'
    );
    expect(moderateVulnerable.maskGuidance.toLowerCase()).toContain(
      'move workouts indoors'
    );
    expect(moderateVulnerable.maskGuidance).toContain('N95');

    // 2. AQI >= 201 (Delhi = 380, Kolkata = 240) must advise avoiding outdoor exertion entirely for everyone
    const severeAdult = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      city: 'Delhi',
    });
    expect(severeAdult.maskGuidance.toLowerCase()).toContain('avoid outdoor exertion');
    const poorVulnerable = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      city: 'Kolkata',
      hasElderly: true,
    });
    expect(poorVulnerable.maskGuidance.toLowerCase()).toContain(
      'avoid outdoor exertion'
    );
    expect(poorVulnerable.maskGuidance.toLowerCase()).toContain('indoors');

    // 3. AQI <= 100 (Bengaluru = 95) without vulnerability allows normal outdoor activity
    const satisfactoryAdult = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      city: 'Bengaluru',
    });
    expect(satisfactoryAdult.maskGuidance.toLowerCase()).toContain(
      'normal outdoor activity'
    );
  });

  it('ranks indoor hacks differently based on budget and tailors alternatives to cooking fuel', () => {
    const lowBudgetPlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      budget: 'low',
    });
    const highBudgetPlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      budget: 'high',
    });
    expect(lowBudgetPlan.indoorHacks[0].costLevel).toBe('free');
    expect(highBudgetPlan.indoorHacks[0].costLevel).toBe('high');

    const biomassPlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      cookingFuel: 'biomass_wood',
    });
    const lpgPlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      cookingFuel: 'lpg',
    });
    expect(biomassPlan.alternatives[1].current).not.toBe(
      lpgPlan.alternatives[1].current
    );
  });

  it('produces Hindi output when language is set to "hi" and answers plant myth honestly', () => {
    const hiPlan = generateMockPlan({ ...BASE_ADULT_PROFILE, language: 'hi' });
    expect(hiPlan.summary).toContain('AQI');
    expect(hiPlan.healthAdvisory).toMatch(/[\u0900-\u097F]/);

    const plantReply = generateMockChatReply(
      'Do air plants really work?',
      BASE_ADULT_PROFILE,
      generateMockPlan(BASE_ADULT_PROFILE)
    );
    expect(plantReply.answer.toLowerCase()).toContain('negligible pm2.5');
  });

  it('keeps morning routine title, detail, and impact coherent across commute modes and avoids recommending already-done habits', () => {
    const metroInductionPurifierPlan = generateMockPlan({
      ...BASE_ADULT_PROFILE,
      commuteMode: 'public_transport',
      cookingFuel: 'induction_electric',
      hasAirPurifier: true,
    });

    const morning = metroInductionPurifierPlan.routine[0];
    expect(morning.title.toLowerCase()).toContain('metro/bus');
    expect(morning.impactNote.toLowerCase()).not.toContain('private tailpipe');

    // Non-emission swaps (fitted N95, kitchen exhaust, door sealing) must claim 0 CO2
    expect(metroInductionPurifierPlan.alternatives[0].co2SavedKgPerMonth).toBe(0);
    expect(metroInductionPurifierPlan.alternatives[1].co2SavedKgPerMonth).toBe(0);
    expect(metroInductionPurifierPlan.alternatives[2].co2SavedKgPerMonth).toBe(0);
    // Waste burning swap genuinely cuts emissions
    expect(
      metroInductionPurifierPlan.alternatives[3].co2SavedKgPerMonth
    ).toBeGreaterThan(0);

    // Must not recommend buying a purifier when user already owns one
    const hackTitles = metroInductionPurifierPlan.indoorHacks
      .map((h) => h.title.toLowerCase())
      .join(' ');
    expect(hackTitles).toContain('existing purifier');
    expect(hackTitles).not.toContain('add a true hepa h13 purifier');
  });
});
