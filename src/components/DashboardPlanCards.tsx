import {
  ArrowRight,
  Check,
  Clock,
  Copy,
  Download,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { t, type TranslationKey } from '../lib/i18n';
import { formatPlanAsText } from '../lib/planExport';
import type {
  Alternative,
  IndoorHack,
  LanguageCode,
  PlanResponse,
  RoutineItem,
} from '../types';

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

export function RoutineTimelineCard({
  routine,
  language,
}: {
  routine: readonly RoutineItem[];
  language: LanguageCode;
}) {
  return (
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
          {routine.map((item) => (
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
  );
}

export function IndoorHacksCard({
  hacks,
  language,
}: {
  hacks: readonly IndoorHack[];
  language: LanguageCode;
}) {
  return (
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
        className="print-two-col mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {hacks.map((hack) => (
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
  );
}

export function AlternativesCard({
  alternatives,
  language,
}: {
  alternatives: readonly Alternative[];
  language: LanguageCode;
}) {
  return (
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
        className="print-two-col mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {alternatives.map((alt) => (
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
                <ArrowRight className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" />
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
  );
}

export function DashboardExportActions({
  plan,
  language,
}: {
  plan: PlanResponse;
  language: LanguageCode;
}) {
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
    const blob = new Blob([formatPlanAsText(plan, language)], {
      type: 'text/plain;charset=utf-8',
    });
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
    const text = formatPlanAsText(plan, language);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
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

  return (
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
  );
}

export function AiBusyRetryNotice({
  plan,
  language,
  isLoading,
  onRetryGemini,
}: {
  plan: PlanResponse;
  language: LanguageCode;
  isLoading: boolean;
  onRetryGemini?: () => void;
}) {
  const show =
    plan.generatedBy === 'rules' &&
    (plan.fallbackReason === 'ai_busy' || plan.fallbackReason === 'ai_error');
  const initialSeconds = Math.max(0, Math.round(plan.retryAfterSeconds ?? 15));
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    setRemaining(Math.max(0, Math.round(plan.retryAfterSeconds ?? 15)));
  }, [plan]);

  useEffect(() => {
    if (!show || remaining <= 0) return;
    const timer = globalThis.setInterval(() => {
      setRemaining((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [show, remaining]);

  if (!show) return null;

  const message =
    remaining > 0
      ? t(language, 'aiBusyNotice').replace('{seconds}', String(remaining))
      : t(language, 'aiBusyReadyNotice');

  return (
    <div
      data-testid="ai-busy-notice"
      className="no-print mt-2.5 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
    >
      <p
        role="status"
        aria-live="polite"
        className="text-xs sm:text-sm font-medium text-amber-950 dark:text-amber-100 leading-snug"
      >
        {message}
      </p>
      {onRetryGemini ? (
        <button
          type="button"
          onClick={onRetryGemini}
          disabled={remaining > 0 || isLoading}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 bg-white dark:bg-[#0B1220] text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100 hover:border-teal-600 dark:hover:border-teal-400 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {isLoading
              ? t(language, 'retryGeminiLoading')
              : t(language, 'retryGeminiButton')}
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function OfflineSampleNotice({
  plan,
  language,
  isLoading,
  onRetryGemini,
}: {
  plan: PlanResponse;
  language: LanguageCode;
  isLoading: boolean;
  onRetryGemini?: () => void;
}) {
  if (!plan.isOfflineSample) return null;

  return (
    <div
      data-testid="offline-sample-notice"
      className="no-print mt-2.5 rounded-xl border border-amber-300 dark:border-amber-700/70 bg-amber-50/90 dark:bg-amber-950/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
    >
      <p
        role="status"
        aria-live="polite"
        className="text-xs sm:text-sm font-medium text-amber-950 dark:text-amber-100 leading-snug"
      >
        {t(language, 'offlineSampleNotice')}
      </p>
      {onRetryGemini ? (
        <button
          type="button"
          onClick={onRetryGemini}
          disabled={isLoading}
          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-400 dark:border-amber-600 bg-white dark:bg-[#0B1220] text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100 hover:border-teal-600 dark:hover:border-teal-400 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {isLoading
              ? t(language, 'retryGeminiLoading')
              : t(language, 'offlineSampleRetryButton')}
          </span>
        </button>
      ) : null}
    </div>
  );
}
