import { memo } from 'react';
import { t } from '../lib/i18n';
import type { ProfileImpactResult } from '../lib/impact';
import { SIMULATOR_COUNTUP_DURATION_MS } from '../lib/motion';
import type { LanguageCode } from '../types';
import { CountUp } from './CountUp';

interface ImpactMeterProps {
  impact: ProfileImpactResult;
  language: LanguageCode;
}

/**
 * Live Impact Meter showing a clear BEFORE -> AFTER exposure comparison
 * (animated strictly via `transform: scaleX` from left), consistent Air-Friendly
 * Score (`round(100 - afterExposurePct)`), CO2 savings strictly from emission
 * actions, and per-choice plain-language explanations.
 */
export const ImpactMeter = memo(function ImpactMeter({
  impact,
  language,
}: ImpactMeterProps) {
  const beforeScale = Math.min(1, Math.max(0.02, impact.beforeExposurePct / 100));
  const afterScale = Math.min(1, Math.max(0.02, impact.afterExposurePct / 100));

  return (
    <div
      className="saans-theme-surface rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7 flex flex-col gap-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {/* BEFORE -> AFTER Exposure comparison bars (transform: scaleX only) */}
      <div className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {t(language, 'exposureTodayLabel')}
            </span>
            <span
              className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums"
              style={{ fontFamily: 'var(--font-mono)' }}
              data-testid="impact-before-exposure"
            >
              <CountUp
                value={impact.beforeExposurePct}
                durationMs={SIMULATOR_COUNTUP_DURATION_MS}
                suffix="%"
              />
            </span>
          </div>
          <div
            className="mt-2 h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-label={t(language, 'exposureTodayLabel')}
            aria-valuenow={impact.beforeExposurePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full w-full rounded-full bg-slate-500 dark:bg-slate-400 origin-left transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${beforeScale.toFixed(4)})` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-teal-800 dark:text-teal-300">
              {t(language, 'exposureAfterLabel')}
            </span>
            <span
              className="font-semibold text-teal-800 dark:text-teal-300 tabular-nums"
              style={{ fontFamily: 'var(--font-mono)' }}
              data-testid="impact-after-exposure"
            >
              <CountUp
                value={impact.afterExposurePct}
                durationMs={SIMULATOR_COUNTUP_DURATION_MS}
                suffix="%"
              />
            </span>
          </div>
          <div
            className="mt-2 h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-label={t(language, 'exposureAfterLabel')}
            aria-valuenow={impact.afterExposurePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full w-full rounded-full bg-teal-600 dark:bg-teal-400 origin-left transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${afterScale.toFixed(4)})` }}
            />
          </div>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* 3 consistent summary metrics */}
      <dl className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t(language, 'meterPm25Label')}
          </dt>
          <dd
            className="text-2xl font-semibold text-teal-700 dark:text-teal-300 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
            data-testid="impact-pm25-value"
          >
            <CountUp
              value={impact.additionalExposureCutPct}
              durationMs={SIMULATOR_COUNTUP_DURATION_MS}
              prefix="-"
              suffix="%"
            />
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t(language, 'meterCo2Label')}
          </dt>
          <dd
            className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
            data-testid="impact-co2-value"
          >
            <CountUp
              value={impact.co2SavedKgPerMonth}
              durationMs={SIMULATOR_COUNTUP_DURATION_MS}
              suffix=" kg"
            />
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t(language, 'meterScoreLabel')}
          </dt>
          <dd
            className="text-2xl font-semibold text-slate-900 dark:text-slate-50 tabular-nums"
            style={{ fontFamily: 'var(--font-mono)' }}
            data-testid="impact-score-value"
          >
            <CountUp
              value={impact.airFriendlyScore}
              durationMs={SIMULATOR_COUNTUP_DURATION_MS}
            />
            <span className="text-sm font-normal text-slate-600 dark:text-slate-300">
              {' '}
              {t(language, 'meterOutOf100')}
            </span>
          </dd>
        </div>
      </dl>

      <p className="-mt-3 text-sm text-slate-600 dark:text-slate-300">
        {t(language, 'scoreFormulaNote')}
      </p>

      <hr className="border-slate-200 dark:border-slate-800" />

      {/* Active choice plain-language explanations */}
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'meterActiveChoicesHeading')}
        </h3>
        {impact.selectedActions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t(language, 'meterEmptyChoices')}
          </p>
        ) : (
          <ul className="mt-3 space-y-3" data-testid="impact-active-list">
            {impact.selectedActions.map(({ factor }) => (
              <li
                key={factor.id}
                className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed pb-3 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0 last:pb-0"
              >
                <span className="font-semibold text-slate-900 dark:text-slate-50">
                  {factor.label[language]}:
                </span>{' '}
                {factor.impactSentence[language]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});
