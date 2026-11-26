import type { UserProfile } from '../types';
import {
  IMPACT_ACTION_FACTORS,
  MAX_AIR_FRIENDLY_SCORE,
  MAX_PM25_REDUCTION_PCT,
  MIN_RESIDUAL_EXPOSURE_PCT,
  type ImpactActionFactor,
  type ImpactActionId,
} from './impactFactors';
import {
  getActionStates,
  getRecommendedInitialActions,
  getScaledCo2,
  type EvaluatedActionState,
} from './impactStates';

export type { EvaluatedActionState };
export { getActionStates, getRecommendedInitialActions };

export interface ProfileImpactResult {
  beforeExposurePct: number;
  afterExposurePct: number;
  additionalExposureCutPct: number;
  totalExposureCutPct: number;
  airFriendlyScore: number;
  baselineScore: number;
  co2SavedKgPerMonth: number;
  selectedActions: EvaluatedActionState[];
  alreadyDoingActions: EvaluatedActionState[];
}

export interface ImpactCalculationResult {
  pm25ReductionPct: number;
  co2SavedKgPerMonth: number;
  airFriendlyScore: number;
  activeActions: ImpactActionFactor[];
}

export interface ImpactCalculationOptions {
  commuteKm?: number;
}

export function calculateMultiplicativePm25Reduction(
  fractions: readonly number[]
): number {
  let remainingExposure = 1;
  for (const rawFraction of fractions) {
    if (!Number.isFinite(rawFraction) || rawFraction <= 0) continue;
    remainingExposure *= 1 - Math.min(0.95, rawFraction);
  }
  return Math.min(
    MAX_PM25_REDUCTION_PCT,
    Math.max(0, Math.round((1 - remainingExposure) * 100))
  );
}

function multiplyFractions(
  initial: number,
  actions: readonly EvaluatedActionState[]
): number {
  return actions.reduce(
    (acc, s) => acc * (1 - s.factor.pm25ReductionFraction),
    initial
  );
}

function computeAfterNumbers(beforePct: number, afterRemaining: number) {
  const cutPct = Math.min(
    MAX_PM25_REDUCTION_PCT,
    Math.max(0, Math.round((1 - afterRemaining) * 100))
  );
  const afterPct = Math.max(
    MIN_RESIDUAL_EXPOSURE_PCT,
    Math.min(beforePct, Math.round(100 - cutPct))
  );
  const additionalPct =
    beforePct > 0
      ? Math.min(
          MAX_PM25_REDUCTION_PCT,
          Math.max(0, Math.round(((beforePct - afterPct) / beforePct) * 100))
        )
      : 0;
  return { cutPct, afterPct, additionalPct };
}

export function calculateImpact(
  profile: UserProfile,
  selectedActionIds: readonly ImpactActionId[]
): ProfileImpactResult {
  const states = getActionStates(profile);
  const selectedSet = new Set<ImpactActionId>(selectedActionIds);
  const alreadyDoingActions = states.filter((s) => s.status === 'already_doing');
  const selectedActions = states.filter(
    (s) => s.status === 'applicable' && selectedSet.has(s.factor.id)
  );

  const baselineRemaining = multiplyFractions(1, alreadyDoingActions);
  const beforePct = Math.max(
    MIN_RESIDUAL_EXPOSURE_PCT,
    Math.round(baselineRemaining * 100)
  );
  const afterRemaining = multiplyFractions(baselineRemaining, selectedActions);
  const { cutPct, afterPct, additionalPct } = computeAfterNumbers(
    beforePct,
    afterRemaining
  );

  return {
    beforeExposurePct: beforePct,
    afterExposurePct: afterPct,
    additionalExposureCutPct: additionalPct,
    totalExposureCutPct: cutPct,
    airFriendlyScore: Math.min(MAX_AIR_FRIENDLY_SCORE, Math.max(0, 100 - afterPct)),
    baselineScore: Math.min(MAX_AIR_FRIENDLY_SCORE, Math.max(0, 100 - beforePct)),
    co2SavedKgPerMonth: selectedActions.reduce(
      (sum, s) => sum + (s.estimatedCo2Kg ?? 0),
      0
    ),
    selectedActions,
    alreadyDoingActions,
  };
}

export function calculateProfileImpact(
  profile: UserProfile,
  selectedActionIds: readonly ImpactActionId[]
): ProfileImpactResult {
  return calculateImpact(profile, selectedActionIds);
}

export function calculateHouseholdImpact(
  selectedIds: readonly ImpactActionId[],
  options: ImpactCalculationOptions = {}
): ImpactCalculationResult {
  const uniqueIds = new Set<ImpactActionId>(selectedIds);
  const activeActions = IMPACT_ACTION_FACTORS.filter((f) => uniqueIds.has(f.id));
  if (activeActions.length === 0) {
    return {
      pm25ReductionPct: 0,
      co2SavedKgPerMonth: 0,
      airFriendlyScore: 0,
      activeActions: [],
    };
  }
  const pm25ReductionPct = calculateMultiplicativePm25Reduction(
    activeActions.map((a) => a.pm25ReductionFraction)
  );
  const afterExposurePct = Math.max(MIN_RESIDUAL_EXPOSURE_PCT, 100 - pm25ReductionPct);
  const co2Total = activeActions.reduce(
    (sum, a) => sum + (getScaledCo2(a, options.commuteKm) ?? 0),
    0
  );
  return {
    pm25ReductionPct,
    co2SavedKgPerMonth: Math.round(co2Total),
    airFriendlyScore: Math.min(
      MAX_AIR_FRIENDLY_SCORE,
      Math.round(100 - afterExposurePct)
    ),
    activeActions,
  };
}
