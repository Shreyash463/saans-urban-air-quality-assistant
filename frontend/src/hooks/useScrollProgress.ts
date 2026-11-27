import { useEffect, useRef } from 'react';

interface ScrollProgressCache {
  scroll: string;
  how: string;
  timeline: string;
}

function updateProgressBar(progress: number, cache: ScrollProgressCache): void {
  const scrollStr = progress.toFixed(4);
  if (scrollStr === cache.scroll) return;
  cache.scroll = scrollStr;
  const bar = document.getElementById('saans-scroll-progress-bar');
  const backdrop = document.getElementById('saans-smog-backdrop');
  if (bar) bar.style.transform = `scaleX(${scrollStr})`;
  if (backdrop) backdrop.style.setProperty('--scroll', scrollStr);
}

function updateSectionCssVar(
  elId: string,
  varName: string,
  prev: string,
  ratioFn: (r: DOMRect) => number
): string {
  const el = document.getElementById(elId);
  if (!el) return prev;
  const next = Math.min(1, Math.max(0, ratioFn(el.getBoundingClientRect()))).toFixed(4);
  if (next !== prev) el.style.setProperty(varName, next);
  return next;
}

export function writeScrollProgressCssVars(
  cache: ScrollProgressCache = { scroll: '', how: '', timeline: '' }
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const root = document.documentElement;
  const scrollTop = window.scrollY || root.scrollTop || 0;
  const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);

  updateProgressBar(Math.min(1, Math.max(0, scrollTop / maxScroll)), cache);
  cache.how = updateSectionCssVar('how-it-works', '--how-progress', cache.how, (r) => {
    const start = window.innerHeight * 0.88;
    return (start - r.top) / Math.max(1, start - window.innerHeight * 0.35);
  });
  cache.timeline = updateSectionCssVar(
    'routine-timeline',
    '--timeline-progress',
    cache.timeline,
    (r) => (window.innerHeight * 0.8 - r.top) / Math.max(1, r.height)
  );
}

const REDUCED_VARS: readonly [string, string, string][] = [
  ['saans-scroll-progress-bar', 'transform', 'scaleX(0)'],
  ['saans-smog-backdrop', '--scroll', '0'],
  ['how-it-works', '--how-progress', '1'],
  ['routine-timeline', '--timeline-progress', '1'],
];

function resetReducedMotionVars(cache: ScrollProgressCache): void {
  cache.scroll = '0';
  cache.how = '1';
  cache.timeline = '1';
  for (const [id, prop, val] of REDUCED_VARS) {
    document.getElementById(id)?.style.setProperty(prop, val);
  }
}

export function useScrollProgress(reducedMotion: boolean): void {
  const cacheRef = useRef<ScrollProgressCache>({ scroll: '', how: '', timeline: '' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cache = cacheRef.current;
    if (reducedMotion) {
      resetReducedMotionVars(cache);
      return;
    }
    let ticking = false;
    const schedule = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        writeScrollProgressCssVars(cache);
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
