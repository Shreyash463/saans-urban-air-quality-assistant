import { useEffect, useRef, useState } from 'react';
import { GAUGE_COUNTUP_DURATION_MS } from '../lib/motion';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Animates a numeric transition over `durationMs` via rAF, jumping immediately
 * when `reducedMotion` is enabled.
 */
export function useCountUpValue(
  target: number,
  reducedMotion: boolean,
  durationMs: number = GAUGE_COUNTUP_DURATION_MS,
  fromZeroOnMount = false
): number {
  const [display, setDisplay] = useState<number>(() =>
    reducedMotion || !fromZeroOnMount ? target : 0
  );
  const currentRef = useRef<number>(display);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      currentRef.current = target;
      setDisplay(target);
      return;
    }
    const startVal = currentRef.current;
    if (startVal === target) return;

    let rafId = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const ratio = Math.min(1, (now - startTime) / Math.max(1, durationMs));
      const next = Math.round(startVal + (target - startVal) * easeOutCubic(ratio));
      currentRef.current = next;
      setDisplay(next);
      if (ratio < 1) rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [target, durationMs, reducedMotion]);

  return display;
}
