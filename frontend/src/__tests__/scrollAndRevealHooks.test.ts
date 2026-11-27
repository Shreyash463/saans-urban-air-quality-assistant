// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReveal } from '../hooks/useReveal';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useSmoothScroll } from '../hooks/useSmoothScroll';

function createStubObserverClass(
  onCreate: (cb: IntersectionObserverCallback) => void
): typeof IntersectionObserver {
  return class StubIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly scrollMargin = '';
    readonly thresholds: readonly number[] = [];
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
    constructor(callback: IntersectionObserverCallback) {
      onCreate(callback);
    }
  };
}

describe('Scroll spy, intersection reveal, and smooth scroll fallback hooks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useScrollSpy selects highest-visibility section via IntersectionObserver', () => {
    let cb: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      createStubObserverClass((fn) => {
        cb = fn;
      })
    );
    document.body.innerHTML =
      '<section id="how-it-works"></section><section id="profile"></section><section id="simulator"></section>';

    const { result, unmount } = renderHook(() => useScrollSpy('key'));
    act(() => {
      cb?.(
        [
          {
            target: document.getElementById('how-it-works')!,
            isIntersecting: true,
            intersectionRatio: 0.2,
          } as unknown as IntersectionObserverEntry,
          {
            target: document.getElementById('simulator')!,
            isIntersecting: true,
            intersectionRatio: 0.6,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver
      );
    });
    expect(result.current).toBe('simulator');
    unmount();
  });

  it('useReveal animates off-screen elements on intersect and reveals dynamic nodes', async () => {
    let obsCb: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      createStubObserverClass((fn) => {
        obsCb = fn;
      })
    );
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
    document.body.innerHTML = '<div data-reveal id="far">Later</div>';
    const far = document.getElementById('far')!;
    far.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;

    const { unmount } = renderHook(() => useReveal(false, 'en'));
    expect(far.classList.contains('is-revealed')).toBe(false);

    act(() => {
      obsCb?.(
        [{ target: far, isIntersecting: true } as unknown as IntersectionObserverEntry],
        { unobserve: vi.fn() } as unknown as IntersectionObserver
      );
    });
    expect(far.classList.contains('is-revealed')).toBe(true);

    const late = document.createElement('div');
    late.setAttribute('data-reveal', '');
    late.getBoundingClientRect = () => ({ top: 10 }) as DOMRect;
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 10));
    expect(late.classList.contains('is-revealed')).toBe(true);
    unmount();
  });

  it('useSmoothScroll intercepts anchor links and falls back to scrollIntoView', () => {
    document.body.innerHTML =
      '<a href="#profile" id="lnk">Go</a><a href="#main-content" id="skip">Skip</a><section id="profile"></section><main id="main-content"></main>';
    const target = document.getElementById('profile')!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: undefined });

    renderHook(() => useSmoothScroll(false));
    act(() => {
      document
        .getElementById('skip')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document
        .getElementById('lnk')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
