import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { NoticeBanner } from './components/NoticeBanner';
import { ScrollProgress } from './components/ScrollProgress';
import { useLocalPrefs } from './hooks/useLocalPrefs';
import { useReducedMotionControl } from './hooks/useReducedMotion';
import { useReveal } from './hooks/useReveal';
import { useScrollProgress } from './hooks/useScrollProgress';
import { useScrollSpy } from './hooks/useScrollSpy';
import { useSmoothScroll } from './hooks/useSmoothScroll';
import { useTheme } from './hooks/useTheme';
import { loadLanguageBundle, t } from './lib/i18n';
import { PLAN_SKELETON_DELAY_MS } from './lib/motion';
import { Footer } from './sections/Footer';
import { Hero } from './sections/Hero';
import { ProfileForm } from './sections/ProfileForm';
import {
  ApiRequestError,
  generatePlan,
  getAirQuality,
  getAirQualityByCoords,
} from './services/api';
import type {
  AirQualityReading,
  Coordinates,
  PlanResponse,
  UserProfile,
} from './types';

const loadDashboard = () => import('./sections/Dashboard');
const loadSimulator = () => import('./sections/Simulator');
const loadChat = () => import('./sections/Chat');

const Dashboard = lazy(loadDashboard);
const Simulator = lazy(loadSimulator);
const Chat = lazy(loadChat);

function SectionFallback() {
  return (
    <div
      className="max-w-6xl mx-auto px-4 sm:px-6 py-12 min-h-[560px]"
      role="status"
      aria-live="polite"
    >
      <div className="saans-skeleton h-80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#131C2E]/80" />
    </div>
  );
}

/**
 * Root application component for Saans — Urban Air Quality Assistant.
 */
