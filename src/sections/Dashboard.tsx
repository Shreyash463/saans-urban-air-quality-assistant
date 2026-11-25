import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  Download,
  HeartPulse,
  Printer,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { AqiCategoryBadge } from '../components/AqiCategoryBadge';
import { AqiGauge } from '../components/AqiGauge';
import { DemoReadingInfo } from '../components/DemoReadingInfo';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CPCB_AQI_CATEGORIES, getAqiCategory } from '../lib/aqi';
import { t, type TranslationKey } from '../lib/i18n';
import {
  formatAqiSourceLabel,
  formatAqiTimestampIst,
  formatPlanAsText,
} from '../lib/planExport';
import type { IndoorHack, LanguageCode, PlanResponse, RoutineItem } from '../types';

interface DashboardProps {
  plan: PlanResponse | null;
  language: LanguageCode;
  announcement: string;
  isLoading: boolean;
}

const SLOT_LABEL_MAP: Record<RoutineItem['timeSlot'], TranslationKey> = {
  morning: 'slotMorning',
  midday: 'slotMidday',
  evening: 'slotEvening',
  night: 'slotNight',
};

const COST_LABEL_MAP: Record<IndoorHack['costLevel'], TranslationKey> = {
  free: 'costFree',
  low: 'costLow',
  medium: 'costMedium',
  high: 'costHigh',
};

const COST_STYLE_MAP: Record<IndoorHack['costLevel'], string> = {
  free: 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800',
  low: 'text-teal-800 bg-teal-50 border-teal-200 dark:text-teal-200 dark:bg-teal-950/60 dark:border-teal-800',
  medium:
    'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/60 dark:border-amber-800',
  high: 'text-slate-800 bg-slate-100 border-slate-300 dark:text-slate-200 dark:bg-slate-800 dark:border-slate-700',
};

const LOADING_STAGE_KEYS: readonly TranslationKey[] = [
  'loadingStageAqi',
  'loadingStageGemini',
  'loadingStageSafety',
];

