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

type ErrKind = 'network' | 'rate_limit';
type SyncState = {
  profile: UserProfile;
  planLang: LanguageCode | null;
  inFlight: LanguageCode | null;
  abort: AbortController | null;
};
type PlanHookApi = {
  setPlan: (p: PlanResponse | null) => void;
  setPlanError: (e: ErrKind | null) => void;
  setLangSyncError: (e: ErrKind | null) => void;
  setIsGeneratingPlan: (v: boolean) => void;
  setPreviewReading: (r: AirQualityReading | null) => void;
  announce: (m: string) => void;
};

const toErrKind = (e: unknown): ErrKind =>
  e instanceof ApiRequestError && e.kind === 'rate_limit' ? 'rate_limit' : 'network';

function useHeroAqiLoader(initialCity: string) {
  const [previewReading, setPreviewReading] = useState<AirQualityReading | null>(null);
  const [aqiLoading, setAqiLoading] = useState(true);
  const [aqiError, setAqiError] = useState(false);

  const loadHeroAqi = useCallback((city: string) => {
    setAqiLoading(true);
    setAqiError(false);
    getAirQuality(city)
      .then(setPreviewReading)
      .catch(() => {
        setPreviewReading(null);
        setAqiError(true);
      })
      .finally(() => setAqiLoading(false));
  }, []);

  const initRef = useRef(initialCity);
  useEffect(() => loadHeroAqi(initRef.current), [loadHeroAqi]);
  return { previewReading, setPreviewReading, aqiLoading, aqiError, loadHeroAqi };
}

function abortSync(
  ref: { current: SyncState },
  setSyncErr: (e: ErrKind | null) => void
) {
  ref.current.abort?.abort();
  ref.current.abort = null;
  ref.current.inFlight = null;
  setSyncErr(null);
}

function startLangSync(
  target: UserProfile,
  coords: Coordinates | null,
  ref: { current: SyncRefsAlias },
  api: PlanHookApi
) {
  abortSync(ref, api.setLangSyncError);
  const ctrl = new AbortController();
  ref.current.abort = ctrl;
  ref.current.inFlight = target.language;
  void generatePlan(target, coords, ctrl.signal)
    .then((next) => {
      if (ctrl.signal.aborted) return;
      ref.current.planLang = target.language;
      ref.current.inFlight = null;
      api.setPlan(next);
      api.setPreviewReading(next.aqi);
      api.announce(t(target.language, 'planReadyAnnouncement'));
    })
    .catch((err: unknown) => {
      if (
        ctrl.signal.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      )
        return;
      ref.current.inFlight = null;
      const k = toErrKind(err);
      api.setLangSyncError(k);
      api.announce(
        t(
          target.language,
          k === 'rate_limit' ? 'planRateLimitBody' : 'planErrorHeading'
        )
      );
    });
}
type SyncRefsAlias = SyncState;

async function submitMainPlan(
  target: UserProfile,
  coords: Coordinates | null,
  shouldScroll: boolean,
  ref: { current: SyncState },
  api: PlanHookApi,
  scroll: (t: string | HTMLElement) => void
) {
  abortSync(ref, api.setLangSyncError);
  api.setIsGeneratingPlan(true);
  api.setPlanError(null);
  api.announce(t(target.language, 'planLoadingLabel'));
  try {
    const next = await generatePlan(target, coords);
    ref.current.planLang = target.language;
    api.setPlan(next);
    api.setPreviewReading(next.aqi);
    api.announce(t(target.language, 'planReadyAnnouncement'));
    if (shouldScroll) window.setTimeout(() => scroll('#dashboard'), 80);
  } catch (err) {
    api.setPlanError(toErrKind(err));
    api.setPlan(null);
    api.announce(t(target.language, 'planErrorHeading'));
  } finally {
    api.setIsGeneratingPlan(false);
  }
}

function runClearFlow(
  ref: { current: SyncState },
  clearPrefs: () => void,
  updateProfile: (u: (p: UserProfile) => UserProfile) => void,
  setActiveCoords: (c: Coordinates | null) => void,
  api: PlanHookApi,
  loadHeroAqi: (city: string) => void
): void {
  const lang = ref.current.profile.language;
  abortSync(ref, api.setLangSyncError);
  ref.current = {
    profile: { ...DEFAULT_USER_PROFILE, language: lang },
    planLang: null,
    inFlight: null,
    abort: null,
  };
  clearPrefs();
  updateProfile((p) => ({ ...DEFAULT_USER_PROFILE, language: p.language }));
  setActiveCoords(null);
  api.setPlan(null);
  api.setPlanError(null);
  loadHeroAqi(DEFAULT_USER_PROFILE.city);
  api.announce(t(lang, 'dataClearedNotice'));
}

