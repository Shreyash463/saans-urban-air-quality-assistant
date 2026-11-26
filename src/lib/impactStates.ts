import type { UserProfile } from '../types';
import {
  IMPACT_ACTION_FACTORS,
  IMPACT_ACTION_MAP,
  MAX_COMMUTE_SCALE,
  MIN_COMMUTE_SCALE,
  REFERENCE_DAILY_COMMUTE_KM,
  TOP_RECOMMENDED_COUNT,
  type ImpactActionFactor,
  type ImpactActionId,
} from './impactFactors';

type ActionAvailabilityStatus = 'applicable' | 'already_doing' | 'not_applicable';

export interface EvaluatedActionState {
  factor: ImpactActionFactor;
  status: ActionAvailabilityStatus;
  recommended: boolean;
  estimatedCo2Kg: number | null;
}

const COMMUTE_SCALED_IDS: ReadonlySet<ImpactActionId> = new Set([
  'commute_transit',
  'carpool_three_days',
]);

const LOW_COMMUTE_MODES = new Set(['public_transport', 'walk_cycle', 'work_from_home']);
const CLEAN_FUELS = new Set(['induction_electric', 'piped_gas']);

function getCommuteScaleFactor(commuteKm?: number): number {
  if (commuteKm === undefined || !Number.isFinite(commuteKm) || commuteKm <= 0)
    return 1;
  const ratio = commuteKm / REFERENCE_DAILY_COMMUTE_KM;
  return Math.min(MAX_COMMUTE_SCALE, Math.max(MIN_COMMUTE_SCALE, ratio));
}

export function getScaledCo2(
  factor: ImpactActionFactor,
  commuteKm?: number
): number | null {
  if (factor.co2SavedKgPerMonth === null) return null;
  const scale = COMMUTE_SCALED_IDS.has(factor.id)
    ? getCommuteScaleFactor(commuteKm)
    : 1;
  return Math.round(factor.co2SavedKgPerMonth * scale);
}

function resolveActionStatus(
  id: ImpactActionId,
  profile: UserProfile
): ActionAvailabilityStatus {
  const lowCommute = LOW_COMMUTE_MODES.has(profile.commuteMode);
  const statusMap: Partial<Record<ImpactActionId, ActionAvailabilityStatus>> = {
    commute_transit: lowCommute ? 'already_doing' : 'applicable',
    carpool_three_days: lowCommute ? 'not_applicable' : 'applicable',
    clean_cooking: CLEAN_FUELS.has(profile.cookingFuel)
      ? 'already_doing'
      : 'applicable',
    bedroom_purifier: profile.hasAirPurifier ? 'already_doing' : 'applicable',
  };
  return statusMap[id] ?? 'applicable';
}

function benefitScore(state: EvaluatedActionState): number {
  const co2Bonus = state.estimatedCo2Kg !== null ? state.estimatedCo2Kg * 0.15 : 0;
  return state.factor.pm25ReductionFraction * 100 + co2Bonus;
}

export function getActionStates(profile: UserProfile): EvaluatedActionState[] {
  const rawStates: EvaluatedActionState[] = IMPACT_ACTION_FACTORS.map((factor) => ({
    factor,
    status: resolveActionStatus(factor.id, profile),
    recommended: false,
    estimatedCo2Kg: getScaledCo2(factor, profile.commuteKm),
  }));
  const applicable = rawStates
    .filter((s) => s.status === 'applicable')
    .sort((a, b) => benefitScore(b) - benefitScore(a))
    .map((state, idx) => ({ ...state, recommended: idx < TOP_RECOMMENDED_COUNT }));

  return [
    ...applicable,
    ...rawStates.filter((s) => s.status === 'already_doing'),
    ...rawStates.filter((s) => s.status === 'not_applicable'),
  ];
}

export function getRecommendedInitialActions(profile: UserProfile): ImpactActionId[] {
  const applicableIds = new Set(
    getActionStates(profile)
      .filter((s) => s.status === 'applicable')
      .map((s) => s.factor.id)
  );
  const preferred: ImpactActionId[] = ['close_windows_peak', 'fitted_n95_mask'];
  return preferred.filter(
    (id) => applicableIds.has(id) && Boolean(IMPACT_ACTION_MAP[id])
  );
}
