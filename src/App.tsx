import { lazy, Suspense, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { ScrollProgress } from './components/ScrollProgress';
import { useReducedMotionControl } from './hooks/useReducedMotion';
import { useReveal } from './hooks/useReveal';
import { useSaansAppState } from './hooks/useSaansAppState';
import { useScrollProgress } from './hooks/useScrollProgress';
import { useScrollSpy } from './hooks/useScrollSpy';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { loadLanguageBundle, t } from './lib/i18n';
import { Footer } from './sections/Footer';
import { Hero } from './sections/Hero';
import { HowItWorks } from './sections/HowItWorks';
import { ProfileForm } from './sections/ProfileForm';

const Dashboard = lazy(() => import('./sections/Dashboard'));
const Simulator = lazy(() => import('./sections/Simulator'));
const Chat = lazy(() => import('./sections/Chat'));

function DeferredSections({ state }: { state: ReturnType<typeof useSaansAppState> }) {
  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="h-36 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-[#131C2E]/70 animate-pulse" />
        </div>
      }
    >
      <Dashboard
        plan={state.plan}
        language={state.profile.language}
        isLoading={state.isGeneratingPlan}
        errorKind={state.planError}
        onRetryGemini={state.handleRetryGemini}
      />
      <Simulator profile={state.profile} />
      <Chat profile={state.profile} plan={state.plan} />
    </Suspense>
  );
}

function MainSections({
  state,
  reducedMotion,
  onGetStarted,
}: {
  state: ReturnType<typeof useSaansAppState>;
  reducedMotion: boolean;
  onGetStarted: () => void;
}) {
  return (
    <main id="main-content" className="relative z-10 flex-1">
      <Hero
        language={state.profile.language}
        isDark={state.theme === 'dark'}
        reducedMotion={reducedMotion}
        previewReading={state.previewReading}
        aqiLoading={state.aqiLoading}
        aqiError={state.aqiError}
        onRetryAqi={state.reloadHeroAqi}
        onGetStarted={onGetStarted}
      />
      <HowItWorks language={state.profile.language} />
      <ProfileForm
        profile={state.profile}
        onChangeProfile={state.updateProfile}
        onSubmitProfile={state.handleSubmitProfile}
        onClearData={state.handleClearData}
        isSubmitting={state.isGeneratingPlan}
        onPreviewReadingChange={state.setPreviewReading}
        onLocationChange={state.setActiveCoords}
        hasActiveLocation={state.activeCoords !== null}
      />
      <DeferredSections state={state} />
    </main>
  );
}

function useLanguageBundleEffect(language: 'en' | 'hi') {
  const [, setReadyTick] = useState(0);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t(language, 'documentTitle');
    if (language !== 'hi') return;
    let active = true;
    void loadLanguageBundle('hi').then(() => {
      if (active) {
        document.title = t('hi', 'documentTitle');
        setReadyTick((n) => n + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [language]);
}

export default function App() {
  const { reducedMotion, toggleReducedMotion } = useReducedMotionControl();
  const { scrollToElement } = useSmoothScroll(reducedMotion);
  const state = useSaansAppState(scrollToElement);
  const hasPlan = Boolean(state.plan || state.isGeneratingPlan || state.planError);
  const refreshKey = `${state.profile.language}-${hasPlan}`;

  useLanguageBundleEffect(state.profile.language);
  useScrollProgress(reducedMotion);
  useReveal(reducedMotion, refreshKey);
  const activeSection = useScrollSpy(refreshKey);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0B1220] dark:text-slate-100 transition-colors">
      <ScrollProgress />
      <div
        id="saans-smog-backdrop"
        aria-hidden="true"
        className="no-print fixed inset-0 pointer-events-none z-0 opacity-70"
      />
      <Header
        language={state.profile.language}
        onToggleLanguage={state.toggleLanguage}
        theme={state.theme}
        onToggleTheme={state.toggleTheme}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={toggleReducedMotion}
        hasPlan={hasPlan}
        activeSection={activeSection}
      />
      <div className="sr-only" role="status" aria-live="polite">
        {state.statusMessage}
      </div>
      <MainSections
        state={state}
        reducedMotion={reducedMotion}
        onGetStarted={() => scrollToElement('#profile')}
      />
      <Footer
        language={state.profile.language}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={toggleReducedMotion}
      />
    </div>
  );
}
