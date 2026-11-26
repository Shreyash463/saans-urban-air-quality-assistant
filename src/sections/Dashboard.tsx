import { HeartPulse, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AqiCategoryBadge } from '../components/AqiCategoryBadge';
import { AqiGauge } from '../components/AqiGauge';
import { CommunityActionsSection } from '../components/CommunityActionsSection';
import {
  AiBusyRetryNotice,
  AlternativesCard,
  DashboardExportActions,
  IndoorHacksCard,
  OfflineSampleNotice,
  RoutineTimelineCard,
} from '../components/DashboardPlanCards';
import { DemoReadingInfo } from '../components/DemoReadingInfo';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CPCB_AQI_CATEGORIES, getAqiCategory } from '../lib/aqi';
import { t, type TranslationKey } from '../lib/i18n';
import { formatAqiSourceLabel, formatAqiTimestampIst } from '../lib/planExport';
import type { LanguageCode, PlanResponse } from '../types';

interface DashboardProps {
  plan: PlanResponse | null;
  language: LanguageCode;
  announcement: string;
  isLoading: boolean;
  onRetryGemini?: () => void;
}

const LOADING_STAGE_KEYS: readonly TranslationKey[] = [
  'loadingStageAqi',
  'loadingStageGemini',
  'loadingStageSafety',
];

