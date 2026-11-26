import type { LucideIcon } from 'lucide-react';

const CARD_SELECTED =
  'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100';
const CARD_IDLE =
  'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200';

export function RadioCard<T extends string>({
  name,
  value,
  checked,
  label,
  icon: Icon,
  minHeightClass = 'min-h-[56px]',
  layoutClass = 'flex items-center gap-2.5',
  onSelect,
}: {
  name: string;
  value: T;
  checked: boolean;
  label: string;
  icon?: LucideIcon;
  minHeightClass?: string;
  layoutClass?: string;
  onSelect: (val: T) => void;
}) {
  return (
    <label
      className={`${minHeightClass} p-3 rounded-xl border cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${layoutClass} ${
        checked ? CARD_SELECTED : CARD_IDLE
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {Icon ? (
        <Icon
          className={`w-4 h-4 shrink-0 ${
            checked
              ? 'text-teal-700 dark:text-teal-300'
              : 'text-slate-600 dark:text-slate-300'
          }`}
          aria-hidden="true"
        />
      ) : null}
      <span className="text-sm font-medium leading-tight">{label}</span>
    </label>
  );
}
