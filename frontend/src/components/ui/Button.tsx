import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'surface';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 font-semibold active:scale-[0.98] transition-transform disabled:opacity-60',
  secondary:
    'border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 font-medium transition-colors',
  surface:
    'border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] hover:border-teal-600/60 dark:hover:border-teal-400/60 text-slate-800 dark:text-slate-100 font-semibold transition-colors disabled:opacity-45',
};

export function Button({
  variant = 'surface',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      {...rest}
      className={`min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl text-sm text-center sm:whitespace-nowrap cursor-pointer disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
