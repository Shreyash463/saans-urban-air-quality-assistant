import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import type { LanguageCode, PlanResponse } from '../types';
import { Button } from './ui/Button';

function useCountdownSeconds(
  active: boolean,
  retryAfterSeconds?: number | null
): number {
  const [secondsLeft, setSecondsLeft] = useState(
    Math.max(0, Math.round(retryAfterSeconds ?? 0))
  );

  useEffect(() => {
    setSecondsLeft(Math.max(0, Math.round(retryAfterSeconds ?? 0)));
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (!active || secondsLeft <= 0) return;
    const timer = globalThis.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => globalThis.clearInterval(timer);
  }, [active, secondsLeft]);

  return secondsLeft;
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
    Boolean(plan.fallbackReason) &&
    plan.fallbackReason !== 'no_key';
  const secondsLeft = useCountdownSeconds(show, plan.retryAfterSeconds);
  if (!show) return null;

  const message =
    secondsLeft > 0
      ? t(language, 'aiBusyNotice').replace('{seconds}', String(secondsLeft))
      : t(language, 'aiBusyReadyNotice');

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="ai-busy-notice"
      className="no-print mt-4 rounded-xl border border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/35 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
        {message}
      </p>
      {onRetryGemini ? (
        <Button
          type="button"
          onClick={onRetryGemini}
          disabled={isLoading || secondsLeft > 0}
          className="min-h-[40px] px-3.5 py-2 border-amber-400 dark:border-amber-600 bg-white dark:bg-[#0B1220] text-amber-950 dark:text-amber-100"
        >
          <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            {t(language, isLoading ? 'retryGeminiLoading' : 'retryGeminiButton')}
          </span>
        </Button>
      ) : null}
    </div>
  );
}

export function PlanErrorState({
  language,
  errorKind,
  isLoading,
  onRetry,
}: {
  language: LanguageCode;
  errorKind: 'network' | 'rate_limit';
  isLoading: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="plan-error-state"
      className="saans-theme-surface mt-8 rounded-2xl border border-red-300 dark:border-red-800/70 bg-red-50/80 dark:bg-red-950/30 p-6 sm:p-8 space-y-3"
    >
      <h3 className="text-lg font-semibold text-red-950 dark:text-red-100">
        {t(language, 'planErrorHeading')}
      </h3>
      <p className="text-base text-red-900 dark:text-red-200 max-w-2xl leading-relaxed">
        {t(
          language,
          errorKind === 'rate_limit' ? 'planRateLimitBody' : 'planErrorBody'
        )}
      </p>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {t(language, 'loadingWakingServer')}
      </p>
      {onRetry ? (
        <Button
          type="button"
          onClick={onRetry}
          disabled={isLoading}
          className="px-4 py-2 border-red-400 dark:border-red-600 bg-white dark:bg-[#0B1220] text-red-950 dark:text-red-100"
        >
          <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t(language, 'tryAgainButton')}</span>
        </Button>
      ) : null}
    </div>
  );
}