export function PlanLoadingStatus({ language }: { language: LanguageCode }) {
  const reducedMotion = useReducedMotion();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    setStageIndex(0);
    if (reducedMotion) {
      return;
    }
    const interval = globalThis.setInterval(() => {
      setStageIndex((prev) => (prev < LOADING_STAGE_KEYS.length - 1 ? prev + 1 : prev));
    }, 1100);
    return () => {
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

/**
 * Results Dashboard rendering the complete personalized clean-air plan:
 * honest multi-stage loading skeleton, focusable heading, Gemini/fallback badge,
 * live Open-Meteo or Demo AQI card, Health Advisory, Routine timeline,
 * budget-ranked Indoor Hacks, Sustainable Alternatives (CO2 only when applicable),
 * Mask Guidance, and robust Print / Download (.txt) / Copy actions.
 */
export function Dashboard({ plan, language, announcement, isLoading }: DashboardProps) {
  const activeCategoryKey = plan ? getAqiCategory(plan.aqi.aqi).key : null;
  const [actionMessage, setActionMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    try {
      if (typeof window.print === 'function') {
        window.print();
      } else {
        setActionMessage(t(language, 'printBlockedNotice'));
      }
    } catch {
      setActionMessage(t(language, 'printBlockedNotice'));
    }
  };

  const handleDownloadTxt = () => {
    if (!plan) return;
    const text = formatPlanAsText(plan, language);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const slug =
      plan.aqi.city
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'city';
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `saans-plan-${slug}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setActionMessage(t(language, 'downloadedConfirmation'));
  };

  const handleCopyPlan = async () => {
    if (!plan) return;
    const text = formatPlanAsText(plan, language);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopied(true);
      setActionMessage(t(language, 'copiedConfirmation'));
      globalThis.setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionMessage(t(language, 'printBlockedNotice'));
    }
  };

  const isGemini = plan?.generatedBy === 'gemini';
  const liveTimeIst = plan ? formatAqiTimestampIst(plan.aqi.updatedAt) : '';

  return (
    <section
      id="dashboard"
      aria-labelledby="dashboard-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      {/* Screen-reader polite live regions */}
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
              {plan && !isLoading ? (
                <span
                  data-testid="plan-generator-badge"
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                    isGemini
                      ? 'border-teal-300 bg-teal-50 text-teal-900 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-200'
                      : 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {isGemini
                    ? t(language, 'generatedByGemini')
                    : t(language, 'generatedByRules')}
                </span>
              ) : null}
            </div>
            {plan && !isLoading ? (
              <p className="text-base text-slate-700 dark:text-slate-200 max-w-3xl leading-relaxed">
                {plan.summary}
              </p>
            ) : null}
          </div>

          {plan && !isLoading ? (
            <div className="no-print flex flex-col items-start sm:items-end gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] hover:border-teal-600/60 dark:hover:border-teal-400/60 text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Printer className="w-4 h-4" aria-hidden="true" />
                  <span>{t(language, 'printPlanButton')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadTxt}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] hover:border-teal-600/60 dark:hover:border-teal-400/60 text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>{t(language, 'downloadPlanButton')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleCopyPlan()}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] hover:border-teal-600/60 dark:hover:border-teal-400/60 text-sm font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copied ? (
                    <Check
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{t(language, 'copyPlanButton')}</span>
                </button>
              </div>
              <p
                role="status"
                aria-live="polite"
                className="text-xs font-medium text-teal-800 dark:text-teal-300 min-h-[1rem]"
              >
                {actionMessage}
              </p>
            </div>
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
            {/* Top row: AQI Card + Health Advisory + Mask Guidance */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* 3a. AQI Card */}
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

                {/* CPCB 6-tier visual scale bar */}
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

              {/* Right stack: 3b. Health Advisory + 3f. Mask Guidance */}
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
                    <AqiCategoryBadge
                      aqi={plan.aqi.aqi}
                      language={language}
                      size="sm"
                    />
                  </div>
                  <p className="mt-3 text-base text-slate-800 dark:text-slate-100 leading-relaxed">
                    {plan.maskGuidance}
                  </p>
                </article>
              </div>
            </div>

            {/* 3c. Today's low-emission routine */}
            <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
              <div className="flex items-center gap-2.5">
                <Clock
                  className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
                  aria-hidden="true"
                />
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {t(language, 'routineHeading')}
                </h3>
              </div>

              <div id="routine-timeline" className="relative mt-6 pl-7 sm:pl-9">
                <div
                  aria-hidden="true"
                  className="no-print absolute left-2.5 sm:left-3 top-2 bottom-2 w-0.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
                >
                  <div className="saans-timeline-line-fill w-full h-full bg-teal-600 dark:bg-teal-400" />
                </div>

                <ol data-reveal-group className="space-y-5">
                  {plan.routine.map((item) => (
                    <li
                      key={item.timeSlot}
                      data-reveal
                      className="relative saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5"
                    >
                      <span
                        aria-hidden="true"
                        className="no-print absolute -left-[25px] sm:-left-[31px] top-6 w-3.5 h-3.5 rounded-full bg-teal-600 dark:bg-teal-400 ring-4 ring-white dark:ring-[#131C2E]"
                      />

                      <span
                        className="text-sm font-semibold text-teal-800 dark:text-teal-300"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      >
                        {t(language, SLOT_LABEL_MAP[item.timeSlot])}
                      </span>
                      <h4 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                        {item.detail}
                      </p>
                      <p className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
                        <span className="font-semibold text-teal-800 dark:text-teal-300">
                          {t(language, 'impactLabel')}:
                        </span>{' '}
                        {item.impactNote}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </article>

            {/* 3d. Indoor air quality hacks */}
            <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Sparkles
                    className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                    {t(language, 'indoorHacksHeading')}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t(language, 'indoorHacksSubtitle')}
                </p>
              </div>

              <div
                data-reveal-group
                className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {plan.indoorHacks.map((hack) => (
                  <div
                    key={hack.title}
                    data-reveal
                    className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                          {hack.title}
                        </h4>
                        <span
                          className={`shrink-0 text-xs sm:text-[13px] font-semibold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${COST_STYLE_MAP[hack.costLevel]}`}
                        >
                          {t(language, COST_LABEL_MAP[hack.costLevel])}
                        </span>
                      </div>
                      <p className="mt-2.5 text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                        {hack.howTo}
                      </p>
                    </div>
                    <p className="pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
                      <span className="font-semibold text-teal-800 dark:text-teal-300">
                        {t(language, 'estimatedBenefitLabel')}:
                      </span>{' '}
                      {hack.estimatedBenefit}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            {/* 3e. Sustainable alternatives */}
            <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
              <div>
                <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {t(language, 'alternativesHeading')}
                </h3>
                <p className="mt-1 text-base text-slate-600 dark:text-slate-300">
                  {t(language, 'alternativesSubtitle')}
                </p>
              </div>

              <div
                data-reveal-group
                className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5"
              >
                {plan.alternatives.map((alt) => (
                  <div
                    key={alt.swap}
                    data-reveal
                    className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          {t(language, 'currentHabitLabel')}
                        </span>
                        <p className="mt-0.5 text-base text-slate-800 dark:text-slate-200">
                          {alt.current}
                        </p>
                      </div>

                      <div className="flex items-start gap-2 text-teal-800 dark:text-teal-300">
                        <ArrowRight
                          className="w-4 h-4 mt-1 shrink-0"
                          aria-hidden="true"
                        />
                        <div>
                          <span className="text-sm font-medium text-teal-800 dark:text-teal-300">
                            {t(language, 'betterSwapLabel')}
                          </span>
                          <h4 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                            {alt.swap}
                          </h4>
                        </div>
                      </div>

                      <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                        {alt.why}
                      </p>
                    </div>

                    <dl className="pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-slate-600 dark:text-slate-300">
                          {t(language, 'pm25DropLabel')}
                        </dt>
                        <dd
                          className="mt-0.5 text-base font-semibold text-teal-800 dark:text-teal-300 tabular-nums"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          ~{alt.pm25ReductionPct}%
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-600 dark:text-slate-300">
                          {t(language, 'co2SavedLabel')}
                        </dt>
                        <dd
                          className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {alt.co2SavedKgPerMonth > 0
                            ? `~${alt.co2SavedKgPerMonth} kg`
                            : `— (${t(language, 'co2Pm25Only')})`}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      </div>
    </section>
  );
}
