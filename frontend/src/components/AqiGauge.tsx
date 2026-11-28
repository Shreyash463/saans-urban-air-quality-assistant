import { memo } from 'react';
import { useCountUpValue } from '../hooks/useCountUpValue';
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
import { AqiGaugeSvg } from './AqiGaugeSvg';

interface AqiGaugeProps {
  aqi: number;
  city: string;
  language: LanguageCode;
  size?: 'hero' | 'card';
  caption?: string;
  animateOnMount?: boolean;
}

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
  const displayAqi = useCountUpValue(
    clamped,
    reducedMotion,
    GAUGE_COUNTUP_DURATION_MS,
    animateOnMount
  );
  const svgWidthClass = size === 'hero' ? 'w-56 sm:w-64' : 'w-48 sm:w-52';

  return (
    <div className="flex flex-col items-center">
      <div
        role="img"
        aria-label={getAqiAriaLabel(clamped, language)}
        className={`relative ${svgWidthClass} aspect-[220/196] flex items-center justify-center`}
      >
        <AqiGaugeSvg
          displayAqi={displayAqi}
          ratio={getAqiGaugeRatio(displayAqi)}
          city={city}
          category={category}
        />
      </div>
      <div className="mt-2 flex flex-col items-center gap-1.5 text-center">
        <AqiCategoryBadge aqi={clamped} language={language} />
        {caption ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-[300px] min-h-[2.75rem] flex items-center justify-center text-balance">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
});
