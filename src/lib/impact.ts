import type { UserProfile } from '../types';
import {
  IMPACT_ACTION_FACTORS,
  IMPACT_ACTION_MAP,
  MAX_AIR_FRIENDLY_SCORE,
  MAX_COMMUTE_SCALE,
  MAX_PM25_REDUCTION_PCT,
  MIN_COMMUTE_SCALE,
  MIN_RESIDUAL_EXPOSURE_PCT,
  REFERENCE_DAILY_COMMUTE_KM,
  TOP_RECOMMENDED_COUNT,
  type ImpactActionFactor,
  type ImpactActionId,
} from './impactFactors';

export type ActionAvailabilityStatus =
  'applicable' | 'already_doing' | 'not_applicable';

export interface EvaluatedActionState {
  factor: ImpactActionFactor;
  status: ActionAvailabilityStatus;
  /** True for the top 3 applicable actions sorted by estimated benefit */
  recommended: boolean;
  /** Commute-adjusted monthly CO2 estimate (kg), or null if action does not cut CO2 */
  estimatedCo2Kg: number | null;
}

export interface ProfileImpactResult {
  /** Residual exposure today (0-100%) after accounting for user's existing habits */
  beforeExposurePct: number;
  /** Residual exposure (5-100%) after applying newly selected habits multiplicatively */
  afterExposurePct: number;
  /** Additional PM2.5 exposure cut (%) achieved by newly selected choices relative to today */
  additionalExposureCutPct: number;
  /** Total cumulative PM2.5 exposure reduction (%) vs unmitigated baseline (capped at 95%) */
  totalExposureCutPct: number;
  /** Consistent score = round(100 - afterExposurePct), never contradicting exposure cut */
  airFriendlyScore: number;
  /** Baseline score before toggling new choices = round(100 - beforeExposurePct) */
  baselineScore: number;
  /** Monthly CO2 saved (kg) strictly from newly selected emission-reducing actions */
  co2SavedKgPerMonth: number;
  /** Newly selected applicable actions for plain-language explanations */
  selectedActions: EvaluatedActionState[];
  /** Habits already reflected in the user's baseline */
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

const COMMUTE_SCALED_IDS: ReadonlySet<ImpactActionId> = new Set([
  'commute_transit',
  'carpool_three_days',
]);

/**
 * Computes multiplicative stacking of PM2.5 exposure reductions:
 *   combined = 1 - Π(1 - r_i)
 * Clamped strictly to [0, MAX_PM25_REDUCTION_PCT] (95%) so combined actions
 * never claim impossible >95% or >100% particle removal.
 */
export function calculateMultiplicativePm25Reduction(
  fractions: readonly number[]
): number {
  let remainingExposure = 1;
  for (const rawFraction of fractions) {
    if (!Number.isFinite(rawFraction) || rawFraction <= 0) {
      continue;
    }
    const clampedFraction = Math.min(0.95, rawFraction);
    remainingExposure *= 1 - clampedFraction;
  }
  const rawPct = (1 - remainingExposure) * 100;
  return Math.min(MAX_PM25_REDUCTION_PCT, Math.max(0, Math.round(rawPct)));
}

/**
 * Calculates the commute scaling multiplier from a user's daily round-trip km.
 */
export function getCommuteScaleFactor(commuteKm?: number): number {
  if (commuteKm === undefined || !Number.isFinite(commuteKm) || commuteKm <= 0) {
    return 1;
  }
  const ratio = commuteKm / REFERENCE_DAILY_COMMUTE_KM;
  return Math.min(MAX_COMMUTE_SCALE, Math.max(MIN_COMMUTE_SCALE, ratio));
}

function getScaledCo2(factor: ImpactActionFactor, commuteKm?: number): number | null {
  if (factor.co2SavedKgPerMonth === null) {
    return null;
  }
  const scale = COMMUTE_SCALED_IDS.has(factor.id)
    ? getCommuteScaleFactor(commuteKm)
    : 1;
  return Math.round(factor.co2SavedKgPerMonth * scale);
}

/**
 * Determines which simulator actions the user is already doing, which do not
 * apply to their lifestyle, and which remain applicable—sorted so applicable
 * actions appear first ranked by estimated benefit, with the top 3 tagged as
 * recommended.
 */
export function getActionStates(profile: UserProfile): EvaluatedActionState[] {
  const isLowEmissionCommute =
    profile.commuteMode === 'public_transport' ||
    profile.commuteMode === 'walk_cycle' ||
    profile.commuteMode === 'work_from_home';

  const isCarpoolInapplicable =
    profile.commuteMode === 'work_from_home' ||
    profile.commuteMode === 'walk_cycle' ||
    profile.commuteMode === 'public_transport';

  const hasCleanCooking =
    profile.cookingFuel === 'induction_electric' || profile.cookingFuel === 'piped_gas';

  const rawStates: EvaluatedActionState[] = IMPACT_ACTION_FACTORS.map((factor) => {
    let status: ActionAvailabilityStatus = 'applicable';

    if (factor.id === 'commute_transit' && isLowEmissionCommute) {
      status = 'already_doing';
    } else if (factor.id === 'carpool_three_days' && isCarpoolInapplicable) {
      status = 'not_applicable';
    } else if (factor.id === 'clean_cooking' && hasCleanCooking) {
      status = 'already_doing';
    } else if (factor.id === 'bedroom_purifier' && profile.hasAirPurifier) {
      status = 'already_doing';
    }

    return {
      factor,
      status,
      recommended: false,
      estimatedCo2Kg: getScaledCo2(factor, profile.commuteKm),
    };
  });

  // Rank applicable actions first by estimated combined benefit (PM2.5 reduction primary, CO2 secondary)
  const benefitScore = (state: EvaluatedActionState): number => {
    const pmScore = state.factor.pm25ReductionFraction * 100;
    const co2Bonus = state.estimatedCo2Kg !== null ? state.estimatedCo2Kg * 0.15 : 0;
    return pmScore + co2Bonus;
  };

  const applicable = rawStates
    .filter((s) => s.status === 'applicable')
    .sort((a, b) => benefitScore(b) - benefitScore(a))
    .map((state, index) => ({
      ...state,
      recommended: index < TOP_RECOMMENDED_COUNT,
    }));

  const alreadyDoing = rawStates.filter((s) => s.status === 'already_doing');
  const notApplicable = rawStates.filter((s) => s.status === 'not_applicable');

  return [...applicable, ...alreadyDoing, ...notApplicable];
}

/**
 * Computes consistent, profile-aware BEFORE -> AFTER exposure metrics,
 * Air-Friendly Score (`round(100 - afterExposurePct)`), and CO2 savings
 * strictly for newly selected emission-reducing habits.
 */
export function calculateImpact(
  profile: UserProfile,
  selectedActionIds: readonly ImpactActionId[]
): ProfileImpactResult {
  const states = getActionStates(profile);
  const selectedSet = new Set<ImpactActionId>(selectedActionIds);

  const alreadyDoingActions = states.filter(
    (state) => state.status === 'already_doing'
  );
  const selectedActions = states.filter(
    (state) => state.status === 'applicable' && selectedSet.has(state.factor.id)
  );

  // Compute baseline exposure from already-doing habits multiplicatively
  let baselineRemaining = 1;
  for (const state of alreadyDoingActions) {
    baselineRemaining *= 1 - state.factor.pm25ReductionFraction;
  }
  const beforeExposurePct = Math.max(
    MIN_RESIDUAL_EXPOSURE_PCT,
    Math.round(baselineRemaining * 100)
  );

  // Apply newly selected habits multiplicatively on top of baseline
  let afterRemaining = baselineRemaining;
  for (const state of selectedActions) {
    afterRemaining *= 1 - state.factor.pm25ReductionFraction;
  }

  const uncappedTotalCut = (1 - afterRemaining) * 100;
  const totalExposureCutPct = Math.min(
    MAX_PM25_REDUCTION_PCT,
    Math.max(0, Math.round(uncappedTotalCut))
  );
  const afterExposurePct = Math.max(
    MIN_RESIDUAL_EXPOSURE_PCT,
    Math.min(beforeExposurePct, Math.round(100 - totalExposureCutPct))
  );

  // Additional reduction relative to today's baseline exposure
  const additionalExposureCutPct =
    beforeExposurePct > 0
      ? Math.min(
          MAX_PM25_REDUCTION_PCT,
          Math.max(
            0,
            Math.round(
              ((beforeExposurePct - afterExposurePct) / beforeExposurePct) * 100
            )
          )
        )
      : 0;

  // Score is strictly defined as round(100 - residualExposurePercent)
  const baselineScore = Math.min(
    MAX_AIR_FRIENDLY_SCORE,
    Math.max(0, Math.round(100 - beforeExposurePct))
  );
  const airFriendlyScore = Math.min(
    MAX_AIR_FRIENDLY_SCORE,
    Math.max(0, Math.round(100 - afterExposurePct))
  );

  // Sum CO2 ONLY for newly selected actions that actually cut emissions
  let co2SavedKgPerMonth = 0;
  for (const state of selectedActions) {
    if (state.estimatedCo2Kg !== null) {
      co2SavedKgPerMonth += state.estimatedCo2Kg;
    }
  }

  return {
    beforeExposurePct,
    afterExposurePct,
    additionalExposureCutPct,
    totalExposureCutPct,
    airFriendlyScore,
    baselineScore,
    co2SavedKgPerMonth,
    selectedActions,
    alreadyDoingActions,
  };
}

/**
 * Legacy helper retained for pure additive-free multiplicative math checks.
 * Computes household impact from a raw list of action IDs without a profile.
 */
export function calculateHouseholdImpact(
  selectedIds: readonly ImpactActionId[],
  options: ImpactCalculationOptions = {}
): ImpactCalculationResult {
  const uniqueIds = new Set<ImpactActionId>(selectedIds);
  const activeActions = IMPACT_ACTION_FACTORS.filter((factor) =>
    uniqueIds.has(factor.id)
  );

  if (activeActions.length === 0) {
    return {
      pm25ReductionPct: 0,
      co2SavedKgPerMonth: 0,
      airFriendlyScore: 0,
      activeActions: [],
    };
  }

  const fractions = activeActions.map((action) => action.pm25ReductionFraction);
  const pm25ReductionPct = calculateMultiplicativePm25Reduction(fractions);
  const afterExposurePct = Math.max(MIN_RESIDUAL_EXPOSURE_PCT, 100 - pm25ReductionPct);

  let co2Total = 0;
  for (const action of activeActions) {
    const scaled = getScaledCo2(action, options.commuteKm);
    if (scaled !== null) {
      co2Total += scaled;
    }
  }

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

/**
 * Returns default starter simulator selections tailored to the user's profile
 * (only selecting applicable actions that are not already done).
 */
export function getRecommendedInitialActions(profile: UserProfile): ImpactActionId[] {
  const states = getActionStates(profile);
  const applicableIds = new Set(
    states.filter((s) => s.status === 'applicable').map((s) => s.factor.id)
  );
  const preferred: ImpactActionId[] = ['close_windows_peak', 'fitted_n95_mask'];
  return preferred.filter(
    (id) => applicableIds.has(id) && Boolean(IMPACT_ACTION_MAP[id])
  );
}
