import { memo } from 'react';
import { Badge } from './ui/Badge';

interface ToggleSwitchProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onToggle: () => void;
  metaText?: string;
  disabled?: boolean;
  badgeText?: string;
  badgeTone?: 'recommended' | 'done';
}

function resolveCardClasses(disabled: boolean, checked: boolean): string {
  if (disabled) {
    return 'bg-slate-100/90 border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 opacity-90 cursor-default';
  }
  return checked
    ? 'bg-teal-50/80 border-teal-600/60 dark:bg-teal-950/40 dark:border-teal-400/60 shadow-[0_0_0_1px_rgba(13,148,136,0.2)] dark:shadow-[0_0_0_1px_rgba(45,212,191,0.25)] cursor-pointer'
    : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-[#131C2E] dark:border-slate-800 dark:hover:border-slate-700 cursor-pointer';
}

function SwitchTrack({ checked, disabled }: { checked: boolean; disabled: boolean }) {
  const trackColor = !checked
    ? 'bg-slate-200 border-slate-300 dark:bg-slate-700 dark:border-slate-600'
    : disabled
      ? 'bg-emerald-600 border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500'
      : 'bg-teal-600 border-teal-600 dark:bg-teal-400 dark:border-teal-400';
  const knobClass = checked
    ? 'translate-x-5 bg-white dark:bg-slate-950'
    : 'translate-x-1 bg-white dark:bg-slate-200';

  return (
    <span
      aria-hidden="true"
      className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 ${trackColor}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ease-out ${knobClass}`}
      />
    </span>
  );
}

function ToggleSwitchBody({
  badgeText,
  badgeTone,
  label,
  description,
  descId,
  metaText,
}: {
  badgeText?: string;
  badgeTone: 'recommended' | 'done';
  label: string;
  description?: string;
  descId?: string;
  metaText?: string;
}) {
  return (
    <span className="flex-1 min-w-0">
      {badgeText ? (
        <Badge tone={badgeTone === 'done' ? 'emerald' : 'teal'} className="mb-2">
          {badgeText}
        </Badge>
      ) : null}
      <span className="block text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
        {label}
      </span>
      {description ? (
        <span
          id={descId}
          className="mt-1 block text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
        >
          {description}
        </span>
      ) : null}
      {metaText ? (
        <span className="mt-1.5 block text-sm font-medium text-teal-800 dark:text-teal-300 tabular-nums">
          {metaText}
        </span>
      ) : null}
    </span>
  );
}

export const ToggleSwitch = memo(function ToggleSwitch(props: ToggleSwitchProps) {
  const {
    id,
    label,
    description,
    checked,
    onToggle,
    metaText,
    disabled = false,
    badgeText,
    badgeTone = 'recommended',
  } = props;
  const descId = description ? `${id}-desc` : undefined;
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      aria-describedby={descId}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={`saans-theme-surface group w-full min-h-[60px] flex items-start justify-between gap-4 p-4 rounded-2xl border text-left ${resolveCardClasses(disabled, checked)}`}
    >
      <ToggleSwitchBody
        badgeText={badgeText}
        badgeTone={badgeTone}
        label={label}
        description={description}
        descId={descId}
        metaText={metaText}
      />
      <SwitchTrack checked={checked} disabled={disabled} />
    </button>
  );
});