export function PlanLoadingStatus({ language }: { language: LanguageCode }) {
  const reducedMotion = useReducedMotion();
  const [stageIndex, setStageIndex] = useState(0);
  const [wakingServer, setWakingServer] = useState(false);

  useEffect(() => {
    setStageIndex(0);
    setWakingServer(false);
    const wakeTimer = globalThis.setTimeout(() => setWakingServer(true), 6000);
    if (reducedMotion) {
      return () => globalThis.clearTimeout(wakeTimer);
    }
    const interval = globalThis.setInterval(() => {
      setStageIndex((prev) => (prev < LOADING_STAGE_KEYS.length - 1 ? prev + 1 : prev));
    }, 1100);
    return () => {
      globalThis.clearTimeout(wakeTimer);
      globalThis.clearInterval(interval);
    };
  }, [reducedMotion]);

  return (
    <div
      className="mt-8 space-y-6"
      role="status"
      aria-live="polite"
      aria-label={t(language, 'planLoadingLabel')}
    >
      <div className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 px-5 py-4">
        <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">
          {t(language, LOADING_STAGE_KEYS[stageIndex])}
        </p>
        {wakingServer ? (
          <p className="mt-1.5 text-xs sm:text-sm text-teal-800 dark:text-teal-300">
            {t(language, 'loadingWakingServer')}
          </p>
        ) : null}
        <ol className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
          {LOADING_STAGE_KEYS.map((key, idx) => {
            const done = idx < stageIndex;
            const active = idx === stageIndex;
            return (
              <li
                key={key}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                  done
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                    : active
                      ? 'border-teal-500 bg-white text-teal-900 dark:border-teal-400 dark:bg-[#0B1220] dark:text-teal-200 font-semibold'
                      : 'border-slate-200 bg-white/60 text-slate-600 dark:border-slate-800 dark:bg-[#0B1220]/60 dark:text-slate-400'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-mono"
                >
                  {done ? '✓' : idx + 1}
                </span>
                <span>{t(language, key)}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="saans-skeleton lg:col-span-5 h-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#131C2E]/80" />
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="saans-skeleton h-40 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#131C2E]/80" />
          <div className="saans-skeleton h-34 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#131C2E]/80" />
        </div>
      </div>
      <div className="saans-skeleton h-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#131C2E]/80" />
    </div>
  );
}

function DashboardTopOverview({
  plan,
  language,
  activeCategoryKey,
  liveTimeIst,
}: {
  plan: PlanResponse;
  language: LanguageCode;
  activeCategoryKey: string;
  liveTimeIst: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <article
        data-reveal
        className="saans-theme-surface saans-card-lift print-card lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 flex flex-col gap-5"
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {t(language, 'cpcbScaleLabel')}
            </span>
            {plan.aqi.source === 'demo' ? (
              <DemoReadingInfo language={language} />
            ) : (
              <span className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                {formatAqiSourceLabel(plan.aqi, language)}
              </span>
            )}
          </div>
          <div className="mt-4">
            <AqiGauge
              aqi={plan.aqi.aqi}
              city={plan.aqi.city}
              language={language}
              size="card"
              animateOnMount
            />
          </div>
          <dl className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-sm text-slate-600 dark:text-slate-300">
                {t(language, 'dominantPollutantLabel')}
              </dt>
              <dd
                className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {plan.aqi.dominantPollutant}
              </dd>
            </div>
            {plan.aqi.source === 'live' && liveTimeIst ? (
              <div>
                <dt className="text-sm text-slate-600 dark:text-slate-300">
                  {t(language, 'updatedAtLabel')}
                </dt>
                <dd className="mt-0.5 text-base font-medium text-slate-900 dark:text-slate-100">
                  {liveTimeIst}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
          <div
            className="grid grid-cols-6 gap-1 h-2.5 rounded-full overflow-hidden"
            aria-hidden="true"
          >
            {CPCB_AQI_CATEGORIES.map((cat) => (
              <span
                key={cat.key}
                style={{ backgroundColor: cat.strokeColor }}
                className={`block h-full ${
                  cat.key === activeCategoryKey
                    ? 'saans-active-segment ring-1 ring-white/70 dark:ring-slate-900/70'
                    : 'opacity-70'
                }`}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-2.5">
            {CPCB_AQI_CATEGORIES.map((cat) => (
              <div
                key={cat.key}
                className="text-xs sm:text-[13px] leading-tight text-slate-600 dark:text-slate-300"
              >
                <span
                  className={`block ${
                    cat.key === activeCategoryKey
                      ? 'font-bold text-slate-900 dark:text-white'
                      : 'font-semibold text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {cat.label[language]}
                </span>
                <span
                  className="tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {cat.min}–{cat.max}
                </span>
              </div>
            ))}
          </div>
        </div>
      </article>

      <div className="lg:col-span-7 flex flex-col gap-6">
        <article
          data-reveal
          data-reveal-delay="80"
          className="saans-theme-surface saans-card-lift print-card flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <HeartPulse
                className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'healthAdvisoryHeading')}
              </h3>
            </div>
            <span className="text-sm font-semibold px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-amber-200">
              {t(language, 'notMedicalAdviceBadge')}
            </span>
          </div>
          <p className="mt-3.5 text-base text-slate-800 dark:text-slate-100 leading-relaxed">
            {plan.healthAdvisory}
          </p>
          <p className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {plan.disclaimer}
          </p>
        </article>

        <article
          data-reveal
          data-reveal-delay="140"
          className="saans-theme-surface saans-card-lift print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Shield
                className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
                aria-hidden="true"
              />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'maskGuidanceHeading')}
              </h3>
            </div>
            <AqiCategoryBadge aqi={plan.aqi.aqi} language={language} size="sm" />
          </div>
          <p className="mt-3 text-base text-slate-800 dark:text-slate-100 leading-relaxed">
            {plan.maskGuidance}
          </p>
        </article>
      </div>
    </div>
  );
}

function getGeneratorBadgeLabel(
  plan: PlanResponse | null,
  language: LanguageCode
): string {
  if (plan?.isOfflineSample) {
    return t(language, 'generatedByOfflineSample');
  }
  return plan?.generatedBy === 'gemini'
    ? t(language, 'generatedByGemini')
    : t(language, 'generatedByRules');
}

function getGeneratorBadgeClass(plan: PlanResponse | null): string {
  const isGemini = plan?.generatedBy === 'gemini' && !plan?.isOfflineSample;
  return isGemini
    ? 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-200'
    : 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

/**
 * Results Dashboard rendering the complete personalized clean-air plan.
 */
export function Dashboard({
  plan,
  language,
  announcement,
  isLoading,
  onRetryGemini,
}: DashboardProps) {
  const activeCategoryKey = plan ? getAqiCategory(plan.aqi.aqi).key : '';
  const showPlan = Boolean(plan && !isLoading);
  const liveTimeIst = plan ? formatAqiTimestampIst(plan.aqi.updatedAt) : '';

  return (
    <section
      id="dashboard"
      aria-labelledby="dashboard-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id="dashboard-heading"
                tabIndex={-1}
                className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md"
              >
                {t(language, 'dashboardHeading')}
              </h2>
              {showPlan ? (
                <span
                  data-testid="plan-generator-badge"
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${getGeneratorBadgeClass(plan)}`}
                >
                  {getGeneratorBadgeLabel(plan, language)}
                </span>
              ) : null}
            </div>
            {showPlan && plan ? (
              <>
                <AiBusyRetryNotice
                  plan={plan}
                  language={language}
                  isLoading={isLoading}
                  onRetryGemini={onRetryGemini}
                />
                <OfflineSampleNotice
                  plan={plan}
                  language={language}
                  isLoading={isLoading}
                  onRetryGemini={onRetryGemini}
                />
                <p className="text-base text-slate-700 dark:text-slate-200 max-w-3xl leading-relaxed">
                  {plan.summary}
                </p>
              </>
            ) : null}
          </div>

          {showPlan && plan ? (
            <DashboardExportActions plan={plan} language={language} />
          ) : null}
        </div>

        {isLoading ? (
          <PlanLoadingStatus language={language} />
        ) : !plan ? (
          <div className="saans-theme-surface mt-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-[#131C2E]/70 p-8 sm:p-10 text-center">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t(language, 'dashboardEmptyHeading')}
            </h3>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
              {t(language, 'dashboardEmptyBody')}
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            <DashboardTopOverview
              plan={plan}
              language={language}
              activeCategoryKey={activeCategoryKey}
              liveTimeIst={liveTimeIst}
            />
            <RoutineTimelineCard routine={plan.routine} language={language} />
            <IndoorHacksCard hacks={plan.indoorHacks} language={language} />
            <AlternativesCard alternatives={plan.alternatives} language={language} />
            {plan.communityActions && plan.communityActions.length > 0 ? (
              <CommunityActionsSection
                actions={plan.communityActions}
                language={language}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
