import { ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { AqiGauge } from '../components/AqiGauge';
import { DemoReadingInfo } from '../components/DemoReadingInfo';
import { t } from '../lib/i18n';
import { formatAqiSourceLabel, formatAqiTimestampIst } from '../lib/planExport';
import type { AirQualityReading, LanguageCode } from '../types';

const SmogCanvas = lazy(() => import('../components/SmogCanvas'));

interface HeroProps {
  language: LanguageCode;
  isDark: boolean;
  reducedMotion: boolean;
  previewReading: AirQualityReading | null;
  aqiLoading?: boolean;
  aqiError?: boolean;
  onRetryAqi?: () => void;
  onGetStarted?: () => void;
}

function HeroCtaButtons({
  language,
  onGetStarted,
}: {
  language: LanguageCode;
  onGetStarted?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 pt-1">
      <a
        href="#profile"
        onClick={
          onGetStarted
            ? (e) => {
                e.preventDefault();
                onGetStarted();
              }
            : undefined
        }
        className="min-h-[48px] px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 font-semibold text-base inline-flex items-center gap-2 active:scale-[0.98] transition-transform"
      >
        <span>{t(language, 'heroPrimaryCta')}</span>
        <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
      </a>
      <a
        href="#how-it-works"
        className="min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/85 dark:bg-[#131C2E]/85 text-slate-800 dark:text-slate-100 hover:border-teal-600/60 dark:hover:border-teal-400/60 font-medium text-base inline-flex items-center transition-colors"
      >
        {t(language, 'heroSecondaryCta')}
      </a>
    </div>
  );
}

function HeroLeftColumn({
  language,
  onGetStarted,
}: {
  language: LanguageCode;
  onGetStarted?: () => void;
}) {
  return (
    <div className="lg:col-span-7 space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-teal-600/30 dark:border-teal-400/30 bg-teal-50/90 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 text-sm font-medium">
        <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{t(language, 'heroEyebrow')}</span>
      </div>
      <h1
        id="hero-heading"
        className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.08]"
      >
        <span className="block">{t(language, 'heroTitle')}</span>
        <span className="mt-2 block text-2xl sm:text-3xl lg:text-4xl font-semibold text-teal-700 dark:text-teal-300 leading-snug">
          {t(language, 'heroPromise')}
        </span>
      </h1>
      <p className="max-w-xl text-lg text-slate-700 dark:text-slate-200 leading-relaxed">
        {t(language, 'heroDescription')}
      </p>
      <HeroCtaButtons language={language} onGetStarted={onGetStarted} />
    </div>
  );
}

function HeroSourceBadge({
  language,
  reading,
}: {
  language: LanguageCode;
  reading: AirQualityReading;
}) {
  if (reading.source === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
        <span
          className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
          aria-hidden="true"
        />
        <span>{formatAqiSourceLabel(reading, language)}</span>
      </span>
    );
  }
  return <DemoReadingInfo language={language} />;
}

function HeroLiveReadingBody({
  language,
  reading,
}: {
  language: LanguageCode;
  reading: AirQualityReading;
}) {
  const timeIst = formatAqiTimestampIst(reading.updatedAt);
  const caption =
    reading.source === 'live' && timeIst
      ? `${language === 'hi' ? 'अपडेट' : 'Updated'} ${timeIst} · ${reading.dominantPollutant} · Open-Meteo`
      : t(language, 'cpcbScaleLabel');

  return (
    <>
      <AqiGauge
        aqi={reading.aqi}
        city={reading.city}
        language={language}
        size="hero"
        caption={caption}
        animateOnMount
      />
      <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
        <HeroSourceBadge language={language} reading={reading} />
        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
          {reading.dominantPollutant}
        </span>
      </div>
    </>
  );
}

function HeroAqiFallback({
  language,
  aqiLoading,
  aqiError,
  onRetryAqi,
}: Pick<HeroProps, 'language' | 'aqiLoading' | 'aqiError' | 'onRetryAqi'>) {
  if (aqiError) {
    return (
      <div
        role="alert"
        data-testid="hero-aqi-error"
        className="py-10 text-center space-y-4"
      >
        <p className="text-base font-medium text-slate-800 dark:text-slate-100">
          {t(language, 'heroErrorAqi')}
        </p>
        {onRetryAqi ? (
          <button
            type="button"
            onClick={onRetryAqi}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-teal-600 inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>{t(language, 'tryAgainButton')}</span>
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="hero-aqi-loading"
      className="py-12 flex flex-col items-center justify-center gap-4 text-center"
    >
      <div
        className="w-36 h-36 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-teal-600 dark:border-t-teal-400 animate-spin"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {t(language, aqiLoading ? 'heroLoadingAqi' : 'heroErrorAqi')}
      </p>
    </div>
  );
}

function HeroAqiPanel(
  props: Pick<
    HeroProps,
    'language' | 'previewReading' | 'aqiLoading' | 'aqiError' | 'onRetryAqi'
  >
) {
  return (
    <div className="lg:col-span-5 flex justify-center lg:justify-end">
      <div className="saans-theme-surface w-full max-w-sm min-h-[428px] flex flex-col justify-center rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#131C2E]/95 p-6 sm:p-7 shadow-[0_18px_48px_-24px_rgba(15,23,42,0.18)]">
        {props.previewReading ? (
          <HeroLiveReadingBody
            language={props.language}
            reading={props.previewReading}
          />
        ) : (
          <HeroAqiFallback
            language={props.language}
            aqiLoading={props.aqiLoading}
            aqiError={props.aqiError}
            onRetryAqi={props.onRetryAqi}
          />
        )}
      </div>
    </div>
  );
}

function useDeferredCanvas(reducedMotion: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      setReady(false);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 120);
    return () => window.clearTimeout(id);
  }, [reducedMotion]);
  return ready;
}

export function Hero(props: HeroProps) {
  const canvasReady = useDeferredCanvas(props.reducedMotion);
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative overflow-hidden py-12 sm:py-16 lg:py-20 border-b border-slate-200/80 dark:border-slate-800/80"
    >
      {canvasReady && !props.reducedMotion ? (
        <Suspense fallback={null}>
          <SmogCanvas reducedMotion={props.reducedMotion} isDark={props.isDark} />
        </Suspense>
      ) : null}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <HeroLeftColumn language={props.language} onGetStarted={props.onGetStarted} />
        <HeroAqiPanel
          language={props.language}
          previewReading={props.previewReading}
          aqiLoading={props.aqiLoading}
          aqiError={props.aqiError}
          onRetryAqi={props.onRetryAqi}
        />
      </div>
    </section>
  );
}
