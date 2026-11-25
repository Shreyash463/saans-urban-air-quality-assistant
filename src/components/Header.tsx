import { Moon, Sparkles, Sun, Wind } from 'lucide-react';
import type { NavSectionId } from '../hooks/useScrollSpy';
import { t } from '../lib/i18n';
import type { LanguageCode, ThemeMode } from '../types';

interface HeaderProps {
  language: LanguageCode;
  onToggleLanguage: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  hasPlan: boolean;
  activeSection: NavSectionId | null;
}

/**
 * Sticky top navigation bar with scroll-spy `aria-current="true"` indicators,
 * EN/HI toggle, Light/Dark theme toggle, discoverable Reduce Motion toggle,
 * and a primary CTA linking directly to the profile form.
 */
export function Header({
  language,
  onToggleLanguage,
  theme,
  onToggleTheme,
  reducedMotion,
  onToggleReducedMotion,
  hasPlan,
  activeSection,
}: HeaderProps) {
  const navLinkClass = (id: NavSectionId) =>
    `transition-colors whitespace-nowrap shrink-0 py-2 border-b-2 ${
      activeSection === id
        ? 'border-teal-600 dark:border-teal-400 text-teal-800 dark:text-teal-300 font-semibold'
        : 'border-transparent text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300'
    }`;

  return (
    <header className="saans-theme-surface sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-slate-50/98 dark:bg-[#0B1220]/98">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-teal-700 focus:text-white focus:font-semibold focus:shadow-lg"
      >
        {t(language, 'skipToMain')}
      </a>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-6">
        {/* Zone 1: Brand wordmark */}
        <a
          href="#hero"
          className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 min-h-[44px]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <Wind
            className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <span>{t(language, 'brandName')}</span>
        </a>

        {/* Zone 2: Scroll-spy single-line navigation */}
        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-5 text-sm font-medium"
        >
          <a
            href="#how-it-works"
            aria-current={activeSection === 'how-it-works' ? 'true' : undefined}
            className={navLinkClass('how-it-works')}
          >
            {t(language, 'navHowItWorks')}
          </a>
          <a
            href="#profile"
            aria-current={activeSection === 'profile' ? 'true' : undefined}
            className={navLinkClass('profile')}
          >
            {t(language, 'navProfile')}
          </a>
          {hasPlan ? (
            <a
              href="#dashboard"
              aria-current={activeSection === 'dashboard' ? 'true' : undefined}
              className={navLinkClass('dashboard')}
            >
              {t(language, 'navPlan')}
            </a>
          ) : null}
          <a
            href="#simulator"
            aria-current={activeSection === 'simulator' ? 'true' : undefined}
            className={navLinkClass('simulator')}
          >
            {t(language, 'navSimulator')}
          </a>
          <a
            href="#chat"
            aria-current={activeSection === 'chat' ? 'true' : undefined}
            className={navLinkClass('chat')}
          >
            {t(language, 'navChat')}
          </a>
        </nav>

        {/* Zone 3: Language, Reduce Motion, Theme, Primary CTA */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleLanguage}
            aria-label={t(language, 'switchLanguageLabel')}
            className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-teal-600/60 dark:hover:border-teal-400/60 transition-colors whitespace-nowrap cursor-pointer"
          >
            {language === 'en' ? 'हिन्दी' : 'EN'}
          </button>

          <button
            type="button"
            onClick={onToggleReducedMotion}
            aria-pressed={reducedMotion}
            aria-label={t(language, 'reduceMotionLabel')}
            title={
              reducedMotion
                ? t(language, 'reduceMotionOn')
                : t(language, 'reduceMotionOff')
            }
            className={`min-w-[44px] min-h-[44px] px-2.5 rounded-lg border inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              reducedMotion
                ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-200'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-600/60'
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden xl:inline">
              {reducedMotion
                ? t(language, 'reduceMotionOn')
                : t(language, 'reduceMotionOff')}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark'
                ? t(language, 'switchToLight')
                : t(language, 'switchToDark')
            }
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-600/60 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>

          <a
            href="#profile"
            className="hidden sm:inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 text-sm font-semibold active:scale-[0.98] transition-transform whitespace-nowrap shrink-0"
          >
            {t(language, 'navGetPlan')}
          </a>
        </div>
      </div>
    </header>
  );
}
