import { Moon, Sparkles, Sun, Wind } from 'lucide-react';
import type { NavSectionId } from '../hooks/useScrollSpy';
import { t, type TranslationKey } from '../lib/i18n';
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

type HeaderControlProps = Pick<
  HeaderProps,
  | 'language'
  | 'onToggleLanguage'
  | 'theme'
  | 'onToggleTheme'
  | 'reducedMotion'
  | 'onToggleReducedMotion'
>;

const NAV_ITEMS: {
  id: NavSectionId;
  labelKey: TranslationKey;
  requiresPlan?: boolean;
}[] = [
  { id: 'how-it-works', labelKey: 'navHowItWorks' },
  { id: 'profile', labelKey: 'navProfile' },
  { id: 'dashboard', labelKey: 'navPlan', requiresPlan: true },
  { id: 'simulator', labelKey: 'navSimulator' },
  { id: 'chat', labelKey: 'navChat' },
];

function HeaderNav({
  language,
  hasPlan,
  activeSection,
}: {
  language: LanguageCode;
  hasPlan: boolean;
  activeSection: NavSectionId | null;
}) {
  return (
    <nav
      aria-label="Primary"
      className="hidden lg:flex items-center gap-3.5 xl:gap-4 text-[13px] xl:text-sm font-medium shrink-0"
    >
      {NAV_ITEMS.filter((item) => !item.requiresPlan || hasPlan).map((item) => {
        const active = activeSection === item.id;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active ? 'true' : undefined}
            className={`transition-colors whitespace-nowrap shrink-0 min-h-[44px] inline-flex items-center border-b-2 ${
              active
                ? 'border-teal-600 dark:border-teal-400 text-teal-800 dark:text-teal-300 font-semibold'
                : 'border-transparent text-slate-700 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-300'
            }`}
          >
            {t(language, item.labelKey)}
          </a>
        );
      })}
    </nav>
  );
}

function ReduceMotionButton({
  language,
  reducedMotion,
  onToggle,
}: {
  language: LanguageCode;
  reducedMotion: boolean;
  onToggle: () => void;
}) {
  const label = t(language, reducedMotion ? 'reduceMotionOn' : 'reduceMotionOff');
  const tone = reducedMotion
    ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-200'
    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-600/60';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={reducedMotion}
      aria-label={label}
      title={label}
      className={`min-w-[44px] min-h-[44px] px-2.5 rounded-lg border inline-flex items-center justify-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${tone}`}
    >
      <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="hidden xl:inline leading-none">{label}</span>
    </button>
  );
}

function HeaderControls(props: HeaderControlProps) {
  const {
    language,
    onToggleLanguage,
    theme,
    onToggleTheme,
    reducedMotion,
    onToggleReducedMotion,
  } = props;
  const themeLabel = t(language, theme === 'dark' ? 'switchToLight' : 'switchToDark');
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onToggleLanguage}
        aria-label={t(language, 'switchLanguageLabel')}
        className="min-w-[44px] min-h-[44px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-teal-600/60 dark:hover:border-teal-400/60 transition-colors whitespace-nowrap cursor-pointer"
      >
        {language === 'en' ? 'हिन्दी' : 'EN'}
      </button>
      <ReduceMotionButton
        language={language}
        reducedMotion={reducedMotion}
        onToggle={onToggleReducedMotion}
      />
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={themeLabel}
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
  );
}

export function Header(props: HeaderProps) {
  return (
    <header className="saans-theme-surface sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-slate-50/98 dark:bg-[#0B1220]/98">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:rounded-lg focus:bg-teal-700 focus:text-white focus:font-semibold focus:shadow-lg"
      >
        {t(props.language, 'skipToMain')}
      </a>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 xl:gap-4">
        <a
          href="#hero"
          className="font-display inline-flex items-center gap-2 text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0 min-h-[44px]"
        >
          <Wind
            className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <span>{t(props.language, 'brandName')}</span>
        </a>
        <HeaderNav
          language={props.language}
          hasPlan={props.hasPlan}
          activeSection={props.activeSection}
        />
        <HeaderControls {...props} />
      </div>
    </header>
  );
}
