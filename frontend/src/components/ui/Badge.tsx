import type { ReactNode } from 'react';

export type BadgeTone = 'teal' | 'emerald' | 'amber' | 'slate';

const TONE_CLASSES: Record<BadgeTone, string> = {
  teal: 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-200',
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  amber:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200',
  slate:
    'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export function Badge({
  tone = 'slate',
  className = '',
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md border sm:whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
