import { Building2, School, Users, Briefcase } from 'lucide-react';
import { t, type TranslationKey } from '../lib/i18n';
import type {
  CommunityAction,
  CommunityActor,
  EffortLevel,
  LanguageCode,
} from '../types';

interface CommunityActionsSectionProps {
  actions: readonly CommunityAction[];
  language: LanguageCode;
}

const ACTOR_LABEL_MAP: Record<CommunityActor, TranslationKey> = {
  rwa: 'communityActorRwa',
  school: 'communityActorSchool',
  workplace: 'communityActorWorkplace',
  neighbours: 'communityActorNeighbours',
};

const ACTOR_ICON_MAP: Record<CommunityActor, typeof Users> = {
  rwa: Building2,
  school: School,
  workplace: Briefcase,
  neighbours: Users,
};

const EFFORT_LABEL_MAP: Record<EffortLevel, TranslationKey> = {
  low: 'effortLow',
  medium: 'effortMedium',
  high: 'effortHigh',
};

const EFFORT_STYLE_MAP: Record<EffortLevel, string> = {
  low: 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-950/60 dark:border-emerald-800',
  medium:
    'text-amber-900 bg-amber-50 border-amber-200 dark:text-amber-200 dark:bg-amber-950/60 dark:border-amber-800',
  high: 'text-slate-800 bg-slate-100 border-slate-300 dark:text-slate-200 dark:bg-slate-800 dark:border-slate-700',
};

/**
 * Displays practical neighborhood, RWA, school, and workplace collective clean-air actions.
 */
export function CommunityActionsSection({
  actions,
  language,
}: CommunityActionsSectionProps) {
  if (actions.length === 0) return null;

  return (
    <article
      aria-labelledby="community-effort-heading"
      className="saans-theme-surface print-card rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Users
            className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
            aria-hidden="true"
          />
          <h3
            id="community-effort-heading"
            className="text-xl font-semibold text-slate-900 dark:text-slate-100"
          >
            {t(language, 'communityHeading')}
          </h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t(language, 'communitySubtitle')}
        </p>
      </div>

      <div
        data-reveal-group
        className="print-two-col mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {actions.map((action) => {
          const ActorIcon = ACTOR_ICON_MAP[action.who];
          return (
            <div
              key={`${action.who}-${action.title}`}
              data-reveal
              className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md border border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
                    <ActorIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t(language, ACTOR_LABEL_MAP[action.who])}</span>
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border whitespace-nowrap ${EFFORT_STYLE_MAP[action.effort]}`}
                  >
                    {t(language, EFFORT_LABEL_MAP[action.effort])}
                  </span>
                </div>

                <h4 className="text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                  {action.title}
                </h4>
                <p className="mt-2 text-sm sm:text-base text-slate-700 dark:text-slate-200 leading-relaxed">
                  {action.howTo}
                </p>
              </div>

              <p className="pt-3 border-t border-slate-200/80 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200">
                <span className="font-semibold text-teal-800 dark:text-teal-300">
                  {t(language, 'communityImpactLabel')}:
                </span>{' '}
                {action.estimatedImpact}
              </p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
