import { useCallback, useEffect, useState } from 'react';
import { REDUCE_MOTION_STORAGE_KEY } from '../lib/motion';

type MotionListener = () => void;
const motionListeners = new Set<MotionListener>();

function readSystemReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readStoredOverride(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    // Ignore storage restrictions
  }
  return null;
}

/**
 * Computes the effective reduced-motion preference combining any saved
 * user override in localStorage with the OS prefers-reduced-motion query.
 */
export function getEffectiveReducedMotion(): boolean {
  const stored = readStoredOverride();
  if (stored !== null) {
    return stored;
  }
  return readSystemReducedMotion();
}

/**
 * Persists a manual user override for reduced motion, updates the root
 * `.reduce-motion` CSS class, and notifies all active hook consumers.
 */
export function setReducedMotionPreference(reduced: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(reduced));
    } catch {
      // Ignore storage restrictions
    }
    syncRootClass(reduced);
  }
  for (const listener of motionListeners) {
    listener();
  }
}

function syncRootClass(reduced: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('reduce-motion', reduced);
}

/**
 * Unified reduced-motion hook honoring both OS prefers-reduced-motion
 * and the user's discoverable in-app Reduce Motion toggle.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => getEffectiveReducedMotion());

  useEffect(() => {
    const sync = () => {
      const next = getEffectiveReducedMotion();
      syncRootClass(next);
      setReduced(next);
    };

    sync();
    motionListeners.add(sync);

    let mediaQuery: MediaQueryList | null = null;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      mediaQuery.addEventListener('change', sync);
    }

    return () => {
      motionListeners.delete(sync);
      mediaQuery?.removeEventListener('change', sync);
    };
  }, []);

  return reduced;
}

/**
 * Companion hook exposing both the effective reduced-motion boolean
 * and a toggle callback for UI controls in the header/footer.
 */
export function useReducedMotionControl(): {
  reducedMotion: boolean;
  toggleReducedMotion: () => void;
} {
  const reducedMotion = useReducedMotion();

  const toggleReducedMotion = useCallback(() => {
    setReducedMotionPreference(!getEffectiveReducedMotion());
  }, []);

  return { reducedMotion, toggleReducedMotion };
}
