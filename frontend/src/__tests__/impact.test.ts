import { describe, expect, it } from 'vitest';
import {
  calculateHouseholdImpact,
  calculateImpact,
  calculateMultiplicativePm25Reduction,
} from '../lib/impact';
import { getActionStates } from '../lib/impactStates';
import {
  IMPACT_ACTION_FACTORS,
  MAX_AIR_FRIENDLY_SCORE,
  MAX_PM25_REDUCTION_PCT,
  MIN_RESIDUAL_EXPOSURE_PCT,
} from '../lib/impactFactors';
import type { UserProfile } from '../types';

const CAR_LPG_NO_PURIFIER_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
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

const ALREADY_GREEN_PROFILE: UserProfile = {
  city: 'Bengaluru',
  householdSize: 2,
  hasChildren: false,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'work_from_home',
  commuteKm: 0,
  homeType: 'apartment',
  hasAirPurifier: true,
  cookingFuel: 'induction_electric',
  budget: 'high',
  language: 'en',
};

describe('Impact simulator calculations', () => {
  it('returns zero reductions and zero score when no actions are active (raw helper)', () => {
    const result = calculateHouseholdImpact([]);
    expect(result.pm25ReductionPct).toBe(0);
    expect(result.co2SavedKgPerMonth).toBe(0);
    expect(result.airFriendlyScore).toBe(0);
    expect(result.activeActions).toEqual([]);
  });

  it('uses multiplicative stacking rather than naive addition', () => {
    expect(calculateMultiplicativePm25Reduction([0.5, 0.5])).toBe(75);
    expect(calculateMultiplicativePm25Reduction([0.4, 0.3])).toBe(58);
  });

  it('never exceeds the 95% PM2.5 cap or 100 air-friendly score even with all actions active', () => {
    const allIds = IMPACT_ACTION_FACTORS.map((factor) => factor.id);
    const result = calculateHouseholdImpact(allIds, { commuteKm: 100 });

    expect(result.pm25ReductionPct).toBeLessThanOrEqual(MAX_PM25_REDUCTION_PCT);
    expect(result.pm25ReductionPct).toBeGreaterThan(50);
    expect(result.airFriendlyScore).toBeLessThanOrEqual(MAX_AIR_FRIENDLY_SCORE);
    expect(result.co2SavedKgPerMonth).toBeGreaterThan(0);

    expect(
      calculateMultiplicativePm25Reduction([0.8, 0.8, 0.8, 0.8, 0.8])
    ).toBeLessThanOrEqual(MAX_PM25_REDUCTION_PCT);
  });

  it('scales commute CO2 savings proportionally to daily commute distance', () => {
    const shortCommute = calculateHouseholdImpact(['commute_transit'], {
      commuteKm: 8,
    });
    const longCommute = calculateHouseholdImpact(['commute_transit'], {
      commuteKm: 32,
    });
    expect(longCommute.co2SavedKgPerMonth).toBeGreaterThan(
      shortCommute.co2SavedKgPerMonth
    );
  });
});