export default function App() {
  const { profile, updateProfile, clearPrefs } = useLocalPrefs();
  const { theme, toggleTheme } = useTheme();
  const { reducedMotion, toggleReducedMotion } = useReducedMotionControl();

  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [planAnnouncement, setPlanAnnouncement] = useState('');
  const [planError, setPlanError] = useState<'network' | 'rate_limit' | null>(null);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<Coordinates | null>(null);
  const [, setLangRevision] = useState(0);
  const [previewReading, setPreviewReading] = useState<AirQualityReading | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const loadPreviewReading = useCallback(
    async (city: string, coords?: Coordinates | null) => {
      setPreviewError(false);
      try {
        const reading = coords
          ? await getAirQualityByCoords(coords.lat, coords.lon)
          : await getAirQuality(city);
        setPreviewReading(reading);
      } catch {
        setPreviewError(true);
      }
    },
    []
  );

  const didInitPreviewRef = useRef(false);

  useEffect(() => {
    if (didInitPreviewRef.current) return;
    didInitPreviewRef.current = true;
    void loadPreviewReading(profile.city, locationCoords);
  }, [loadPreviewReading, locationCoords, profile.city]);

  useEffect(() => {
    if (profile.language === 'hi') {
      void loadLanguageBundle('hi').then(() => {
        setLangRevision((n) => n + 1);
      });
    }
  }, [profile.language]);

  useScrollProgress(reducedMotion);
  const { scrollToElement } = useSmoothScroll(reducedMotion);
  const refreshKey = `${plan ? plan.aqi.city : 'empty'}-${profile.language}`;
  useReveal(reducedMotion, refreshKey);
  const activeSection = useScrollSpy(refreshKey);

  useEffect(() => {
    document.documentElement.lang = profile.language;
  }, [profile.language]);

  useEffect(() => {
    const prefetch = () => {
      void loadDashboard();
      void loadSimulator();
      void loadChat();
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => {
        w.cancelIdleCallback?.(id);
      };
    }
    const timer = globalThis.setTimeout(prefetch, 250);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, []);

  const handleToggleLanguage = useCallback(() => {
    const nextLanguage = profile.language === 'en' ? 'hi' : 'en';
    const nextProfile: UserProfile = { ...profile, language: nextLanguage };
    const switchAndLocalize = async () => {
      if (nextLanguage === 'hi') {
        await loadLanguageBundle('hi');
        setLangRevision((n) => n + 1);
      }
      updateProfile(nextProfile);

      if (plan) {
        try {
          const localizedPlan = await generatePlan(nextProfile, locationCoords);
          setPlan(localizedPlan);
          setPlanError(null);
          setPreviewReading(localizedPlan.aqi);
        } catch (err) {
          setPlanError(
            err instanceof ApiRequestError && err.kind === 'rate_limit'
              ? 'rate_limit'
              : 'network'
          );
        }
      }
    };
    void switchAndLocalize();
  }, [locationCoords, plan, profile, updateProfile]);

  const handleSubmitProfile = useCallback(
    async (submittedProfile: UserProfile) => {
      setIsGenerating(true);
      setPlanAnnouncement('');
      setPlanError(null);
      setInfoNotice(null);
      updateProfile(submittedProfile);

      scrollToElement('#dashboard');

      try {
        const delayMs = reducedMotion ? 0 : PLAN_SKELETON_DELAY_MS;
        const [result] = await Promise.all([
          generatePlan(submittedProfile, locationCoords),
          delayMs > 0
            ? new Promise<void>((resolve) => {
                globalThis.setTimeout(resolve, delayMs);
              })
            : Promise.resolve(),
        ]);

        setPlan(result);
        setPreviewReading(result.aqi);
        setPreviewError(false);
        setPlanAnnouncement(t(submittedProfile.language, 'planReadyAnnouncement'));

        globalThis.requestAnimationFrame(() => {
          const headingEl = document.getElementById('dashboard-heading');
          headingEl?.focus({ preventScroll: true });
        });
      } catch (err) {
        setPlan(null);
        setPlanError(
          err instanceof ApiRequestError && err.kind === 'rate_limit'
            ? 'rate_limit'
            : 'network'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [locationCoords, reducedMotion, scrollToElement, updateProfile]
  );

  const handleClearData = useCallback(() => {
    clearPrefs();
    setLocationCoords(null);
    setPlan(null);
    setPlanError(null);
    setPlanAnnouncement('');
    void loadPreviewReading('Delhi');
    setInfoNotice(t(profile.language, 'dataClearedNotice'));
  }, [clearPrefs, loadPreviewReading, profile.language]);

  return (
    <div className="saans-atmosphere-shell saans-theme-surface min-h-screen text-slate-900 dark:text-slate-100 flex flex-col">
      <div id="saans-smog-backdrop" className="saans-smog-backdrop" aria-hidden="true">
        <div className="saans-haze-layer-smog" />
        <div className="saans-haze-layer-clear" />
      </div>

      <ScrollProgress />

      <Header
        language={profile.language}
        onToggleLanguage={handleToggleLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={toggleReducedMotion}
        hasPlan={plan !== null}
        activeSection={activeSection}
      />

      <main id="main-content" className="flex-1">
        <Hero
          language={profile.language}
          previewReading={previewReading}
          previewError={previewError}
          onRetryPreview={() => void loadPreviewReading(profile.city, locationCoords)}
          reducedMotion={reducedMotion}
          isDark={theme === 'dark'}
        />

        {infoNotice ? (
          <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pb-4 space-y-2">
            <NoticeBanner
              message={infoNotice}
              onDismiss={() => setInfoNotice(null)}
              tone="info"
            />
          </div>
        ) : null}

        <ProfileForm
          profile={profile}
          onChangeProfile={updateProfile}
          onSubmitProfile={handleSubmitProfile}
          onClearData={handleClearData}
          isSubmitting={isGenerating}
          onPreviewReadingChange={(reading) => {
            setPreviewReading(reading);
            setPreviewError(false);
          }}
          onLocationChange={setLocationCoords}
          hasActiveLocation={locationCoords !== null}
        />

        <Suspense fallback={<SectionFallback />}>
          <Dashboard
            plan={plan}
            language={profile.language}
            announcement={planAnnouncement}
            isLoading={isGenerating}
            planError={planError}
            onRetryGemini={() => void handleSubmitProfile(profile)}
          />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <Simulator profile={profile} />
        </Suspense>

        <Suspense fallback={<SectionFallback />}>
          <Chat profile={profile} plan={plan} />
        </Suspense>
      </main>

      <Footer
        language={profile.language}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={toggleReducedMotion}
      />
    </div>
  );
}
