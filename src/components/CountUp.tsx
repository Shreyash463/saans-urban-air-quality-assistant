import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { GAUGE_COUNTUP_DURATION_MS } from '../lib/motion';

interface CountUpProps {
  value: number;
  durationMs?: number;
  fromZeroOnMount?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
}

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/**
 * Smooth rAF numeric count-up/down display.
 * Shows the final value instantaneously when reduced motion is enabled.
 */
export function CountUp({
  value,
  durationMs = GAUGE_COUNTUP_DURATION_MS,
  fromZeroOnMount = false,
  prefix = '',
  suffix = '',
  className,
}: CountUpProps) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(() =>
    reducedMotion || !fromZeroOnMount ? value : 0
  );
  const currentRef = useRef<number>(displayValue);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      currentRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = currentRef.current;
    if (startValue === value) {
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const ratio = Math.min(1, elapsed / Math.max(1, durationMs));
      const eased = easeOutCubic(ratio);
      const next = Math.round(startValue + (value - startValue) * eased);
      currentRef.current = next;
      setDisplayValue(next);

      if (ratio < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [value, durationMs, reducedMotion]);

  return (
    <span className={className}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}
