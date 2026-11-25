import { getAqiCategory } from './aqi';
import { t } from './i18n';
import type { AirQualityReading, LanguageCode, PlanResponse } from '../types';

/**
 * Formats an ISO 8601 timestamp into 24-hour IST (HH:MM IST), returning an
 * empty string when absent or unparseable.
 */
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

/**
 * Builds an honest source badge label for live Open-Meteo vs demo readings.
 */
export function formatAqiSourceLabel(
  reading: AirQualityReading,
  language: LanguageCode
): string {
  if (reading.source === 'demo') {
    return t(language, 'sampleReadingForDemo');
  }
  const timeIst = formatAqiTimestampIst(reading.updatedAt);
  if (language === 'hi') {
    return timeIst ? `लाइव · अपडेट ${timeIst} (Open-Meteo)` : 'लाइव · Open-Meteo';
  }
  return timeIst ? `Live · updated ${timeIst} (Open-Meteo)` : 'Live · Open-Meteo';
}

/**
 * Serializes a personalized Saans clean-air plan into clean plain text for
 * downloading (.txt) or copying to the clipboard.
 */
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
    '',
    `[${t(language, 'routineHeading')}]`,
  ];

  const slotLabels: Record<string, string> = {
    morning: t(language, 'slotMorning'),
    midday: t(language, 'slotMidday'),
    evening: t(language, 'slotEvening'),
    night: t(language, 'slotNight'),
  };

  for (const item of plan.routine) {
    lines.push(`- ${slotLabels[item.timeSlot] ?? item.timeSlot}: ${item.title}`);
    lines.push(`  ${item.detail}`);
    lines.push(`  ${t(language, 'impactLabel')}: ${item.impactNote}`);
  }

  lines.push('', `[${t(language, 'indoorHacksHeading')}]`);
  for (const hack of plan.indoorHacks) {
    lines.push(`- ${hack.title} (${hack.costLevel})`);
    lines.push(`  ${hack.howTo}`);
    lines.push(`  ${t(language, 'estimatedBenefitLabel')}: ${hack.estimatedBenefit}`);
  }

  lines.push('', `[${t(language, 'alternativesHeading')}]`);
  for (const alt of plan.alternatives) {
    const impactLine =
      alt.co2SavedKgPerMonth > 0
        ? `~${alt.pm25ReductionPct}% PM2.5, ~${alt.co2SavedKgPerMonth} kg CO2/mo`
        : `~${alt.pm25ReductionPct}% PM2.5 (${t(language, 'co2Pm25Only')})`;
    lines.push(`- ${alt.current} -> ${alt.swap}`);
    lines.push(`  ${alt.why}`);
    lines.push(`  ${impactLine}`);
  }

  lines.push('', plan.disclaimer);
  return lines.join('\n');
}
