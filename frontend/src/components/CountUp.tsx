import { useCountUpValue } from '../hooks/useCountUpValue';
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

/**
 * Smooth rAF numeric count-up/down display respecting reduced motion.
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
  const displayValue = useCountUpValue(
    value,
    reducedMotion,
    durationMs,
    fromZeroOnMount
  );

  return (
    <span className={className}>
      {prefix}
      {displayValue}
      {suffix}
    </span>
  );
}
