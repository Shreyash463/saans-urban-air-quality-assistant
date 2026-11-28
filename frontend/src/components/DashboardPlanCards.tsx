import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import { t, type TranslationKey } from '../lib/i18n';
import type { Alternative, IndoorHack, LanguageCode, RoutineItem } from '../types';
import { Badge, type BadgeTone } from './ui/Badge';

const SLOT_LABEL_MAP: Record<RoutineItem['timeSlot'], TranslationKey> = {
  morning: 'slotMorning',
  midday: 'slotMidday',
  evening: 'slotEvening',
  night: 'slotNight',
};

const COST_LABEL_MAP: Record<IndoorHack['costLevel'], TranslationKey> = {
  free: 'costFree',
  low: 'costLow',
  medium: 'costMedium',
  high: 'costHigh',
};

const COST_TONE_MAP: Record<IndoorHack['costLevel'], BadgeTone> = {
  free: 'emerald',
  low: 'teal',
  medium: 'amber',
  high: 'slate',
};

function RoutineTimelineItem({
  item,
  language,
}: {
  item: RoutineItem;
  language: LanguageCode;
}) {
  return (
    <li className="relative saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5">
      <span
        aria-hidden="true"
        className="no-print absolute -left-[25px] sm:-left-[31px] top-6 w-3.5 h-3.5 rounded-full bg-teal-600 dark:bg-teal-400 ring-4 ring-white dark:ring-[#131C2E]"
      />
      <span className="font-mono text-sm font-semibold text-teal-800 dark:text-teal-300">
        {t(language, SLOT_LABEL_MAP[item.timeSlot])}
      </span>
      <h4 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
        {item.title}
      </h4>
      <p className="mt-2 text-base text-slate-700 dark:text-slate-200 leading-relaxed">
        {item.detail}
      </p>
      <p className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
        <span className="font-semibold text-teal-800 dark:text-teal-300">
          {t(language, 'impactLabel')}:
        </span>{' '}
        {item.impactNote}
      </p>
    </li>
  );
}

export function RoutineTimelineCard({
  routine,
  language,
}: {
  routine: readonly RoutineItem[];
  language: LanguageCode;
}) {
  return (
    <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
      <div className="flex items-center gap-2.5">
        <Clock
          className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
          aria-hidden="true"
        />
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'routineHeading')}
        </h3>
      </div>
      <div id="routine-timeline" className="relative mt-6 pl-7 sm:pl-9">
        <div
          aria-hidden="true"
          className="no-print absolute left-2.5 sm:left-3 top-2 bottom-2 w-0.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"
        >
          <div className="w-full h-full bg-teal-600 dark:bg-teal-400" />
        </div>
        <ol className="space-y-5">
          {routine.map((item) => (
            <RoutineTimelineItem key={item.timeSlot} item={item} language={language} />
          ))}
        </ol>
      </div>
    </article>
  );
}

function IndoorHackItem({
  hack,
  language,
}: {
  hack: IndoorHack;
  language: LanguageCode;
}) {
  return (
    <div className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
            {hack.title}
          </h4>
          <Badge
            tone={COST_TONE_MAP[hack.costLevel]}
            className="shrink-0 sm:text-[13px]"
          >
            {t(language, COST_LABEL_MAP[hack.costLevel])}
          </Badge>
        </div>
        <p className="mt-2.5 text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
          {hack.howTo}
        </p>
      </div>
      <p className="pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
        <span className="font-semibold text-teal-800 dark:text-teal-300">
          {t(language, 'estimatedBenefitLabel')}:
        </span>{' '}
        {hack.estimatedBenefit}
      </p>
    </div>
  );
}

export function IndoorHacksCard({
  hacks,
  language,
}: {
  hacks: readonly IndoorHack[];
  language: LanguageCode;
}) {
  return (
    <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Sparkles
            className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t(language, 'indoorHacksHeading')}
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t(language, 'indoorHacksSubtitle')}
        </p>
      </div>
      <div className="print-two-col mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {hacks.map((hack) => (
          <IndoorHackItem key={hack.title} hack={hack} language={language} />
        ))}
      </div>
    </article>
  );
}

function AlternativeMetricsRow({
  alt,
  language,
}: {
  alt: Alternative;
  language: LanguageCode;
}) {
  return (
    <dl className="pt-3 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-slate-600 dark:text-slate-300">
          {t(language, 'pm25DropLabel')}
        </dt>
        <dd className="font-mono mt-0.5 text-base font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
          ~{alt.pm25ReductionPct}%
        </dd>
      </div>
      <div>
        <dt className="text-slate-600 dark:text-slate-300">
          {t(language, 'co2SavedLabel')}
        </dt>
        <dd className="font-mono mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
          {alt.co2SavedKgPerMonth > 0
            ? `~${alt.co2SavedKgPerMonth} kg`
            : `— (${t(language, 'co2Pm25Only')})`}
        </dd>
      </div>
    </dl>
  );
}

function AlternativeSwapCard({
  alt,
  language,
}: {
  alt: Alternative;
  language: LanguageCode;
}) {
  return (
    <div className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4">
      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t(language, 'currentHabitLabel')}
          </span>
          <p className="mt-0.5 text-base text-slate-800 dark:text-slate-200">
            {alt.current}
          </p>
        </div>
        <div className="flex items-start gap-2 text-teal-800 dark:text-teal-300">
          <ArrowRight className="w-4 h-4 mt-1 shrink-0" aria-hidden="true" />
          <div>
            <span className="text-sm font-medium text-teal-800 dark:text-teal-300">
              {t(language, 'betterSwapLabel')}
            </span>
            <h4 className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
              {alt.swap}
            </h4>
          </div>
        </div>
        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
          {alt.why}
        </p>
      </div>
      <AlternativeMetricsRow alt={alt} language={language} />
    </div>
  );
}

export function AlternativesCard({
  alternatives,
  language,
}: {
  alternatives: readonly Alternative[];
  language: LanguageCode;
}) {
  return (
    <article className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7">
      <div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'alternativesHeading')}
        </h3>
        <p className="mt-1 text-base text-slate-600 dark:text-slate-300">
          {t(language, 'alternativesSubtitle')}
        </p>
      </div>
      <div className="print-two-col mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {alternatives.map((alt) => (
          <AlternativeSwapCard key={alt.swap} alt={alt} language={language} />
        ))}
      </div>
    </article>
  );
}
