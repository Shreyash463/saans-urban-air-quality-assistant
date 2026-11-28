import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ImpactMeter } from '../components/ImpactMeter';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { Button } from '../components/ui/Button';
import { RangeSlider } from '../components/ui/RangeSlider';
import { t } from '../lib/i18n';
import { calculateImpact } from '../lib/impact';
import {
  getActionStates,
  getRecommendedInitialActions,
  type EvaluatedActionState,
} from '../lib/impactStates';
import { IMPACT_ACTION_FACTORS, type ImpactActionId } from '../lib/impactFactors';
import type { LanguageCode, UserProfile } from '../types';

interface ScaleCardProps {
  households: number;
  co2PerHomeKg: number;
  stopsBurningOrBiomass: boolean;
  language: LanguageCode;
  onChangeHouseholds: (next: number) => void;
}

function SimulatorActionGrid({
  visibleStates,
  selectedSet,
  language,
  onToggle,
}: {
  visibleStates: EvaluatedActionState[];
  selectedSet: ReadonlySet<ImpactActionId>;
  language: LanguageCode;
  onToggle: (id: ImpactActionId) => void;
}) {
  return (
    <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {visibleStates.map(({ factor, status, recommended, estimatedCo2Kg }) => {
        const isAlreadyDone = status === 'already_doing';
        const pm25Pct = Math.round(factor.pm25ReductionFraction * 100);
        const co2Label =
          estimatedCo2Kg !== null
            ? `~${estimatedCo2Kg} kg CO2/mo`
            : t(language, 'co2NotApplicable');
        return (
          <ToggleSwitch
            key={factor.id}
            id={`sim-switch-${factor.id}`}
            label={factor.label[language]}
            metaText={
              isAlreadyDone
                ? t(language, 'alreadyDoingNote')
                : `~${pm25Pct}% PM2.5 · ${co2Label}`
            }
            checked={isAlreadyDone ? true : selectedSet.has(factor.id)}
            disabled={isAlreadyDone}
            badgeText={
              isAlreadyDone
                ? t(language, 'alreadyDoingBadge')
                : recommended
                  ? t(language, 'recommendedBadge')
                  : undefined
            }
            badgeTone={isAlreadyDone ? 'done' : 'recommended'}
            onToggle={() => onToggle(factor.id)}
          />
        );
      })}
    </div>
  );
}

function CommunityScaleCard({
  households,
  co2PerHomeKg,
  stopsBurningOrBiomass,
  language,
  onChangeHouseholds,
}: ScaleCardProps) {
  const communityCo2Kg = co2PerHomeKg * households;
  const noteText = stopsBurningOrBiomass
    ? `${households} ${t(language, 'communityScaleHomesUnit')} — ${t(language, 'communityScaleWasteNote')}`
    : t(language, 'communityScaleSelectHint');
  const noteTone = stopsBurningOrBiomass
    ? 'text-xs sm:text-sm text-teal-800 dark:text-teal-300 font-medium'
    : 'text-xs sm:text-sm text-slate-600 dark:text-slate-300';

  return (
    <div className="saans-theme-surface rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-5 space-y-3">
      <RangeSlider
        id="saans-community-scale"
        label={t(language, 'communityScaleHeading')}
        valueLabel={`${households} ${t(language, 'communityScaleHomesUnit')}`}
        min={10}
        max={500}
        step={5}
        value={households}
        ariaLabel={`${t(language, 'communityScaleLabel')}: ${households}`}
        onChange={onChangeHouseholds}
      />
      <div className="flex items-baseline justify-between gap-2 pt-1 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          {t(language, 'communityScaleCo2Label')}
        </span>
        <span
          data-testid="community-co2-value"
          className="font-mono text-lg font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
        >
          ~{communityCo2Kg.toLocaleString()} kg
        </span>
      </div>
      <p className={noteTone}>{noteText}</p>
    </div>
  );
}

function MethodologyDisclosure({ language }: { language: LanguageCode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="saans-theme-surface mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="simulator-methodology-panel"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-[52px] px-6 py-3.5 flex items-center justify-between gap-4 text-left text-base font-semibold text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
      >
        <span>{t(language, 'howCalculatedToggle')}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}
      </button>
      {open ? (
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
                <span className="mt-1 block">{factor.assumptionNote[language]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function useSimulatorState(profile: UserProfile) {
  const actionStates = useMemo(() => getActionStates(profile), [profile]);
  const visibleStates = useMemo(
    () => actionStates.filter((s) => s.status !== 'not_applicable'),
    [actionStates]
  );
  const applicableIdSet = useMemo(
    () =>
      new Set(
        actionStates.filter((s) => s.status === 'applicable').map((s) => s.factor.id)
      ),
    [actionStates]
  );
  const [selectedIds, setSelectedIds] = useState<ImpactActionId[]>(() =>
    getRecommendedInitialActions(profile)
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => applicableIdSet.has(id)));
  }, [applicableIdSet]);
  const toggleAction = useCallback(
    (id: ImpactActionId) => {
      if (!applicableIdSet.has(id)) return;
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [applicableIdSet]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const impact = useMemo(
    () => calculateImpact(profile, selectedIds),
    [profile, selectedIds]
  );
  return {
    visibleStates,
    selectedIds,
    selectedSet,
    impact,
    toggleAction,
    reset: () => setSelectedIds([]),
  };
}

function SimulatorHeader({
  language,
  resetDisabled,
  onReset,
}: {
  language: LanguageCode;
  resetDisabled: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
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
      <Button
        type="button"
        onClick={onReset}
        disabled={resetDisabled}
        className="px-4 py-2 font-medium"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>{t(language, 'simulatorReset')}</span>
      </Button>
    </div>
  );
}

export default function Simulator({ profile }: { profile: UserProfile }) {
  const { language } = profile;
  const sim = useSimulatorState(profile);
  const [households, setHouseholds] = useState(50);
  const stopsBurning =
    sim.selectedSet.has('stop_waste_burning') ||
    sim.selectedSet.has('clean_cooking') ||
    profile.cookingFuel === 'induction_electric';

  return (
    <section
      id="simulator"
      aria-labelledby="simulator-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SimulatorHeader
          language={language}
          resetDisabled={sim.selectedIds.length === 0}
          onReset={sim.reset}
        />
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <SimulatorActionGrid
            visibleStates={sim.visibleStates}
            selectedSet={sim.selectedSet}
            language={language}
            onToggle={sim.toggleAction}
          />
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
            <ImpactMeter impact={sim.impact} language={language} />
            <CommunityScaleCard
              households={households}
              co2PerHomeKg={sim.impact.co2SavedKgPerMonth}
              stopsBurningOrBiomass={stopsBurning}
              language={language}
              onChangeHouseholds={setHouseholds}
            />
          </div>
        </div>
        <MethodologyDisclosure language={language} />
      </div>
    </section>
  );
}
