import samplePlanJson from '../../../contract/plan.sample.json';
import type { PlanResponse, UserProfile } from '../../src/types';

const BASE_PLAN = samplePlanJson as unknown as PlanResponse;

const BASE_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: true,
  commuteMode: 'car',
  commuteKm: 18,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'low',
  language: 'en',
};

export function buildSampleProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return { ...BASE_PROFILE, ...overrides };
}

export function buildSamplePlan(overrides: Partial<PlanResponse> = {}): PlanResponse {
  return {
    ...BASE_PLAN,
    aqi: { ...BASE_PLAN.aqi, ...(overrides.aqi ?? {}) },
    routine: overrides.routine ?? BASE_PLAN.routine.map((item) => ({ ...item })),
    indoorHacks:
      overrides.indoorHacks ?? BASE_PLAN.indoorHacks.map((item) => ({ ...item })),
    alternatives:
      overrides.alternatives ?? BASE_PLAN.alternatives.map((item) => ({ ...item })),
    communityActions:
      overrides.communityActions ??
      BASE_PLAN.communityActions?.map((item) => ({ ...item })),
    ...overrides,
  };
}
