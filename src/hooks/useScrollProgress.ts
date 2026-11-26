import { useEffect } from 'react';

let lastScrollVal = '';
let lastHowVal = '';
let lastTimelineVal = '';

function updateProgressBar(progress: number): void {
  const scrollStr = progress.toFixed(4);
  if (scrollStr === lastScrollVal) return;
  lastScrollVal = scrollStr;
  const bar = document.getElementById('saans-scroll-progress-bar');
  const backdrop = document.getElementById('saans-smog-backdrop');
  if (bar) bar.style.transform = `scaleX(${scrollStr})`;
  if (backdrop) backdrop.style.setProperty('--scroll', scrollStr);
}

function updateSectionCssVar(
  el: HTMLElement | null,
  rect: DOMRect | null,
  varName: string,
  prev: string,
  ratioFn: (r: DOMRect) => number
): string {
  if (!el || !rect) return prev;
  const next = Math.min(1, Math.max(0, ratioFn(rect))).toFixed(4);
  if (next !== prev) el.style.setProperty(varName, next);
  return next;
}

export function writeScrollProgressCssVars(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const scrollTop = window.scrollY || root.scrollTop || 0;
  const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);

  const howEl = document.getElementById('how-it-works');
  const timelineEl = document.getElementById('routine-timeline');
  const howRect = howEl ? howEl.getBoundingClientRect() : null;
  const timelineRect = timelineEl ? timelineEl.getBoundingClientRect() : null;

  updateProgressBar(Math.min(1, Math.max(0, scrollTop / maxScroll)));
  lastHowVal = updateSectionCssVar(
    howEl,
    howRect,
    '--how-progress',
    lastHowVal,
    (r) => {
      const start = window.innerHeight * 0.88;
      const end = window.innerHeight * 0.35;
      return (start - r.top) / Math.max(1, start - end);
    }
  );
  lastTimelineVal = updateSectionCssVar(
    timelineEl,
    timelineRect,
    '--timeline-progress',
    lastTimelineVal,
    (r) => (window.innerHeight * 0.8 - r.top) / Math.max(1, r.height)
  );
}

function resetReducedMotionVars(): void {
  lastScrollVal = '0';
  lastHowVal = '1';
  lastTimelineVal = '1';
  document
    .getElementById('saans-scroll-progress-bar')
    ?.style.setProperty('transform', 'scaleX(0)');
  document.getElementById('saans-smog-backdrop')?.style.setProperty('--scroll', '0');
  document.getElementById('how-it-works')?.style.setProperty('--how-progress', '1');
  document
    .getElementById('routine-timeline')
    ?.style.setProperty('--timeline-progress', '1');
}

export function useScrollProgress(reducedMotion: boolean): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (reducedMotion) {
      resetReducedMotionVars();
      return;
    }
    let ticking = false;
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        writeScrollProgressCssVars();
      });
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [reducedMotion]);
}
