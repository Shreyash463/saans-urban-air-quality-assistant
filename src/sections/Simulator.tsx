import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImpactMeter } from '../components/ImpactMeter';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { t } from '../lib/i18n';
import {
  calculateImpact,
  getActionStates,
  getRecommendedInitialActions,
} from '../lib/impact';
import { IMPACT_ACTION_FACTORS, type ImpactActionId } from '../lib/impactFactors';
import type { UserProfile } from '../types';

interface SimulatorProps {
  profile: UserProfile;
}

/**
 * Profile-aware Interactive Impact Simulator ("See the impact of your choices").
 * Habits already followed by the user are shown as disabled "Already doing ✓"
 * cards counted in the baseline; inapplicable actions are hidden; applicable
 * actions are ranked by benefit with the top 3 tagged "Recommended for you".
 */
export default function Simulator({ profile }: SimulatorProps) {
  const { language } = profile;

  const actionStates = useMemo(() => getActionStates(profile), [profile]);
  const visibleStates = useMemo(
    () => actionStates.filter((state) => state.status !== 'not_applicable'),
    [actionStates]
  );
  const applicableIdSet = useMemo(
    () =>
      new Set(
        actionStates
          .filter((state) => state.status === 'applicable')
          .map((state) => state.factor.id)
      ),
    [actionStates]
  );

  const [selectedIds, setSelectedIds] = useState<ImpactActionId[]>(() =>
    getRecommendedInitialActions(profile)
  );
  const [communityHouseholds, setCommunityHouseholds] = useState(50);
  const [showMethodology, setShowMethodology] = useState(false);

  // Drop selections that become already-doing or inapplicable when profile changes
  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => applicableIdSet.has(id)));
  }, [applicableIdSet]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleAction = useCallback(
    (id: ImpactActionId) => {
      if (!applicableIdSet.has(id)) return;
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [applicableIdSet]
  );

  const resetActions = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const impact = useMemo(
    () => calculateImpact(profile, selectedIds),
    [profile, selectedIds]
  );

  const communityCo2Kg = impact.co2SavedKgPerMonth * communityHouseholds;
  const stopsBurningOrBiomass =
    selectedSet.has('stop_waste_burning') ||
    selectedSet.has('clean_cooking') ||
    profile.cookingFuel === 'induction_electric';

  return (
    <section
      id="simulator"
      aria-labelledby="simulator-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4" data-reveal>
          <div className="max-w-2xl">
            <h2
              id="simulator-heading"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {t(language, 'simulatorHeading')}
            </h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              {t(language, 'simulatorSubheading')}
            </p>
          </div>

          <button
            type="button"
            onClick={resetActions}
            disabled={selectedIds.length === 0}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] text-sm font-medium text-slate-800 dark:text-slate-200 hover:border-teal-600/60 inline-flex items-center gap-2 transition-colors disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            <span>{t(language, 'simulatorReset')}</span>
          </button>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Profile-aware toggle cards (applicable ranked first, already-doing disabled) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {visibleStates.map((state) => {
              const { factor, status, recommended, estimatedCo2Kg } = state;
              const isAlreadyDone = status === 'already_doing';
              const checked = isAlreadyDone ? true : selectedSet.has(factor.id);
              const pm25Pct = Math.round(factor.pm25ReductionFraction * 100);
              const co2Label =
                estimatedCo2Kg !== null
                  ? `~${estimatedCo2Kg} kg CO2/mo`
                  : t(language, 'co2NotApplicable');
              const metaText = isAlreadyDone
                ? t(language, 'alreadyDoingNote')
                : `~${pm25Pct}% PM2.5 · ${co2Label}`;

              return (
                <ToggleSwitch
                  key={factor.id}
                  id={`sim-switch-${factor.id}`}
                  label={factor.label[language]}
                  metaText={metaText}
                  checked={checked}
                  disabled={isAlreadyDone}
                  badgeText={
                    isAlreadyDone
                      ? t(language, 'alreadyDoingBadge')
                      : recommended
                        ? t(language, 'recommendedBadge')
                        : undefined
                  }
                  badgeTone={isAlreadyDone ? 'done' : 'recommended'}
                  onToggle={() => toggleAction(factor.id)}
                />
              );
            })}
          </div>

          {/* Right: Live BEFORE -> AFTER Impact Meter */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
            <ImpactMeter impact={impact} language={language} />

            {/* Community multiplier slider */}
            <div className="saans-theme-surface rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="saans-community-scale"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t(language, 'communityScaleHeading')}
                </label>
                <span
                  className="text-sm font-semibold text-teal-800 dark:text-teal-300 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {communityHouseholds} {t(language, 'communityScaleHomesUnit')}
                </span>
              </div>

              <input
                id="saans-community-scale"
                type="range"
                min={10}
                max={500}
                step={5}
                value={communityHouseholds}
                onChange={(e) => setCommunityHouseholds(Number(e.target.value))}
                aria-label={`${t(language, 'communityScaleLabel')}: ${communityHouseholds}`}
                className="saans-slider w-full h-2 rounded-lg bg-slate-200 dark:bg-slate-800 cursor-pointer"
              />

              <div className="flex items-baseline justify-between gap-2 pt-1 text-sm">
                <span className="text-slate-600 dark:text-slate-300">
                  {t(language, 'communityScaleCo2Label')}
                </span>
                <span
                  data-testid="community-co2-value"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  ~{communityCo2Kg.toLocaleString()} kg
                </span>
              </div>

              {stopsBurningOrBiomass ? (
                <p className="text-xs sm:text-sm text-teal-800 dark:text-teal-300 font-medium">
                  {communityHouseholds} {t(language, 'communityScaleHomesUnit')} —{' '}
                  {t(language, 'communityScaleWasteNote')}
                </p>
              ) : (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  {t(language, 'communityScaleSelectHint')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Expandable "How we calculated this" disclosure */}
        <div className="saans-theme-surface mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] overflow-hidden">
          <button
            type="button"
            aria-expanded={showMethodology}
            aria-controls="simulator-methodology-panel"
            onClick={() => setShowMethodology((prev) => !prev)}
            className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between gap-4 text-left text-base font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
          >
            <span>{t(language, 'howCalculatedToggle')}</span>
            {showMethodology ? (
              <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
          </button>

          {showMethodology ? (
            <div
              id="simulator-methodology-panel"
              className="px-6 pb-6 pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-4"
            >
              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                {t(language, 'howCalculatedIntro')}
              </p>

              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-300">
                {IMPACT_ACTION_FACTORS.map((factor) => (
                  <li
                    key={factor.id}
                    className="rounded-xl bg-slate-50 dark:bg-[#0B1220] border border-slate-200/80 dark:border-slate-800 p-3.5 leading-relaxed"
                  >
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                      {factor.label[language]}
                    </span>
                    <span className="mt-1 block">
                      {factor.assumptionNote[language]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
