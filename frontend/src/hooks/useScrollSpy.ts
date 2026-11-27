import { useEffect, useState } from 'react';

const SPY_SECTION_IDS = [
  'how-it-works',
  'profile',
  'dashboard',
  'simulator',
  'chat',
] as const;

export type NavSectionId = (typeof SPY_SECTION_IDS)[number];

/**
 * Tracks the currently visible page section using ONE shared IntersectionObserver
 * to drive `aria-current="true"` active-link styling in the sticky header.
 */
export function useScrollSpy(refreshKey: string): NavSectionId | null {
  const [activeId, setActiveId] = useState<NavSectionId | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const elements = SPY_SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    );

    if (elements.length === 0) return;

    const visibilityMap = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibilityMap.set(
            entry.target.id,
            entry.isIntersecting ? entry.intersectionRatio : 0
          );
        }

        let bestId: NavSectionId | null = null;
        let bestRatio = 0;

        for (const id of SPY_SECTION_IDS) {
          const ratio = visibilityMap.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (bestId !== null) {
          setActiveId(bestId);
        }
      },
      {
        rootMargin: '-18% 0px -55% 0px',
        threshold: [0, 0.15, 0.35, 0.6],
      }
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [refreshKey]);

  return activeId;
}
