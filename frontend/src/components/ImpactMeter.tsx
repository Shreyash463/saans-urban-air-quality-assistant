import { memo } from 'react';
import { t } from '../lib/i18n';
import type { ProfileImpactResult } from '../lib/impact';
import { SIMULATOR_COUNTUP_DURATION_MS } from '../lib/motion';
import type { LanguageCode } from '../types';
import { CountUp } from './CountUp';

interface ExposureRowProps {
  label: string;
  valuePct: number;
  barClass: string;
  labelClass: string;
  valueClass: string;
  testId: string;
}

function ExposureProgressRow({
  label,
  valuePct,
  barClass,
  labelClass,
  valueClass,
  testId,
}: ExposureRowProps) {
  const scale = Math.min(1, Math.max(0.02, valuePct / 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className={labelClass}>{label}</span>
        <span
          className={`font-mono font-semibold tabular-nums ${valueClass}`}
          data-testid={testId}
        >
          <CountUp
            value={valuePct}
            durationMs={SIMULATOR_COUNTUP_DURATION_MS}
            suffix="%"
          />
        </span>
      </div>
      <div
        className="mt-2 h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuenow={valuePct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full w-full rounded-full origin-left transition-transform duration-500 ease-out ${barClass}`}
          style={{ transform: `scaleX(${scale.toFixed(4)})` }}
        />
      </div>
    </div>
  );
}

function MetricStatRow({
  label,
  value,
  prefix = '',
  suffix = '',
  valueClass = 'text-slate-900 dark:text-slate-50',
  testId,
  trailing,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  valueClass?: string;
  testId: string;
  trailing?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </dt>
      <dd
        className={`font-mono text-2xl font-semibold tabular-nums ${valueClass}`}
        data-testid={testId}
      >
        <CountUp
          value={value}
          durationMs={SIMULATOR_COUNTUP_DURATION_MS}
          prefix={prefix}
          suffix={suffix}
        />
        {trailing ? (
          <span className="text-sm font-normal text-slate-600 dark:text-slate-300">
            {' '}
            {trailing}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function ImpactSummaryMetrics({
  impact,
  language,
}: {
  impact: ProfileImpactResult;
  language: LanguageCode;
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
      <MetricStatRow
        label={t(language, 'meterPm25Label')}
        value={impact.additionalExposureCutPct}
        prefix="-"
        suffix="%"
        valueClass="text-teal-700 dark:text-teal-300"
        testId="impact-pm25-value"
      />
      <MetricStatRow
        label={t(language, 'meterCo2Label')}
        value={impact.co2SavedKgPerMonth}
        suffix=" kg"
        testId="impact-co2-value"
      />
      <MetricStatRow
        label={t(language, 'meterScoreLabel')}
        value={impact.airFriendlyScore}
        trailing={t(language, 'meterOutOf100')}
        testId="impact-score-value"
      />
    </dl>
  );
}

function ActiveChoicesList({
  selectedActions,
  language,
}: {
  selectedActions: ProfileImpactResult['selectedActions'];
  language: LanguageCode;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(language, 'meterActiveChoicesHeading')}
      </h3>
      {selectedActions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {t(language, 'meterEmptyChoices')}
        </p>
      ) : (
        <ul className="mt-3 space-y-3" data-testid="impact-active-list">
          {selectedActions.map(({ factor }) => (
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
  );
}

export const ImpactMeter = memo(function ImpactMeter({
  impact,
  language,
}: {
  impact: ProfileImpactResult;
  language: LanguageCode;
}) {
  return (
    <div
      className="saans-theme-surface rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7 flex flex-col gap-6"
      aria-live="polite"
      aria-atomic="false"
    >
      <div className="space-y-4">
        <ExposureProgressRow
          label={t(language, 'exposureTodayLabel')}
          valuePct={impact.beforeExposurePct}
          barClass="bg-slate-500 dark:bg-slate-400"
          labelClass="font-medium text-slate-700 dark:text-slate-200"
          valueClass="text-slate-800 dark:text-slate-100"
          testId="impact-before-exposure"
        />
        <ExposureProgressRow
          label={t(language, 'exposureAfterLabel')}
          valuePct={impact.afterExposurePct}
          barClass="bg-teal-600 dark:bg-teal-400"
          labelClass="font-semibold text-teal-800 dark:text-teal-300"
          valueClass="text-teal-800 dark:text-teal-300"
          testId="impact-after-exposure"
        />
      </div>
      <hr className="border-slate-200 dark:border-slate-800" />
      <ImpactSummaryMetrics impact={impact} language={language} />
      <p className="-mt-3 text-sm text-slate-600 dark:text-slate-300">
        {t(language, 'scoreFormulaNote')}
      </p>
      <hr className="border-slate-200 dark:border-slate-800" />
      <ActiveChoicesList selectedActions={impact.selectedActions} language={language} />
    </div>
  );
});
