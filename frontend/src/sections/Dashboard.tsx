import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { AqiGauge } from '../components/AqiGauge';
import { CommunityActionsSection } from '../components/CommunityActionsSection';
import { DashboardExportActions } from '../components/DashboardExportActions';
import { PlanLoadingStatus } from '../components/DashboardLoadingStatus';
import {
  AlternativesCard,
  IndoorHacksCard,
  RoutineTimelineCard,
} from '../components/DashboardPlanCards';
import {
  AiBusyRetryNotice,
  LanguageSyncNotice,
  PlanErrorState,
} from '../components/PlanStatusNotices';
import { Badge } from '../components/ui/Badge';
import { t } from '../lib/i18n';
import { formatAqiSourceLabel } from '../lib/planExport';
import type { LanguageCode, PlanResponse } from '../types';

export interface DashboardProps {
  plan: PlanResponse | null;
  language: LanguageCode;
  isLoading: boolean;
  announcement?: string;
  errorKind?: 'network' | 'rate_limit' | null;
  langSyncError?: 'network' | 'rate_limit' | null;
  onRetryGemini?: () => void;
  onRetryLangSync?: () => void;
}

function DashboardMetaHeader({
  plan,
  language,
}: {
  plan: PlanResponse;
  language: LanguageCode;
}) {
  const isLive = plan.aqi.source === 'live';
  const sourceLabel = formatAqiSourceLabel(plan.aqi, language);
  const generatorLabel =
    plan.generatedBy === 'gemini'
      ? t(language, 'generatedByGemini')
      : t(language, 'generatedByRules');

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="dashboard-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
          >
            {t(language, 'dashboardHeading')} — {plan.aqi.city}
          </h2>
          <Badge
            tone={isLive ? 'teal' : 'slate'}
            className="rounded-full px-2.5 py-0.5 font-medium"
          >
            {sourceLabel}
          </Badge>
          {plan.generatedBy ? (
            <span data-testid="plan-generator-badge">
              <Badge
                tone={plan.generatedBy === 'gemini' ? 'emerald' : 'slate'}
                className="rounded-full px-2.5 py-0.5 font-medium"
              >
                {generatorLabel}
              </Badge>
            </span>
          ) : null}
        </div>
        <p className="mt-2 max-w-3xl text-base text-slate-700 dark:text-slate-200 leading-relaxed">
          {plan.summary}
        </p>
      </div>
      <DashboardExportActions plan={plan} language={language} />
    </div>
  );
}

function AdvisoryCard({
  title,
  body,
  isWarning,
}: {
  title: string;
  body: string;
  isWarning?: boolean;
}) {
  const Icon = isWarning ? AlertTriangle : ShieldAlert;
  const iconTone = isWarning
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-teal-700 dark:text-teal-400';
  return (
    <article
      className={`saans-theme-surface print-card saans-card-lift rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 ${isWarning ? 'flex-1' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`w-5 h-5 ${iconTone} shrink-0`} aria-hidden="true" />
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
      </div>
      <p className="mt-3 text-base text-slate-700 dark:text-slate-200 leading-relaxed">
        {body}
      </p>
    </article>
  );
}

function DashboardTopOverview({
  plan,
  language,
}: {
  plan: PlanResponse;
  language: LanguageCode;
}) {
  return (
    <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      <div className="saans-theme-surface print-card lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-6 flex flex-col items-center justify-center">
        <AqiGauge
          aqi={plan.aqi.aqi}
          city={plan.aqi.city}
          language={language}
          size="card"
          caption={`${t(language, 'dominantPollutantLabel')}: ${plan.aqi.dominantPollutant}`}
        />
      </div>
      <div className="lg:col-span-8 flex flex-col gap-5">
        <AdvisoryCard
          title={t(language, 'healthAdvisoryHeading')}
          body={plan.healthAdvisory}
          isWarning
        />
        <AdvisoryCard
          title={t(language, 'maskGuidanceHeading')}
          body={plan.maskGuidance}
        />
      </div>
    </div>
  );
}

function DashboardPlanContent({
  plan,
  language,
  isLoading,
  langSyncError,
  onRetryGemini,
  onRetryLangSync,
}: {
  plan: PlanResponse;
  language: LanguageCode;
  isLoading: boolean;
  langSyncError?: 'network' | 'rate_limit' | null;
  onRetryGemini?: () => void;
  onRetryLangSync?: () => void;
}) {
  return (
    <div id="print-plan-area" className="max-w-6xl mx-auto px-4 sm:px-6">
      <DashboardMetaHeader plan={plan} language={language} />
      <LanguageSyncNotice
        language={language}
        errorKind={langSyncError}
        onRetry={onRetryLangSync}
      />
      <AiBusyRetryNotice
        plan={plan}
        language={language}
        isLoading={isLoading}
        onRetryGemini={onRetryGemini}
      />
      <div className="mt-8 space-y-6">
        <DashboardTopOverview plan={plan} language={language} />
        <RoutineTimelineCard routine={plan.routine} language={language} />
        <IndoorHacksCard hacks={plan.indoorHacks} language={language} />
        <AlternativesCard alternatives={plan.alternatives} language={language} />
        <CommunityActionsSection
          actions={plan.communityActions ?? []}
          language={language}
        />
      </div>
      <div
        role="note"
        className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-[#0E1627] px-5 py-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed"
      >
        {plan.disclaimer}
      </div>
    </div>
  );
}

function DashboardStatusFallback({
  language,
  isLoading,
  errorKind,
  onRetryGemini,
}: {
  language: LanguageCode;
  isLoading: boolean;
  errorKind?: 'network' | 'rate_limit' | null;
  onRetryGemini?: () => void;
}) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6">
      <h2
        id="dashboard-status-heading"
        className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
      >
        {t(language, 'dashboardHeading')}
      </h2>
      {isLoading ? <PlanLoadingStatus language={language} /> : null}
      {!isLoading && errorKind ? (
        <PlanErrorState
          language={language}
          errorKind={errorKind}
          isLoading={isLoading}
          onRetry={onRetryGemini}
        />
      ) : null}
    </div>
  );
}

export default function Dashboard({
  plan,
  language,
  isLoading,
  announcement,
  errorKind = null,
  langSyncError = null,
  onRetryGemini,
  onRetryLangSync,
}: DashboardProps) {
  if (!plan && !isLoading && !errorKind) return null;
  return (
    <section
      id="dashboard"
      aria-labelledby={plan ? 'dashboard-heading' : 'dashboard-status-heading'}
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      {announcement ? (
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      ) : null}
      {plan ? (
        <DashboardPlanContent
          plan={plan}
          language={language}
          isLoading={isLoading}
          langSyncError={langSyncError}
          onRetryGemini={onRetryGemini}
          onRetryLangSync={onRetryLangSync}
        />
      ) : (
        <DashboardStatusFallback
          language={language}
          isLoading={isLoading}
          errorKind={errorKind}
          onRetryGemini={onRetryGemini}
        />
      )}
    </section>
  );
}
