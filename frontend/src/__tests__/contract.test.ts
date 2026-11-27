import { describe, expect, it } from 'vitest';
import contractFactors from '../../../contract/impact-factors.json';
import goldenVectors from '../../../contract/golden-vectors.json';
import samplePlan from '../../../contract/plan.sample.json';
import { getAqiCategory } from '../lib/aqi';
import { calculateImpact } from '../lib/impact';
import { MAX_PM25_REDUCTION_PCT } from '../lib/impactFactors';
import { isAirQualityReading, isPlanResponse } from '../lib/validation';
import type { UserProfile } from '../types';
import type { ImpactActionId } from '../lib/impactFactors';

describe('Shared cross-language contract fixtures and golden vectors', () => {
  it('validates contract/plan.sample.json against the frontend TypeScript type guard', () => {
    expect(isPlanResponse(samplePlan)).toBe(true);
    expect(samplePlan.generatedBy).toBe('gemini');
    expect(samplePlan.aqi.sourceDetail).toBe('Open-Meteo, PM-based CPCB estimate');
  });

  it('accepts both omitted and explicit null optional fields in PlanResponse and AirQualityReading', () => {
    const withNulls = {
      ...samplePlan,
      aqi: { ...samplePlan.aqi, sourceDetail: null },
      communityActions: null,
      generatedBy: null,
      fallbackReason: null,
      retryAfterSeconds: null,
    };
    expect(isPlanResponse(withNulls)).toBe(true);
    expect(isAirQualityReading({ ...samplePlan.aqi, sourceDetail: null })).toBe(true);
    expect(isAirQualityReading({ ...samplePlan.aqi, sourceDetail: undefined })).toBe(
      true
    );
  });

  it('keeps impact-factors.json synchronized with frontend constants', () => {
    expect(contractFactors.constants.MAX_PM25_REDUCTION_PCT).toBe(
      MAX_PM25_REDUCTION_PCT
    );
    expect(contractFactors.actions).toHaveLength(8);
  });

  it('matches cross-language CPCB category and impact math golden vectors', () => {
    for (const vec of goldenVectors.cpcbCategoryVectors) {
      expect(getAqiCategory(vec.aqi).key).toBe(vec.expectedKey);
    }

    for (const vec of goldenVectors.impactVectors) {
      const result = calculateImpact(
        vec.profile as UserProfile,
        vec.selectedActions as ImpactActionId[]
      );
      expect(result.beforeExposurePct).toBe(vec.expected.beforeExposurePct);
      expect(result.afterExposurePct).toBe(vec.expected.afterExposurePct);
      expect(result.additionalExposureCutPct).toBe(
        vec.expected.additionalExposureCutPct
      );
      expect(result.totalExposureCutPct).toBe(vec.expected.totalExposureCutPct);
      expect(result.baselineScore).toBe(vec.expected.baselineScore);
      expect(result.co2SavedKgPerMonth).toBe(vec.expected.co2SavedKgPerMonth);
      expect(result.airFriendlyScore).toBe(vec.expected.airFriendlyScore);
    }
  });
});
