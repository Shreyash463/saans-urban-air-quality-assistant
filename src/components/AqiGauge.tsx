import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  clampAqi,
  getAqiAriaLabel,
  getAqiCategory,
  getAqiGaugeRatio,
} from '../lib/aqi';
import { GAUGE_COUNTUP_DURATION_MS } from '../lib/motion';
import type { LanguageCode } from '../types';
import { AqiCategoryBadge } from './AqiCategoryBadge';

interface AqiGaugeProps {
  aqi: number;
  city: string;
  language: LanguageCode;
  size?: 'hero' | 'card';
  caption?: string;
  animateOnMount?: boolean;
}

const RADIUS = 84;
const STROKE_WIDTH = 14;
const CENTER = 110;
const START_ANGLE_DEG = 140;
const SWEEP_ANGLE_DEG = 260;

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number
): { x: number; y: number } {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const ARC_CIRCUMFERENCE = (2 * Math.PI * RADIUS * SWEEP_ANGLE_DEG) / 360;
const TRACK_PATH = describeArc(
  CENTER,
  CENTER,
  RADIUS,
  START_ANGLE_DEG,
  START_ANGLE_DEG + SWEEP_ANGLE_DEG
);

const CPCB_TICK_VALUES = [0, 100, 200, 300, 400, 500] as const;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Plain-SVG semi-circular CPCB AQI gauge with an ease-out sweep and number
 * count-up on first view, instant final value under reduced motion, and a
 * screen-reader aria-label always announcing the true final AQI.
 */
export const AqiGauge = memo(function AqiGauge({
  aqi,
  city,
  language,
  size = 'hero',
  caption,
  animateOnMount = false,
}: AqiGaugeProps) {
  const reducedMotion = useReducedMotion();
  const clamped = clampAqi(aqi);
  const category = getAqiCategory(clamped);
  const ariaLabel = getAqiAriaLabel(clamped, language);

  const [displayAqi, setDisplayAqi] = useState<number>(() =>
    reducedMotion || !animateOnMount ? clamped : 0
  );
  const currentRef = useRef<number>(displayAqi);

  useEffect(() => {
    if (reducedMotion || typeof window === 'undefined') {
      currentRef.current = clamped;
      setDisplayAqi(clamped);
      return;
    }

    const startVal = currentRef.current;
    if (startVal === clamped) return;

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / GAUGE_COUNTUP_DURATION_MS);
      const next = Math.round(startVal + (clamped - startVal) * easeOutCubic(progress));
      currentRef.current = next;
      setDisplayAqi(next);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [clamped, reducedMotion]);

  const ratio = getAqiGaugeRatio(displayAqi);
  const dashOffset = ARC_CIRCUMFERENCE * (1 - ratio);
  const markerAngle = START_ANGLE_DEG + SWEEP_ANGLE_DEG * ratio;
  const markerPos = polarToCartesian(CENTER, CENTER, RADIUS, markerAngle);
  const svgWidthClass = size === 'hero' ? 'w-56 sm:w-64' : 'w-48 sm:w-52';

  return (
    <div className="flex flex-col items-center">
      <div
        role="img"
        aria-label={ariaLabel}
        className={`relative ${svgWidthClass} aspect-[220/196] flex items-center justify-center`}
      >
        <svg
          viewBox="0 0 220 196"
          className="w-full h-full overflow-visible"
          aria-hidden="true"
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={62}
            className="fill-slate-100/70 dark:fill-slate-900/70 stroke-slate-200 dark:stroke-slate-800"
            strokeWidth="1"
          />

          <path
            d={TRACK_PATH}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            className="stroke-slate-200 dark:stroke-slate-800"
          />

          <path
            d={TRACK_PATH}
            fill="none"
            stroke={category.strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ARC_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />

          {CPCB_TICK_VALUES.map((tick) => {
            const tickAngle = START_ANGLE_DEG + (tick / 500) * SWEEP_ANGLE_DEG;
            const inner = polarToCartesian(CENTER, CENTER, RADIUS + 11, tickAngle);
            const outer = polarToCartesian(CENTER, CENTER, RADIUS + 16, tickAngle);
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-slate-400/80 dark:stroke-slate-500/80"
              />
            );
          })}

          <circle
            cx={markerPos.x}
            cy={markerPos.y}
            r="6"
            fill={category.strokeColor}
            className="stroke-white dark:stroke-[#0B1220]"
            strokeWidth="2.5"
          />

          <text
            x={CENTER}
            y={CENTER - 8}
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
          >
            CPCB AQI
          </text>
          <text
            x={CENTER}
            y={CENTER + 28}
            textAnchor="middle"
            style={{
              fontFamily: 'var(--font-mono)',
              fontVariantNumeric: 'tabular-nums',
            }}
            className="fill-slate-900 dark:fill-slate-50 text-[40px] font-semibold"
          >
            {displayAqi}
          </text>
          <text
            x={CENTER}
            y={CENTER + 48}
            textAnchor="middle"
            className="fill-slate-700 dark:fill-slate-200 text-[13px] font-medium"
          >
            {city}
          </text>

          <text
            x="38"
            y="184"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)' }}
            className="fill-slate-600 dark:fill-slate-300 text-[11px]"
          >
            0
          </text>
          <text
            x="182"
            y="184"
            textAnchor="middle"
            style={{ fontFamily: 'var(--font-mono)' }}
            className="fill-slate-600 dark:fill-slate-300 text-[11px]"
          >
            500
          </text>
        </svg>
      </div>

      <div className="mt-2 flex flex-col items-center gap-1.5 text-center">
        <AqiCategoryBadge aqi={clamped} language={language} />
        {caption ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-[300px] text-balance">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
});
