import { useCallback, useEffect } from 'react';
import { HEADER_SCROLL_OFFSET_PX } from '../lib/motion';

/**
 * Native scroll-to-section navigation without continuous background rAF loops.
 * Honors reduced motion cleanly and keeps keyboard navigation intact.
 */
export function useSmoothScroll(reducedMotion: boolean): {
  scrollToElement: (target: string | HTMLElement) => void;
} {
  const scrollToTarget = useCallback(
    (element: HTMLElement) => {
      const top =
        element.getBoundingClientRect().top + window.scrollY - HEADER_SCROLL_OFFSET_PX;
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({
          top: Math.max(0, top),
          behavior: reducedMotion ? 'auto' : 'smooth',
        });
      } else {
        element.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    },
    [reducedMotion]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAnchorClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href^="#"]') as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href || href === '#' || href === '#main-content') return;

      const dest = document.querySelector<HTMLElement>(href);
      if (!dest) return;

      event.preventDefault();
      scrollToTarget(dest);
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState(null, '', href);
      }
    };

    document.addEventListener('click', handleAnchorClick);
    return () => {
      document.removeEventListener('click', handleAnchorClick);
    };
  }, [scrollToTarget]);

  const scrollToElement = useCallback(
    (target: string | HTMLElement) => {
      const element =
        typeof target === 'string'
          ? document.querySelector<HTMLElement>(target)
          : target;
      if (!element) return;
      scrollToTarget(element);
    },
    [scrollToTarget]
  );

  return { scrollToElement };
}
