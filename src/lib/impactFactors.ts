import contractData from '../../contract/impact-factors.json';

/**
 * Numeric constants and action catalog for the Saans Impact Simulator,
 * backed by the single-source-of-truth contract/impact-factors.json shared
 * with the FastAPI backend.
 */

export type ImpactActionId =
  | 'commute_transit'
  | 'stop_waste_burning'
  | 'bedroom_purifier'
  | 'close_windows_peak'
  | 'clean_cooking'
  | 'carpool_three_days'
  | 'fitted_n95_mask'
  | 'seal_door_gaps';

export interface ImpactActionFactor {
  id: ImpactActionId;
  /** Approximate personal PM2.5 exposure reduction fraction (0 to 1, estimate) */
  pm25ReductionFraction: number;
  /**
   * Approximate monthly CO2 emissions avoided in kg (estimate).
   * Explicitly `null` for personal-protection actions that do not meaningfully
   * lower carbon emissions (windows, N95 mask, door sealing, air purifier).
   */
  co2SavedKgPerMonth: number | null;
  label: {
    en: string;
    hi: string;
  };
  impactSentence: {
    en: string;
    hi: string;
  };
  assumptionNote: {
    en: string;
    hi: string;
  };
}

export type AlternativePresetKey = keyof typeof contractData.alternativeNumbers;

export const MAX_PM25_REDUCTION_PCT = contractData.constants.MAX_PM25_REDUCTION_PCT;
export const MIN_RESIDUAL_EXPOSURE_PCT =
  contractData.constants.MIN_RESIDUAL_EXPOSURE_PCT;
export const MAX_AIR_FRIENDLY_SCORE = contractData.constants.MAX_AIR_FRIENDLY_SCORE;
export const TOP_RECOMMENDED_COUNT = contractData.constants.TOP_RECOMMENDED_COUNT;
export const REFERENCE_DAILY_COMMUTE_KM =
  contractData.constants.REFERENCE_DAILY_COMMUTE_KM;
export const MIN_COMMUTE_SCALE = contractData.constants.MIN_COMMUTE_SCALE;
export const MAX_COMMUTE_SCALE = contractData.constants.MAX_COMMUTE_SCALE;

export const IMPACT_ACTION_FACTORS: readonly ImpactActionFactor[] =
  contractData.actions as readonly ImpactActionFactor[];

export const IMPACT_ACTION_MAP: Readonly<Record<ImpactActionId, ImpactActionFactor>> =
  IMPACT_ACTION_FACTORS.reduce(
    (acc, factor) => {
      acc[factor.id] = factor;
      return acc;
    },
    {} as Record<ImpactActionId, ImpactActionFactor>
  );

/**
 * Computes consistent PM2.5 and monthly CO2 numbers for plan alternatives
 * directly from the shared contract constants.
 */
export function getAlternativeMetrics(
  presetKey: AlternativePresetKey,
  commuteKm: number
): { pm25ReductionPct: number; co2SavedKgPerMonth: number } {
  const spec = contractData.alternativeNumbers[presetKey];
  const pm25ReductionPct = Math.min(
    MAX_PM25_REDUCTION_PCT,
    Math.max(0, Math.round(spec.pm25ReductionPct))
  );
  if (!spec.emissionRelevant) {
    return { pm25ReductionPct, co2SavedKgPerMonth: 0 };
  }
  const scale =
    spec.commuteScaled && Number.isFinite(commuteKm) && commuteKm > 0
      ? Math.min(
          MAX_COMMUTE_SCALE,
          Math.max(MIN_COMMUTE_SCALE, commuteKm / REFERENCE_DAILY_COMMUTE_KM)
        )
      : 1;
  return {
    pm25ReductionPct,
    co2SavedKgPerMonth: Math.max(0, Math.round(spec.baseCo2KgPerMonth * scale)),
  };
}
