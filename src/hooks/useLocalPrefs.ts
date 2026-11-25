import { useCallback, useState } from 'react';
import { sanitizeUserProfile } from '../lib/validation';
import type { UserProfile } from '../types';

const STORAGE_KEY = 'saans_user_prefs_v1';

export const DEFAULT_USER_PROFILE: UserProfile = {
  city: 'Delhi',
  householdSize: 4,
  hasChildren: true,
  hasElderly: false,
  hasRespiratoryCondition: false,
  commuteMode: 'car',
  commuteKm: 18,
  homeType: 'apartment',
  hasAirPurifier: false,
  cookingFuel: 'lpg',
  budget: 'medium',
  language: 'en',
};

function isValidStoredProfile(value: unknown): value is Partial<UserProfile> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadSavedProfile(): UserProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_PROFILE;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_USER_PROFILE;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredProfile(parsed)) return DEFAULT_USER_PROFILE;
    return sanitizeUserProfile({
      ...DEFAULT_USER_PROFILE,
      ...parsed,
    });
  } catch {
    return DEFAULT_USER_PROFILE;
  }
}

/**
 * Persists non-sensitive household form preferences in localStorage
 * and provides a one-click reset/clear handler.
 */
export function useLocalPrefs() {
  const [profile, setProfileState] = useState<UserProfile>(() => loadSavedProfile());

  const updateProfile = useCallback(
    (updater: UserProfile | ((prev: UserProfile) => UserProfile)) => {
      setProfileState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota or private-mode restrictions
        }
        return next;
      });
    },
    []
  );

  const clearPrefs = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    setProfileState(DEFAULT_USER_PROFILE);
  }, []);

  return { profile, updateProfile, clearPrefs };
}
