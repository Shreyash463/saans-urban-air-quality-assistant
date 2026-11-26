import { getAqiCategory } from '../lib/aqi';
import type { LanguageCode } from '../types';
import { AqiCategoryIcon } from './AqiCategoryIcon';

interface AqiCategoryBadgeProps {
  aqi: number;
  language: LanguageCode;
  size?: 'sm' | 'md';
}

/**
 * Accessible CPCB category indicator combining border/surface color,
 * a distinct icon, and explicit text label (never color alone).
 */
export function AqiCategoryBadge({
  aqi,
  language,
  size = 'md',
}: AqiCategoryBadgeProps) {
  const category = getAqiCategory(aqi);
  const sizeClasses =
    size === 'sm' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-3 py-1.5 text-sm gap-2';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-lg border whitespace-nowrap ${sizeClasses} ${category.badgeClasses}`}
    >
      <AqiCategoryIcon
        icon={category.icon}
        className={size === 'sm' ? 'w-3.5 h-3.5 shrink-0' : 'w-4 h-4 shrink-0'}
      />
      <span>{category.label[language]}</span>
    </span>
  );
}
