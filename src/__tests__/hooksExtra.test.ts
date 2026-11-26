// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatController } from '../hooks/useChatController';
import { useGeolocationAqi } from '../hooks/useGeolocationAqi';
import { DEFAULT_USER_PROFILE, useLocalPrefs } from '../hooks/useLocalPrefs';
import {
  getEffectiveReducedMotion,
  setReducedMotionPreference,
  useReducedMotionControl,
} from '../hooks/useReducedMotion';
import { useReveal } from '../hooks/useReveal';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useSmoothScroll } from '../hooks/useSmoothScroll';
import { useTheme } from '../hooks/useTheme';
import { generateMockPlan } from '../../tests/fixtures/mockPlanGenerator';

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

describe('Extended hooks branch & fallback coverage', () => {
  const originalGeo = navigator.geolocation;

  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeo,
    });
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

  it('useReveal animates off-screen elements when IntersectionObserver fires and observes DOM mutations', async () => {
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

  it('useSmoothScroll intercepts #links and falls back to scrollIntoView when scrollTo is absent', () => {
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

  it('useGeolocationAqi handles unsupported browser and error callback cleanly', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
    const onLoc = vi.fn();
    const { result } = renderHook(() =>
      useGeolocationAqi({ language: 'en', onLocationChange: onLoc })
    );
    act(() => result.current.triggerGeo());
    expect(result.current.locStatus).toBe('notice');
    expect(result.current.locNoticeKey).toBe('locationUnsupportedNotice');

    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({ code: 1, message: 'Denied' } as GeolocationPositionError),
      },
    });
    act(() => result.current.triggerGeo());
    expect(result.current.locNoticeKey).toBe('locationDeniedNotice');
    act(() => result.current.resetLoc());
    expect(result.current.locStatus).toBe('idle');
    expect(onLoc).toHaveBeenLastCalledWith(null);
  });

  it('useLocalPrefs, useTheme, useReducedMotionControl, and useChatController handle corrupted storage & failures', async () => {
    window.localStorage.setItem('saans_user_prefs_v1', '{not-json');
    const prefs = renderHook(() => useLocalPrefs());
    expect(prefs.result.current.profile).toEqual(DEFAULT_USER_PROFILE);

    window.localStorage.setItem('saans_theme_v1', 'light');
    const theme = renderHook(() => useTheme());
    expect(theme.result.current.theme).toBe('light');

    act(() => setReducedMotionPreference(false));
    expect(getEffectiveReducedMotion()).toBe(false);
    const rm = renderHook(() => useReducedMotionControl());
    act(() => rm.result.current.toggleReducedMotion());
    expect(rm.result.current.reducedMotion).toBe(true);

    const samplePlan = generateMockPlan(DEFAULT_USER_PROFILE);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const chat = renderHook(() => useChatController(DEFAULT_USER_PROFILE, samplePlan));
    await act(async () => {
      await chat.result.current.submitQuestion('   ');
    });
    expect(chat.result.current.errorKey).toBe('errorChatRequired');
    expect(chat.result.current.messages).toHaveLength(0);

    await act(async () => {
      await chat.result.current.submitQuestion('Is outdoor play safe?');
    });
    expect(chat.result.current.messages).toHaveLength(2);
    expect(chat.result.current.messages[1]?.role).toBe('assistant');
  });
});
