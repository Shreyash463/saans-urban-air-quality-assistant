import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import type { LanguageCode } from '../types';

interface DemoReadingInfoProps {
  language: LanguageCode;
}

/**
 * Accessible label + keyboard-operable popover explaining that demo readings
 * are sample values until the live backend is connected.
 */
export function DemoReadingInfo({ language }: DemoReadingInfoProps) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1.5">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
        {t(language, 'sampleReadingForDemo')}
      </span>
      <button
        type="button"
        aria-label={t(language, 'demoInfoTooltipLabel')}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((prev) => !prev)}
        className="min-w-[36px] min-h-[36px] -my-1.5 inline-flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
      >
        <Info className="w-4 h-4 shrink-0" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={popoverId}
          role="tooltip"
          className="absolute right-0 top-full mt-2 z-30 w-64 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] p-3 text-sm text-slate-700 dark:text-slate-200 shadow-lg leading-snug"
        >
          {t(language, 'demoInfoTooltipText')}
        </div>
      ) : null}
    </div>
  );
}
