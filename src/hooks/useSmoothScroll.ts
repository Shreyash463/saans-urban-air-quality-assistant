import { useCallback, useEffect } from 'react';
import { HEADER_SCROLL_OFFSET_PX } from '../lib/motion';

function scrollElementIntoView(element: HTMLElement, reducedMotion: boolean): void {
  const top =
    element.getBoundingClientRect().top + window.scrollY - HEADER_SCROLL_OFFSET_PX;
  const behavior = reducedMotion ? 'auto' : 'smooth';
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: Math.max(0, top), behavior });
  } else {
    element.scrollIntoView({ behavior, block: 'start' });
  }
}

export function useSmoothScroll(reducedMotion: boolean): {
  scrollToElement: (target: string | HTMLElement) => void;
} {
  const scrollToTarget = useCallback(
    (element: HTMLElement) => scrollElementIntoView(element, reducedMotion),
    [reducedMotion]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest('a[href^="#"]');
      const href = anchor?.getAttribute('href');
      if (!href || href === '#' || href === '#main-content') return;
      const dest = document.querySelector<HTMLElement>(href);
      if (!dest) return;
      event.preventDefault();
      scrollToTarget(dest);
      window.history?.pushState?.(null, '', href);
    };
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, [scrollToTarget]);

  const scrollToElement = useCallback(
    (target: string | HTMLElement) => {
      const el =
        typeof target === 'string'
          ? document.querySelector<HTMLElement>(target)
          : target;
      if (el) scrollToTarget(el);
    },
    [scrollToTarget]
  );

  return { scrollToElement };
}
