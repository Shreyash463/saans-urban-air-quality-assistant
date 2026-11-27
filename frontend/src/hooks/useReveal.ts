import { useEffect } from 'react';
import {
  REVEAL_MAX_STAGGER_ITEMS,
  REVEAL_ROOT_MARGIN,
  REVEAL_STAGGER_STEP_MS,
} from '../lib/motion';

function assignStaggerDelays(): HTMLElement[] {
  const groups = document.querySelectorAll<HTMLElement>('[data-reveal-group]');
  for (const group of groups) {
    const items = group.querySelectorAll<HTMLElement>('[data-reveal]');
    items.forEach((item, index) => {
      if (!item.dataset.revealDelay && !item.style.getPropertyValue('--reveal-delay')) {
        const capped = Math.min(index, REVEAL_MAX_STAGGER_ITEMS - 1);
        item.style.setProperty(
          '--reveal-delay',
          `${capped * REVEAL_STAGGER_STEP_MS}ms`
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
}

function createRevealObserver(): IntersectionObserver {
  return new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add('is-revealed');
        obs.unobserve(entry.target);
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN, threshold: 0.02 }
  );
}

function observePendingTargets(observer: IntersectionObserver): void {
  const viewportLimit = window.innerHeight * 1.05;
  for (const el of assignStaggerDelays()) {
    if (el.classList.contains('is-revealed')) continue;
    if (el.getBoundingClientRect().top < viewportLimit) {
      el.classList.add('is-revealed');
    } else {
      observer.observe(el);
    }
  }
}

export function useReveal(reducedMotion: boolean, refreshKey: string): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      root.classList.remove('js-anim');
      for (const el of assignStaggerDelays()) el.classList.add('is-revealed');
      return;
    }

    root.classList.add('js-anim');
    const observer = createRevealObserver();
    observePendingTargets(observer);

    const mutationObserver =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver((mutations) => {
            if (mutations.some((m) => m.addedNodes.length > 0)) {
              observePendingTargets(observer);
            }
          })
        : null;
    mutationObserver?.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver?.disconnect();
      observer.disconnect();
    };
  }, [reducedMotion, refreshKey]);
}
