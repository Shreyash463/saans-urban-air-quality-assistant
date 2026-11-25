// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from '../hooks/useDebounce';
import { DEFAULT_USER_PROFILE, useLocalPrefs } from '../hooks/useLocalPrefs';
import { useReveal } from '../hooks/useReveal';
import {
  useScrollProgress,
  writeScrollProgressCssVars,
} from '../hooks/useScrollProgress';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { useSmoothScroll } from '../hooks/useSmoothScroll';
import { useTheme } from '../hooks/useTheme';

describe('Custom hooks unit tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('useDebounce updates only after delayMs', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'Delhi', delay: 300 } }
    );
    expect(result.current).toBe('Delhi');

    rerender({ value: 'Pune', delay: 300 });
    expect(result.current).toBe('Delhi');

    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(result.current).toBe('Pune');
  });

  it('useLocalPrefs loads defaults, sanitizes updates, and clears storage cleanly', () => {
    const { result } = renderHook(() => useLocalPrefs());
    expect(result.current.profile.city).toBe(DEFAULT_USER_PROFILE.city);

    act(() => {
      result.current.updateProfile((prev) => ({
        ...prev,
        city: 'Pune',
        householdSize: 6,
      }));
    });
    expect(result.current.profile.city).toBe('Pune');
    expect(window.localStorage.getItem('saans_user_prefs_v1')).toContain('Pune');

    act(() => {
      result.current.clearPrefs();
    });
    expect(result.current.profile.city).toBe(DEFAULT_USER_PROFILE.city);
  });

  it('useTheme syncs dark class on documentElement and toggles cleanly', () => {
    const { result } = renderHook(() => useTheme());
    const initial = result.current.theme;

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).not.toBe(initial);
    expect(document.documentElement.classList.contains('dark')).toBe(
      result.current.theme === 'dark'
    );
  });

  it('useScrollProgress updates DOM CSS custom properties and resets under reducedMotion', () => {
    document.body.innerHTML = `
      <div id="saans-scroll-progress-bar"></div>
      <div id="saans-smog-backdrop"></div>
      <section id="how-it-works"></section>
      <div id="routine-timeline"></div>
    `;
    writeScrollProgressCssVars();
    expect(
      document.getElementById('saans-smog-backdrop')?.style.getPropertyValue('--scroll')
    ).not.toBe('');

    const { rerender } = renderHook(({ rm }) => useScrollProgress(rm), {
      initialProps: { rm: false },
    });
    rerender({ rm: true });
    expect(
      document.getElementById('how-it-works')?.style.getPropertyValue('--how-progress')
    ).toBe('1');
  });

  it('useReveal marks elements revealed cleanly in reducedMotion mode', () => {
    document.body.innerHTML = `
      <div data-reveal-group>
        <div data-reveal id="rev-1">One</div>
        <div data-reveal data-reveal-delay="80" id="rev-2">Two</div>
      </div>
    `;
    renderHook(() => useReveal(true, 'en'));
    expect(document.getElementById('rev-1')?.classList.contains('is-revealed')).toBe(
      true
    );
    expect(document.getElementById('rev-2')?.classList.contains('is-revealed')).toBe(
      true
    );
  });

  it('useScrollSpy initializes safely when sections exist or IntersectionObserver is mocked', () => {
    document.body.innerHTML = '<section id="profile"></section>';
    const { result } = renderHook(() => useScrollSpy('k1'));
    expect(result.current).toBeNull();
  });

  it('useSmoothScroll scrolls to target elements cleanly', () => {
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;
    document.body.innerHTML = '<section id="dashboard"></section>';

    const { result } = renderHook(() => useSmoothScroll(true));
    act(() => {
      result.current.scrollToElement('#dashboard');
    });
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'auto' })
    );
  });
});
