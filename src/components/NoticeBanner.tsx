import { Info, X } from 'lucide-react';

interface NoticeBannerProps {
  message: string;
  onDismiss: () => void;
  tone?: 'info' | 'warning';
}

/**
 * Non-blocking status banner announced politely to screen readers.
 */
export function NoticeBanner({
  message,
  onDismiss,
  tone = 'warning',
}: NoticeBannerProps) {
  const toneClasses =
    tone === 'warning'
      ? 'bg-amber-50 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-700/70 dark:text-amber-100'
      : 'bg-teal-50 border-teal-300 text-teal-950 dark:bg-teal-950/50 dark:border-teal-700/70 dark:text-teal-100';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`no-print rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 text-sm ${toneClasses}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
        <p className="leading-snug">{message}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className="min-w-[44px] min-h-[44px] -mr-2 inline-flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
