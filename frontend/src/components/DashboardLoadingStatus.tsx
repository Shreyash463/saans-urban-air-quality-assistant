import { useEffect, useState } from 'react';
import { t, type TranslationKey } from '../lib/i18n';
import type { LanguageCode } from '../types';

const LOADING_STAGES: readonly { delayMs: number; key: TranslationKey }[] = [
  { delayMs: 0, key: 'loadingStageAqi' },
  { delayMs: 2200, key: 'loadingStageGemini' },
  { delayMs: 5000, key: 'loadingStageSafety' },
];

function StageStepPill({ label, active }: { label: string; active: boolean }) {
  const tone = active
    ? 'border-teal-600/50 bg-teal-50 text-teal-900 dark:border-teal-400/50 dark:bg-teal-950/60 dark:text-teal-200'
    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300';
  return (
    <li className={`px-3.5 py-2.5 rounded-xl border font-medium ${tone}`}>{label}</li>
  );
}

export function PlanLoadingStatus({ language }: { language: LanguageCode }) {
  const [stageIdx, setStageIdx] = useState(0);
  const [showWakingHint, setShowWakingHint] = useState(false);

  useEffect(() => {
    setStageIdx(0);
    setShowWakingHint(false);
    const timers = LOADING_STAGES.slice(1).map((stage, offset) =>
      globalThis.setTimeout(() => setStageIdx(offset + 1), stage.delayMs)
    );
    const wakeTimer = globalThis.setTimeout(() => setShowWakingHint(true), 6000);
    return () => {
      for (const id of timers) globalThis.clearTimeout(id);
      globalThis.clearTimeout(wakeTimer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="plan-loading-status"
      className="saans-theme-surface mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-8 space-y-5"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="w-5 h-5 rounded-full border-2 border-teal-600 dark:border-teal-400 border-t-transparent animate-spin shrink-0"
        />
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'planLoadingLabel')}
        </p>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        {LOADING_STAGES.map((stage, idx) => (
          <StageStepPill
            key={stage.key}
            label={t(language, stage.key)}
            active={idx <= stageIdx}
          />
        ))}
      </ol>
      {showWakingHint ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t(language, 'loadingWakingServer')}
        </p>
      ) : null}
    </div>
  );
}
