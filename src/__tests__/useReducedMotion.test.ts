// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getEffectiveReducedMotion,
  setReducedMotionPreference,
} from '../hooks/useReducedMotion';
import { REDUCE_MOTION_STORAGE_KEY } from '../lib/motion';

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('useReducedMotion preference resolution and root class sync', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('reduce-motion');
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('reduce-motion');
  });

  it('defaults to OS prefers-reduced-motion when no localStorage override is set', () => {
    mockMatchMedia(false);
    expect(getEffectiveReducedMotion()).toBe(false);

    mockMatchMedia(true);
    expect(getEffectiveReducedMotion()).toBe(true);
  });

  it('persists manual override in localStorage and toggles .reduce-motion on documentElement', () => {
    mockMatchMedia(false);

    setReducedMotionPreference(true);
    expect(window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe('true');
    expect(getEffectiveReducedMotion()).toBe(true);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true);

    setReducedMotionPreference(false);
    expect(window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY)).toBe('false');
    expect(getEffectiveReducedMotion()).toBe(false);
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(false);
  });

  it('lets a saved user preference override OS prefers-reduced-motion', () => {
    mockMatchMedia(true);
    setReducedMotionPreference(false);
    expect(getEffectiveReducedMotion()).toBe(false);

    mockMatchMedia(false);
    setReducedMotionPreference(true);
    expect(getEffectiveReducedMotion()).toBe(true);
  });
});
