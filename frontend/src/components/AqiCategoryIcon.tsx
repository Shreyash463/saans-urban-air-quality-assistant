import {
  AlertTriangle,
  CheckCircle2,
  CloudFog,
  CloudSun,
  ShieldAlert,
  Wind,
} from 'lucide-react';
import type { AqiIconName } from '../lib/aqi';

interface AqiCategoryIconProps {
  icon: AqiIconName;
  className?: string;
}

/**
 * Renders the distinct geometric icon paired with each Indian CPCB AQI category
 * so air quality severity is never communicated by color alone.
 */
export function AqiCategoryIcon({
  icon,
  className = 'w-4 h-4 shrink-0',
}: AqiCategoryIconProps) {
  switch (icon) {
    case 'check-circle':
      return <CheckCircle2 className={className} aria-hidden="true" />;
    case 'wind':
      return <Wind className={className} aria-hidden="true" />;
    case 'cloud-sun':
      return <CloudSun className={className} aria-hidden="true" />;
    case 'cloud-fog':
      return <CloudFog className={className} aria-hidden="true" />;
    case 'alert-triangle':
      return <AlertTriangle className={className} aria-hidden="true" />;
    case 'shield-alert':
      return <ShieldAlert className={className} aria-hidden="true" />;
  }
}
