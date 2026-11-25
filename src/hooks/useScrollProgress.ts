import { useEffect } from 'react';

let lastScrollVal = '';
let lastHowVal = '';
let lastTimelineVal = '';

/**
 * Updates scroll progress transforms and section-scoped CSS variables with
 * batched reads followed by batched writes (zero forced layout reflow, zero
 * root-level style invalidation).
 */
export function writeScrollProgressCssVars(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const scrollTop = window.scrollY || root.scrollTop || 0;
  const maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
  const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));

  const progressBar = document.getElementById('saans-scroll-progress-bar');
  const backdrop = document.getElementById('saans-smog-backdrop');
  const howEl = document.getElementById('how-it-works');
  const timelineEl = document.getElementById('routine-timeline');

  // Batch DOM geometry reads first
  const howRect = howEl ? howEl.getBoundingClientRect() : null;
  const timelineRect = timelineEl ? timelineEl.getBoundingClientRect() : null;

  // Batch DOM style writes afterwards
  const scrollStr = progress.toFixed(4);
  if (scrollStr !== lastScrollVal) {
    lastScrollVal = scrollStr;
    if (progressBar) {
      progressBar.style.transform = `scaleX(${scrollStr})`;
    }
    if (backdrop) {
      backdrop.style.setProperty('--scroll', scrollStr);
    }
  }

  if (howEl && howRect) {
    const start = window.innerHeight * 0.88;
    const end = window.innerHeight * 0.35;
    const howRatio = Math.min(
      1,
      Math.max(0, (start - howRect.top) / Math.max(1, start - end))
    );
    const howStr = howRatio.toFixed(4);
    if (howStr !== lastHowVal) {
      lastHowVal = howStr;
      howEl.style.setProperty('--how-progress', howStr);
    }
  }

  if (timelineEl && timelineRect) {
    const start = window.innerHeight * 0.8;
    const total = Math.max(1, timelineRect.height);
    const tlRatio = Math.min(1, Math.max(0, (start - timelineRect.top) / total));
    const tlStr = tlRatio.toFixed(4);
    if (tlStr !== lastTimelineVal) {
      lastTimelineVal = tlStr;
      timelineEl.style.setProperty('--timeline-progress', tlStr);
    }
  }
}

/**
 * Registers a single passive scroll/resize listener throttled via rAF
 * with zero per-frame React state updates.
 */
export function useScrollProgress(reducedMotion: boolean): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (reducedMotion) {
      lastScrollVal = '0';
      lastHowVal = '1';
      lastTimelineVal = '1';
      document
        .getElementById('saans-scroll-progress-bar')
        ?.style.setProperty('transform', 'scaleX(0)');
      document
        .getElementById('saans-smog-backdrop')
        ?.style.setProperty('--scroll', '0');
      document.getElementById('how-it-works')?.style.setProperty('--how-progress', '1');
      document
        .getElementById('routine-timeline')
        ?.style.setProperty('--timeline-progress', '1');
      return;
    }

    let ticking = false;
    const scheduleUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        writeScrollProgressCssVars();
      });
    };

    writeScrollProgressCssVars();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [reducedMotion]);
}
