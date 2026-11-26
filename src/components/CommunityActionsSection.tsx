import { Briefcase, Building2, School, Users } from 'lucide-react';
import { t, type TranslationKey } from '../lib/i18n';
import type {
  CommunityAction,
  CommunityActor,
  EffortLevel,
  LanguageCode,
} from '../types';
import { Badge, type BadgeTone } from './ui/Badge';

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

const EFFORT_TONE_MAP: Record<EffortLevel, BadgeTone> = {
  low: 'emerald',
  medium: 'amber',
  high: 'slate',
};

function CommunityActionCard({
  action,
  language,
}: {
  action: CommunityAction;
  language: LanguageCode;
}) {
  const ActorIcon = ACTOR_ICON_MAP[action.who];
  return (
    <div
      data-reveal
      className="saans-card-lift rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-5 flex flex-col justify-between gap-4"
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <Badge tone="teal" className="py-1">
            <ActorIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t(language, ACTOR_LABEL_MAP[action.who])}</span>
          </Badge>
          <Badge tone={EFFORT_TONE_MAP[action.effort]}>
            {t(language, EFFORT_LABEL_MAP[action.effort])}
          </Badge>
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
}

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
        {actions.map((action) => (
          <CommunityActionCard
            key={`${action.who}-${action.title}`}
            action={action}
            language={language}
          />
        ))}
      </div>
    </article>
  );
}
