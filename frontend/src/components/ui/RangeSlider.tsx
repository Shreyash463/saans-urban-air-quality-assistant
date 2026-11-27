interface RangeSliderProps {
  id: string;
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (next: number) => void;
}

export function RangeSlider({
  id,
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  disabled = false,
  ariaLabel,
  onChange,
}: RangeSliderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          {label}
        </label>
        <span className="font-mono text-sm font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
          {valueLabel}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={valueLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="saans-slider w-full min-h-[28px] py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
}
