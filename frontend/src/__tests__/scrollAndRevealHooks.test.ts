// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollSpy } from '../hooks/useScrollSpy';

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

describe('useScrollSpy active navigation tracking', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the highest-visibility section via IntersectionObserver', () => {
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
});
