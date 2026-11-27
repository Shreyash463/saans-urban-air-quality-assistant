import type { AqiCategoryInfo } from '../lib/aqi';

const RADIUS = 84;
const STROKE_WIDTH = 14;
const CENTER = 110;
const START_ANGLE_DEG = 140;
const SWEEP_ANGLE_DEG = 260;
const ARC_CIRCUMFERENCE = (2 * Math.PI * RADIUS * SWEEP_ANGLE_DEG) / 360;
const CPCB_TICK_VALUES = [0, 100, 200, 300, 400, 500] as const;

function polarToCartesian(cx: number, cy: number, radius: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

const TRACK_PATH = describeArc(
  CENTER,
  CENTER,
  RADIUS,
  START_ANGLE_DEG,
  START_ANGLE_DEG + SWEEP_ANGLE_DEG
);

function GaugeTicksAndLabels() {
  return (
    <>
      {CPCB_TICK_VALUES.map((tick) => {
        const angle = START_ANGLE_DEG + (tick / 500) * SWEEP_ANGLE_DEG;
        const inner = polarToCartesian(CENTER, CENTER, RADIUS + 11, angle);
        const outer = polarToCartesian(CENTER, CENTER, RADIUS + 16, angle);
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
      <text
        x="38"
        y="184"
        textAnchor="middle"
        className="font-mono fill-slate-600 dark:fill-slate-300 text-[11px]"
      >
        0
      </text>
      <text
        x="182"
        y="184"
        textAnchor="middle"
        className="font-mono fill-slate-600 dark:fill-slate-300 text-[11px]"
      >
        500
      </text>
    </>
  );
}

function GaugeCenterReadout({
  displayAqi,
  city,
}: {
  displayAqi: number;
  city: string;
}) {
  return (
    <>
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
        className="font-mono tabular-nums fill-slate-900 dark:fill-slate-50 text-[40px] font-semibold"
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
    </>
  );
}

interface AqiGaugeSvgProps {
  displayAqi: number;
  ratio: number;
  city: string;
  category: AqiCategoryInfo;
}

export function AqiGaugeSvg({ displayAqi, ratio, city, category }: AqiGaugeSvgProps) {
  const dashOffset = ARC_CIRCUMFERENCE * (1 - ratio);
  const pos = polarToCartesian(
    CENTER,
    CENTER,
    RADIUS,
    START_ANGLE_DEG + SWEEP_ANGLE_DEG * ratio
  );
  return (
    <svg
      viewBox="0 0 220 196"
      className="w-full h-full overflow-visible"
      aria-hidden="true"
    >
      <circle
        cx={CENTER}
        cy={CENTER}
        r={62}
        strokeWidth="1"
        className="fill-slate-100/70 dark:fill-slate-900/70 stroke-slate-200 dark:stroke-slate-800"
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
      <GaugeTicksAndLabels />
      <circle
        cx={pos.x}
        cy={pos.y}
        r="6"
        fill={category.strokeColor}
        strokeWidth="2.5"
        className="stroke-white dark:stroke-[#0B1220]"
      />
      <GaugeCenterReadout displayAqi={displayAqi} city={city} />
    </svg>
  );
}
