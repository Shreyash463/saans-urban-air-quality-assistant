import { useEffect } from 'react';
import {
  REVEAL_MAX_STAGGER_ITEMS,
  REVEAL_ROOT_MARGIN,
  REVEAL_STAGGER_STEP_MS,
} from '../lib/motion';

/**
 * App-wide scroll reveal hook powered by a SINGLE shared IntersectionObserver
 * plus a MutationObserver so lazy-loaded sections are revealed reliably and
 * never remain stuck at opacity 0.
 */
export function useReveal(reducedMotion: boolean, refreshKey: string): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;

    const assignStaggerDelays = () => {
      const groups = document.querySelectorAll<HTMLElement>('[data-reveal-group]');
      for (const group of groups) {
        const items = group.querySelectorAll<HTMLElement>('[data-reveal]');
        items.forEach((item, index) => {
          if (
            !item.dataset.revealDelay &&
            !item.style.getPropertyValue('--reveal-delay')
          ) {
            const cappedIndex = Math.min(index, REVEAL_MAX_STAGGER_ITEMS - 1);
            item.style.setProperty(
              '--reveal-delay',
              `${cappedIndex * REVEAL_STAGGER_STEP_MS}ms`
            );
          }
        });
      }

      const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
      for (const el of targets) {
        if (el.dataset.revealDelay && !el.style.getPropertyValue('--reveal-delay')) {
          el.style.setProperty('--reveal-delay', `${el.dataset.revealDelay}ms`);
        }
      }
      return Array.from(targets);
    };

    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      root.classList.remove('js-anim');
      const targets = assignStaggerDelays();
      for (const el of targets) {
        el.classList.add('is-revealed');
      }
      return;
    }

    root.classList.add('js-anim');

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add('is-revealed');
            observer.unobserve(el);
          }
        }
      },
      {
        rootMargin: REVEAL_ROOT_MARGIN,
        threshold: 0.02,
      }
    );

    const scanAndObserve = () => {
      const targets = assignStaggerDelays();
      const viewportLimit = window.innerHeight * 1.05;
      for (const el of targets) {
        if (el.classList.contains('is-revealed')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportLimit) {
          el.classList.add('is-revealed');
        } else {
          observer.observe(el);
        }
      }
    };

    scanAndObserve();

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              if (mutation.addedNodes.length > 0) {
                scanAndObserve();
                break;
              }
            }
          })
        : null;

    mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver?.disconnect();
      observer.disconnect();
    };
  }, [reducedMotion, refreshKey]);
}
