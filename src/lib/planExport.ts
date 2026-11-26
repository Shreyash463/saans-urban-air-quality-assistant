import { getAqiCategory } from './aqi';
import { t } from './i18n';
import type { AirQualityReading, LanguageCode, PlanResponse } from '../types';

export function formatAqiTimestampIst(updatedAt: string): string {
  const trimmed = updatedAt.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  try {
    const formatted = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
    return `${formatted} IST`;
  } catch {
    return trimmed;
  }
}

export function formatAqiSourceLabel(
  reading: AirQualityReading,
  language: LanguageCode
): string {
  if (reading.source === 'demo') return t(language, 'sampleReadingForDemo');
  const timeIst = formatAqiTimestampIst(reading.updatedAt);
  if (language === 'hi') {
    return timeIst ? `लाइव · अपडेट ${timeIst} (Open-Meteo)` : 'लाइव · Open-Meteo';
  }
  return timeIst ? `Live · updated ${timeIst} (Open-Meteo)` : 'Live · Open-Meteo';
}

function appendRoutineLines(
  lines: string[],
  plan: PlanResponse,
  language: LanguageCode
): void {
  const slotLabels: Record<string, string> = {
    morning: t(language, 'slotMorning'),
    midday: t(language, 'slotMidday'),
    evening: t(language, 'slotEvening'),
    night: t(language, 'slotNight'),
  };
  lines.push('', `[${t(language, 'routineHeading')}]`);
  for (const item of plan.routine) {
    lines.push(
      `- ${slotLabels[item.timeSlot] ?? item.timeSlot}: ${item.title}`,
      `  ${item.detail}`,
      `  ${t(language, 'impactLabel')}: ${item.impactNote}`
    );
  }
}

function appendHacksAndAlternatives(
  lines: string[],
  plan: PlanResponse,
  language: LanguageCode
): void {
  lines.push('', `[${t(language, 'indoorHacksHeading')}]`);
  for (const hack of plan.indoorHacks) {
    lines.push(
      `- ${hack.title} (${hack.costLevel})`,
      `  ${hack.howTo}`,
      `  ${t(language, 'estimatedBenefitLabel')}: ${hack.estimatedBenefit}`
    );
  }
  lines.push('', `[${t(language, 'alternativesHeading')}]`);
  for (const alt of plan.alternatives) {
    const impactLine =
      alt.co2SavedKgPerMonth > 0
        ? `~${alt.pm25ReductionPct}% PM2.5, ~${alt.co2SavedKgPerMonth} kg CO2/mo`
        : `~${alt.pm25ReductionPct}% PM2.5 (${t(language, 'co2Pm25Only')})`;
    lines.push(`- ${alt.current} -> ${alt.swap}`, `  ${alt.why}`, `  ${impactLine}`);
  }
}

export function formatPlanAsText(plan: PlanResponse, language: LanguageCode): string {
  const category = getAqiCategory(plan.aqi.aqi);
  const sourceLabel = formatAqiSourceLabel(plan.aqi, language);
  const generatorLabel =
    plan.generatedBy === 'gemini'
      ? t(language, 'generatedByGemini')
      : t(language, 'generatedByRules');

  const lines: string[] = [
    `${t(language, 'brandName')} — ${t(language, 'dashboardHeading')}`,
    `${plan.aqi.city}: AQI ${plan.aqi.aqi} (${category.label[language]}) · ${t(language, 'dominantPollutantLabel')}: ${plan.aqi.dominantPollutant}`,
    `${sourceLabel} · ${generatorLabel}`,
    '',
    plan.summary,
    '',
    `[${t(language, 'healthAdvisoryHeading')}]`,
    plan.healthAdvisory,
    '',
    `[${t(language, 'maskGuidanceHeading')}]`,
    plan.maskGuidance,
  ];

  appendRoutineLines(lines, plan, language);
  appendHacksAndAlternatives(lines, plan, language);

  if (plan.communityActions && plan.communityActions.length > 0) {
    lines.push('', `[${t(language, 'communityHeading')}]`);
    for (const action of plan.communityActions) {
      lines.push(
        `- ${action.title} (${action.who.toUpperCase()} · ${action.effort})`,
        `  ${action.howTo}`,
        `  ${t(language, 'communityImpactLabel')}: ${action.estimatedImpact}`
      );
    }
  }

  lines.push('', plan.disclaimer);
  return lines.join('\n');
}
