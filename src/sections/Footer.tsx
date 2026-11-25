import { Sparkles, Wind } from 'lucide-react';
import { t } from '../lib/i18n';
import type { LanguageCode } from '../types';

interface FooterProps {
  language: LanguageCode;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
}

/**
 * Semantic page footer containing about summary, medical disclaimer,
 * browser-local privacy commitment, accessibility statement, Reduce Motion
 * toggle, and CPCB reference link.
 */
export function Footer({
  language,
  reducedMotion,
  onToggleReducedMotion,
}: FooterProps) {
  return (
    <footer className="saans-theme-surface mt-8 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1627]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div
          data-reveal-group
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-sm"
        >
          <div data-reveal>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <Wind
                className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0"
                aria-hidden="true"
              />
              <span>{t(language, 'footerAboutHeading')}</span>
            </h3>
            <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {t(language, 'footerAboutText')}
            </p>
          </div>

          <div data-reveal>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t(language, 'footerMedicalHeading')}
            </h3>
            <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {t(language, 'footerMedicalText')}
            </p>
          </div>

          <div data-reveal>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t(language, 'footerPrivacyHeading')}
            </h3>
            <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {t(language, 'footerPrivacyText')}
            </p>
          </div>

          <div data-reveal>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t(language, 'footerA11yHeading')}
            </h3>
            <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {t(language, 'footerA11yText')}
            </p>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-[13px] sm:text-sm text-slate-700 dark:text-slate-300">
          <p>
            Saans · Urban Air Quality Assistant ·{' '}
            <a
              href="https://cpcb.nic.in/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-teal-700 dark:hover:text-teal-300"
            >
              Indian CPCB National AQI Reference
            </a>
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onToggleReducedMotion}
              aria-pressed={reducedMotion}
              className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] text-slate-800 dark:text-slate-200 hover:border-teal-600/60 inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {reducedMotion
                  ? t(language, 'reduceMotionOn')
                  : t(language, 'reduceMotionOff')}
              </span>
            </button>
            <p>Not medical advice · Approximate environmental estimates</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
