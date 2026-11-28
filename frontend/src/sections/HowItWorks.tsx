import { t, type TranslationKey } from '../lib/i18n';
import type { LanguageCode } from '../types';

const STEPS: { titleKey: TranslationKey; descKey: TranslationKey; num: string }[] = [
  { num: '01', titleKey: 'step1Title', descKey: 'step1Desc' },
  { num: '02', titleKey: 'step2Title', descKey: 'step2Desc' },
  { num: '03', titleKey: 'step3Title', descKey: 'step3Desc' },
];

export function HowItWorks({ language }: { language: LanguageCode }) {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="saans-section-anchor py-12 sm:py-16"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <h2
          id="how-it-works-heading"
          className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
        >
          {t(language, 'howItWorksHeading')}
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <article
              key={step.num}
              className="saans-theme-surface saans-card-lift rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 space-y-2.5"
            >
              <span className="font-mono inline-block text-sm font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                {step.num}
              </span>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {t(language, step.titleKey)}
              </h3>
              <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                {t(language, step.descKey)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