function runToggleFlow(
  ref: { current: SyncState },
  updateProfile: (u: UserProfile) => void,
  plan: PlanResponse | null,
  liveCoords: Coordinates | null,
  api: PlanHookApi
): void {
  const lang: LanguageCode = ref.current.profile.language === 'en' ? 'hi' : 'en';
  const next = { ...ref.current.profile, language: lang };
  ref.current.profile = next;
  updateProfile(next);
  api.setLangSyncError(null);
  if (!plan) return;
  if (ref.current.planLang === lang) return abortSync(ref, api.setLangSyncError);
  if (ref.current.inFlight !== lang) startLangSync(next, liveCoords, ref, api);
}

function useStatusAnnouncer() {
  const [statusMessage, setStatusMessage] = useState('');
  const announce = useCallback((m: string) => {
    setStatusMessage('');
    window.setTimeout(() => setStatusMessage(m), 20);
  }, []);
  return { statusMessage, announce };
}

interface AppActionDeps {
  profile: UserProfile;
  updateProfile: (u: UserProfile | ((p: UserProfile) => UserProfile)) => void;
  clearPrefs: () => void;
  activeCoords: Coordinates | null;
  setActiveCoords: (c: Coordinates | null) => void;
  hero: ReturnType<typeof useHeroAqiLoader>;
  announce: (m: string) => void;
  scroll: (t: string | HTMLElement) => void;
}

function useAppActions(d: AppActionDeps) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planError, setPlanError] = useState<ErrKind | null>(null);
  const [langSyncError, setLangSyncError] = useState<ErrKind | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const ref = useRef<SyncState>({
    profile: d.profile,
    planLang: null,
    inFlight: null,
    abort: null,
  });
  useEffect(() => {
    ref.current.profile = d.profile;
  }, [d.profile]);

  const api: PlanHookApi = {
    setPlan,
    setPlanError,
    setLangSyncError,
    setIsGeneratingPlan,
    setPreviewReading: d.hero.setPreviewReading,
    announce: d.announce,
  };
  const liveCoords = plan?.aqi.source === 'live' ? d.activeCoords : null;
  return {
    state: { plan, planError, langSyncError, isGeneratingPlan },
    toggleLanguage: () => runToggleFlow(ref, d.updateProfile, plan, liveCoords, api),
    retryLanguageSync: () =>
      plan && startLangSync(ref.current.profile, liveCoords, ref, api),
    handleSubmitProfile: (clean: UserProfile) =>
      submitMainPlan(clean, d.activeCoords, true, ref, api, d.scroll),
    handleRetryGemini: () =>
      void submitMainPlan(d.profile, d.activeCoords, false, ref, api, d.scroll),
    handleClearData: () =>
      runClearFlow(
        ref,
        d.clearPrefs,
        d.updateProfile,
        d.setActiveCoords,
        api,
        d.hero.loadHeroAqi
      ),
  };
}

export function useSaansAppState(
  scrollToElement: (target: string | HTMLElement) => void
) {
  const { profile, updateProfile, clearPrefs } = useLocalPrefs();
  const { theme, toggleTheme } = useTheme();
  const [activeCoords, setActiveCoords] = useState<Coordinates | null>(null);
  const { statusMessage, announce } = useStatusAnnouncer();
  const hero = useHeroAqiLoader(profile.city);
  const act = useAppActions({
    profile,
    updateProfile,
    clearPrefs,
    activeCoords,
    setActiveCoords,
    hero,
    announce,
    scroll: scrollToElement,
  });
  return {
    profile,
    updateProfile,
    theme,
    toggleTheme,
    ...hero,
    ...act.state,
    activeCoords,
    setActiveCoords,
    statusMessage,
    reloadHeroAqi: () => hero.loadHeroAqi(profile.city),
    toggleLanguage: act.toggleLanguage,
    retryLanguageSync: act.retryLanguageSync,
    handleSubmitProfile: act.handleSubmitProfile,
    handleRetryGemini: act.handleRetryGemini,
    handleClearData: act.handleClearData,
  };
}
