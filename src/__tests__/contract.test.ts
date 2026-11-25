import { describe, expect, it } from 'vitest';
import contractFactors from '../../contract/impact-factors.json';
import samplePlan from '../../contract/plan.sample.json';
import { MAX_PM25_REDUCTION_PCT } from '../lib/impactFactors';
import { isPlanResponse } from '../lib/validation';

describe('Shared cross-language contract fixtures', () => {
  it('validates contract/plan.sample.json against the frontend TypeScript type guard', () => {
    expect(isPlanResponse(samplePlan)).toBe(true);
    expect(samplePlan.generatedBy).toBe('gemini');
    expect(samplePlan.aqi.sourceDetail).toBe('Open-Meteo, PM-based CPCB estimate');
  });

  it('keeps impact-factors.json synchronized with frontend constants', () => {
    expect(contractFactors.constants.MAX_PM25_REDUCTION_PCT).toBe(
      MAX_PM25_REDUCTION_PCT
    );
    expect(contractFactors.actions).toHaveLength(8);
  });
});
