// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce } from '../hooks/useDebounce';
import { DEFAULT_USER_PROFILE, useLocalPrefs } from '../hooks/useLocalPrefs';
import { useScrollSpy } from '../hooks/useScrollSpy';
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

  it('useScrollSpy initializes safely when sections exist or IntersectionObserver is mocked', () => {
    document.body.innerHTML = '<section id="profile"></section>';
    const { result } = renderHook(() => useScrollSpy('k1'));
    expect(result.current).toBeNull();
  });
});
