import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_USER_PROFILE, useLocalPrefs } from '../hooks/useLocalPrefs';
import { useTheme } from '../hooks/useTheme';
import { t } from '../lib/i18n';
import { ApiRequestError, generatePlan, getAirQuality } from '../services/api';
import type {
  AirQualityReading,
  Coordinates,
  LanguageCode,
  PlanResponse,
  UserProfile,
} from '../types';

function useHeroAqiLoader(initialCity: string) {
  const [previewReading, setPreviewReading] = useState<AirQualityReading | null>(null);
  const [aqiLoading, setAqiLoading] = useState(true);
  const [aqiError, setAqiError] = useState(false);

  const loadHeroAqi = useCallback((city: string) => {
    setAqiLoading(true);
    setAqiError(false);
    getAirQuality(city)
      .then((reading) => {
        setPreviewReading(reading);
      })
      .catch(() => {
        setPreviewReading(null);
        setAqiError(true);
      })
      .finally(() => setAqiLoading(false));
  }, []);

  const initialCityRef = useRef(initialCity);
  useEffect(() => {
    loadHeroAqi(initialCityRef.current);
  }, [loadHeroAqi]);

  return { previewReading, setPreviewReading, aqiLoading, aqiError, loadHeroAqi };
}

function useStatusAnnouncer() {
  const [statusMessage, setStatusMessage] = useState('');
  const announce = useCallback((msg: string) => {
    setStatusMessage('');
    window.setTimeout(() => setStatusMessage(msg), 20);
  }, []);
  return { statusMessage, announce };
}

function usePlanRequestState(
  activeCoords: Coordinates | null,
  scrollToElement: (target: string | HTMLElement) => void,
  setPreviewReading: (r: AirQualityReading) => void
) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planError, setPlanError] = useState<'network' | 'rate_limit' | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const { statusMessage, announce } = useStatusAnnouncer();

  const requestPlan = useCallback(
    async (targetProfile: UserProfile, shouldScroll: boolean) => {
      setIsGeneratingPlan(true);
      setPlanError(null);
      announce(t(targetProfile.language, 'planLoadingLabel'));
      try {
        const next = await generatePlan(targetProfile, activeCoords);
        setPlan(next);
        setPreviewReading(next.aqi);
        announce(t(targetProfile.language, 'planReadyAnnouncement'));
        if (shouldScroll) window.setTimeout(() => scrollToElement('#dashboard'), 80);
      } catch (err) {
        setPlanError(
          err instanceof ApiRequestError && err.kind === 'rate_limit'
            ? 'rate_limit'
            : 'network'
        );
        setPlan(null);
        announce(t(targetProfile.language, 'planErrorHeading'));
      } finally {
        setIsGeneratingPlan(false);
      }
    },
    [activeCoords, announce, scrollToElement, setPreviewReading]
  );

  return {
    plan,
    setPlan,
    planError,
    setPlanError,
    isGeneratingPlan,
    statusMessage,
    announce,
    requestPlan,
  };
}

function toggleProfileLanguage(
  profile: UserProfile,
  plan: PlanResponse | null,
  activeCoords: Coordinates | null,
  updateProfile: (next: UserProfile) => void,
  onSuccess: (next: PlanResponse) => void
): void {
  const next = {
    ...profile,
    language: (profile.language === 'en' ? 'hi' : 'en') as LanguageCode,
  };
  updateProfile(next);
  if (!plan) return;
  const coords = plan.aqi.source === 'live' ? activeCoords : null;
  void generatePlan(next, coords)
    .then(onSuccess)
    .catch(() => undefined);
}

export function useSaansAppState(
  scrollToElement: (target: string | HTMLElement) => void
) {
  const { profile, updateProfile, clearPrefs } = useLocalPrefs();
  const { theme, toggleTheme } = useTheme();
  const [activeCoords, setActiveCoords] = useState<Coordinates | null>(null);
  const hero = useHeroAqiLoader(profile.city);
  const req = usePlanRequestState(
    activeCoords,
    scrollToElement,
    hero.setPreviewReading
  );

  const toggleLanguage = () =>
    toggleProfileLanguage(profile, req.plan, activeCoords, updateProfile, (p) => {
      req.setPlan(p);
      hero.setPreviewReading(p.aqi);
    });

  const handleClearData = () => {
    const lang = profile.language;
    clearPrefs();
    updateProfile((prev) => ({ ...DEFAULT_USER_PROFILE, language: prev.language }));
    setActiveCoords(null);
    req.setPlan(null);
    req.setPlanError(null);
    hero.loadHeroAqi(DEFAULT_USER_PROFILE.city);
    req.announce(t(lang, 'dataClearedNotice'));
  };

  return {
    profile,
    updateProfile,
    theme,
    toggleTheme,
    ...hero,
    reloadHeroAqi: () => hero.loadHeroAqi(profile.city),
    activeCoords,
    setActiveCoords,
    plan: req.plan,
    planError: req.planError,
    isGeneratingPlan: req.isGeneratingPlan,
    statusMessage: req.statusMessage,
    toggleLanguage,
    handleSubmitProfile: (cleanProfile: UserProfile) =>
      req.requestPlan(cleanProfile, true),
    handleRetryGemini: () => void req.requestPlan(profile, false),
    handleClearData,
  };
}
