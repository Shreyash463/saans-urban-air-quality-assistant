import { ArrowDown, ArrowRight } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { AqiGauge } from '../components/AqiGauge';
import { DemoReadingInfo } from '../components/DemoReadingInfo';
import { t } from '../lib/i18n';
import { HERO_WORD_STAGGER_MS } from '../lib/motion';
import { formatAqiSourceLabel } from '../lib/planExport';
import type { AirQualityReading, LanguageCode } from '../types';

const SmogCanvas = lazy(() => import('../components/SmogCanvas'));

interface HeroProps {
  language: LanguageCode;
  previewReading: AirQualityReading;
  reducedMotion: boolean;
  isDark: boolean;
}

/**
 * Landing Hero section with ambient PM2.5 SmogCanvas (lazy-loaded and disabled
 * under reduced motion), accessible word-by-word H1 entrance, sweeping CPCB AQI
 * gauge, and scroll-drawn 3-step "How it works" connector.
 */
export function Hero({ language, previewReading, reducedMotion, isDark }: HeroProps) {
  const titleText = t(language, 'heroTitle');
  const promiseText = t(language, 'heroPromise');
  const promiseWords = promiseText.split(' ');
  const fullHeadingLabel = `${titleText} — ${promiseText}`;

  const steps = [
    {
      num: '01',
      title: t(language, 'step1Title'),
      desc: t(language, 'step1Desc'),
    },
    {
      num: '02',
      title: t(language, 'step2Title'),
      desc: t(language, 'step2Desc'),
    },
    {
      num: '03',
      title: t(language, 'step3Title'),
      desc: t(language, 'step3Desc'),
    },
  ];

  const gaugeCaption = `${t(language, 'dominantPollutantLabel')}: ${previewReading.dominantPollutant}`;

  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="saans-section-anchor relative overflow-hidden pt-12 pb-16 sm:pt-16 sm:pb-20"
    >
      {/* Lazy-loaded lightweight ambient PM2.5 particle field (off under reduced motion) */}
      {!reducedMotion ? (
        <Suspense fallback={null}>
          <SmogCanvas reducedMotion={reducedMotion} isDark={isDark} />
        </Suspense>
      ) : null}

      {/* Subtle decorative smog-to-clean-air SVG horizon (no external images) */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 240"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 w-full h-36 opacity-40 dark:opacity-25"
      >
        <defs>
          <linearGradient id="saansHazeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0D9488" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#64748B" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.14" />
          </linearGradient>
        </defs>
        <path
          d="M0,160 C240,105 460,210 720,150 C980,90 1200,175 1440,120 L1440,240 L0,240 Z"
          fill="url(#saansHazeGrad)"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left column: Accessible staggered H1 & primary CTA */}
          <div className="lg:col-span-7">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-300">
              {t(language, 'heroEyebrow')}
            </p>

            <h1
              id="hero-heading"
              aria-label={fullHeadingLabel}
              className="mt-3 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.1]"
            >
              <span
                aria-hidden="true"
                className="saans-hero-word block"
                style={{ '--word-delay': '0ms' } as React.CSSProperties}
              >
                {titleText}
              </span>
              <span
                aria-hidden="true"
                className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-2xl sm:text-3xl lg:text-[2rem] font-semibold text-slate-800 dark:text-slate-200 leading-snug"
              >
                {promiseWords.map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className="saans-hero-word"
                    style={
                      {
                        '--word-delay': `${(index + 1) * HERO_WORD_STAGGER_MS}ms`,
                      } as React.CSSProperties
                    }
                  >
                    {word}
                  </span>
                ))}
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-slate-700 dark:text-slate-200 leading-relaxed max-w-2xl">
              {t(language, 'heroDescription')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a
                href="#profile"
                className="saans-cta-glow inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 font-semibold text-base active:scale-[0.98] transition-transform whitespace-nowrap"
              >
                <span>{t(language, 'heroPrimaryCta')}</span>
                <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>

              <a
                href="#how-it-works"
                className="saans-theme-surface inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-[#131C2E]/90 hover:border-teal-600/60 dark:hover:border-teal-400/60 text-slate-800 dark:text-slate-100 font-semibold text-base active:scale-[0.98] transition-transform whitespace-nowrap"
              >
                <span>{t(language, 'heroSecondaryCta')}</span>
                <ArrowDown className="w-4 h-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Right column: Focal sweeping SVG AQI Gauge card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="saans-theme-surface w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#131C2E]/95 p-6 sm:p-7 shadow-sm">
              <div className="min-h-[36px] flex items-center justify-between gap-2 mb-3">
                {previewReading.source === 'demo' ? (
                  <DemoReadingInfo language={language} />
                ) : (
                  <span className="text-sm font-medium text-teal-800 dark:text-teal-300 leading-snug">
                    {formatAqiSourceLabel(previewReading, language)}
                  </span>
                )}
              </div>

              <AqiGauge
                aqi={previewReading.aqi}
                city={previewReading.city}
                language={language}
                size="hero"
                caption={gaugeCaption}
                animateOnMount
              />
            </div>
          </div>
        </div>

        {/* 3-step "How it works" strip with scroll-drawn connector line */}
        <div
          id="how-it-works"
          className="saans-section-anchor mt-16 pt-10 border-t border-slate-200/80 dark:border-slate-800/80"
        >
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t(language, 'howItWorksHeading')}
          </h2>

          <div className="relative mt-6">
            {/* Desktop horizontal connector line drawing on scroll */}
            <svg
              aria-hidden="true"
              viewBox="0 0 900 12"
              preserveAspectRatio="none"
              className="hidden md:block pointer-events-none absolute top-7 left-[10%] w-[80%] h-3"
            >
              <line
                x1="0"
                y1="6"
                x2="900"
                y2="6"
                strokeWidth="2"
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <line
                x1="0"
                y1="6"
                x2="900"
                y2="6"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="saans-how-line stroke-teal-600 dark:stroke-teal-400"
              />
            </svg>

            <ol
              data-reveal-group
              className="relative grid grid-cols-1 md:grid-cols-3 gap-5"
            >
              {steps.map((step) => (
                <li
                  key={step.num}
                  data-reveal
                  className="saans-theme-surface saans-card-lift rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white/95 dark:bg-[#131C2E]/95 p-5"
                >
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/70 border border-teal-200 dark:border-teal-800 text-sm font-semibold text-teal-800 dark:text-teal-300 tabular-nums"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {step.num}
                  </span>
                  <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {step.desc}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
