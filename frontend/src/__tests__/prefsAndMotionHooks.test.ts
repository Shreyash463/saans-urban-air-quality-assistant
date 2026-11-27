// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUpValue } from '../hooks/useCountUpValue';
import { DEFAULT_USER_PROFILE, useLocalPrefs } from '../hooks/useLocalPrefs';
import {
  getEffectiveReducedMotion,
  setReducedMotionPreference,
  useReducedMotionControl,
} from '../hooks/useReducedMotion';
import { useTheme } from '../hooks/useTheme';

describe('Preferences, theme, reduced-motion, and count-up hooks', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useLocalPrefs recovers defaults on corrupted or non-object storage JSON', () => {
    window.localStorage.setItem('saans_user_prefs_v1', '{not-json');
    expect(renderHook(() => useLocalPrefs()).result.current.profile).toEqual(
      DEFAULT_USER_PROFILE
    );

    window.localStorage.setItem('saans_user_prefs_v1', '["array"]');
    expect(renderHook(() => useLocalPrefs()).result.current.profile).toEqual(
      DEFAULT_USER_PROFILE
    );
  });

  it('useTheme and useReducedMotionControl restore saved state and toggle safely', () => {
    window.localStorage.setItem('saans_theme_v1', 'light');
    const theme = renderHook(() => useTheme());
    expect(theme.result.current.theme).toBe('light');

    act(() => setReducedMotionPreference(false));
    expect(getEffectiveReducedMotion()).toBe(false);
    const rm = renderHook(() => useReducedMotionControl());
    act(() => rm.result.current.toggleReducedMotion());
    expect(rm.result.current.reducedMotion).toBe(true);
  });

  it('useCountUpValue animates via rAF and snaps immediately under reducedMotion', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const rafQueue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ target, rm }) => useCountUpValue(target, rm, 100, true),
      { initialProps: { target: 80, rm: false } }
    );
    expect(result.current).toBe(0);

    act(() => {
      now = 100;
      rafQueue.shift()?.(100);
    });
    expect(result.current).toBe(80);

    rerender({ target: 150, rm: true });
    expect(result.current).toBe(150);
  });
});