describe('Profile-aware simulator states and consistent metrics', () => {
  it('marks existing habits as already_doing and hides inapplicable actions like carpool for WFH', () => {
    const states = getActionStates(ALREADY_GREEN_PROFILE);
    const byId = new Map(states.map((state) => [state.factor.id, state]));

    expect(byId.get('commute_transit')?.status).toBe('already_doing');
    expect(byId.get('clean_cooking')?.status).toBe('already_doing');
    expect(byId.get('bedroom_purifier')?.status).toBe('already_doing');
    expect(byId.get('carpool_three_days')?.status).toBe('not_applicable');
    // Stopping waste/leaf burning still applies regardless of cooking fuel
    expect(byId.get('stop_waste_burning')?.status).toBe('applicable');
  });

  it('ranks applicable actions first and marks only the top 3 as recommended', () => {
    const states = getActionStates(CAR_LPG_NO_PURIFIER_PROFILE);
    const firstAlreadyDoingIdx = states.findIndex((s) => s.status !== 'applicable');
    const applicableStates = states.filter((s) => s.status === 'applicable');

    if (firstAlreadyDoingIdx !== -1) {
      expect(firstAlreadyDoingIdx).toBe(applicableStates.length);
    }

    const recommended = states.filter((s) => s.recommended);
    expect(recommended).toHaveLength(3);
    expect(recommended.every((s) => s.status === 'applicable')).toBe(true);
    // Top 3 are the first 3 items in the sorted output
    expect(states.slice(0, 3).every((s) => s.recommended)).toBe(true);
  });

  it('excludes non-emission actions from CO2 totals (shows null CO2 for windows, mask, sealing, purifier)', () => {
    const states = getActionStates(CAR_LPG_NO_PURIFIER_PROFILE);
    const byId = new Map(states.map((state) => [state.factor.id, state]));

    expect(byId.get('close_windows_peak')?.estimatedCo2Kg).toBeNull();
    expect(byId.get('fitted_n95_mask')?.estimatedCo2Kg).toBeNull();
    expect(byId.get('seal_door_gaps')?.estimatedCo2Kg).toBeNull();
    expect(byId.get('bedroom_purifier')?.estimatedCo2Kg).toBeNull();

    expect(byId.get('commute_transit')?.estimatedCo2Kg).toBeGreaterThan(0);
    expect(byId.get('carpool_three_days')?.estimatedCo2Kg).toBeGreaterThan(0);
    expect(byId.get('clean_cooking')?.estimatedCo2Kg).toBeGreaterThan(0);
    expect(byId.get('stop_waste_burning')?.estimatedCo2Kg).toBeGreaterThan(0);

    const nonEmissionImpact = calculateImpact(CAR_LPG_NO_PURIFIER_PROFILE, [
      'close_windows_peak',
      'fitted_n95_mask',
      'seal_door_gaps',
      'bedroom_purifier',
    ]);
    expect(nonEmissionImpact.co2SavedKgPerMonth).toBe(0);
    expect(nonEmissionImpact.additionalExposureCutPct).toBeGreaterThan(0);
  });

  it('keeps airFriendlyScore strictly consistent with residual exposure (round(100 - afterExposurePct))', () => {
    const baseline = calculateImpact(ALREADY_GREEN_PROFILE, []);
    // Already-doing habits lower baseline exposure below 100%
    expect(baseline.beforeExposurePct).toBeLessThan(100);
    expect(baseline.afterExposurePct).toBe(baseline.beforeExposurePct);
    expect(baseline.baselineScore).toBe(Math.round(100 - baseline.beforeExposurePct));
    expect(baseline.airFriendlyScore).toBe(baseline.baselineScore);
    expect(baseline.additionalExposureCutPct).toBe(0);

    // Passing an already_doing or not_applicable ID must NOT double-count
    const attemptedDoubleCount = calculateImpact(ALREADY_GREEN_PROFILE, [
      'commute_transit',
      'clean_cooking',
      'bedroom_purifier',
      'carpool_three_days',
    ]);
    expect(attemptedDoubleCount.afterExposurePct).toBe(baseline.beforeExposurePct);
    expect(attemptedDoubleCount.co2SavedKgPerMonth).toBe(0);

    // Selecting applicable actions lowers afterExposurePct and raises score consistently
    const improved = calculateImpact(ALREADY_GREEN_PROFILE, [
      'close_windows_peak',
      'fitted_n95_mask',
      'stop_waste_burning',
    ]);
    expect(improved.afterExposurePct).toBeLessThan(improved.beforeExposurePct);
    expect(improved.afterExposurePct).toBeGreaterThanOrEqual(MIN_RESIDUAL_EXPOSURE_PCT);
    expect(improved.airFriendlyScore).toBe(Math.round(100 - improved.afterExposurePct));
    expect(improved.airFriendlyScore).toBeGreaterThan(improved.baselineScore);
    expect(improved.totalExposureCutPct).toBeLessThanOrEqual(MAX_PM25_REDUCTION_PCT);
    expect(improved.co2SavedKgPerMonth).toBeGreaterThan(0);
  });
});
