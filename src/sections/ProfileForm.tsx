import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CityLocationField } from '../components/CityLocationField';
import {
  BudgetSelectorField,
  CommuteSelectorRow,
  HomeEnvironmentRow,
} from '../components/ProfileFormSelectors';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { t, type TranslationKey } from '../lib/i18n';
import {
  clampHouseholdSize,
  MAX_HOUSEHOLD_SIZE,
  MIN_HOUSEHOLD_SIZE,
  validateCity,
} from '../lib/validation';
import type { AirQualityReading, Coordinates, UserProfile } from '../types';

interface ProfileFormProps {
  profile: UserProfile;
  onChangeProfile: (
    updater: UserProfile | ((prev: UserProfile) => UserProfile)
  ) => void;
  onSubmitProfile: (profile: UserProfile) => Promise<void>;
  onClearData: () => void;
  isSubmitting: boolean;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
  onLocationChange?: (coords: Coordinates | null) => void;
  hasActiveLocation?: boolean;
}

/**
 * Accessible multi-field household profile form with real labels, fieldset/legend,
 * debounced city AQI lookup, opt-in geolocation, inline aria-describedby validation,
 * and local preference persistence.
 */
export function ProfileForm({
  profile,
  onChangeProfile,
  onSubmitProfile,
  onClearData,
  isSubmitting,
  onPreviewReadingChange,
  onLocationChange,
  hasActiveLocation = false,
}: ProfileFormProps) {
  const { language } = profile;
  const [cityErrorKey, setCityErrorKey] = useState<TranslationKey | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateCity(profile.city);
    if (!result.valid) {
      setCityErrorKey(result.errorKey ?? 'errorCityRequired');
      return;
    }
    setCityErrorKey(null);
    await onSubmitProfile({ ...profile, city: result.sanitized });
  };

  return (
    <section
      id="profile"
      aria-labelledby="profile-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl" data-reveal>
          <h2
            id="profile-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
          >
            {t(language, 'profileHeading')}
          </h2>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
            {t(language, 'profileSubheading')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          data-reveal-group
          className="saans-theme-surface mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-5 sm:p-8 space-y-8"
        >
          {/* Row 1: City + Household Size */}
          <div
            data-reveal
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <CityLocationField
              city={profile.city}
              language={language}
              cityErrorKey={cityErrorKey}
              hasActiveLocation={hasActiveLocation}
              onCityValueChange={(nextCity, nextErr) => {
                onChangeProfile((prev) => ({ ...prev, city: nextCity }));
                setCityErrorKey(nextErr);
              }}
              onPreviewReadingChange={onPreviewReadingChange}
              onLocationChange={onLocationChange}
            />

            <div className="lg:col-span-5">
              <span
                id="household-size-label"
                className="block text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {t(language, 'householdSizeLabel')}
              </span>
              <div
                className="mt-2 inline-flex items-center gap-3 p-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220]"
                role="group"
                aria-labelledby="household-size-label"
              >
                <button
                  type="button"
                  aria-label={t(language, 'householdSizeDecrease')}
                  disabled={profile.householdSize <= MIN_HOUSEHOLD_SIZE}
                  onClick={() =>
                    onChangeProfile((prev) => ({
                      ...prev,
                      householdSize: clampHouseholdSize(prev.householdSize - 1),
                    }))
                  }
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] text-slate-800 dark:text-slate-100 disabled:opacity-40 hover:border-teal-600/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <Minus className="w-4 h-4" aria-hidden="true" />
                </button>

                <span
                  className="min-w-[92px] text-center text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  aria-live="polite"
                >
                  {profile.householdSize}{' '}
                  <span className="text-sm font-sans font-normal text-slate-600 dark:text-slate-300">
                    {t(language, 'householdMembersUnit')}
                  </span>
                </span>

                <button
                  type="button"
                  aria-label={t(language, 'householdSizeIncrease')}
                  disabled={profile.householdSize >= MAX_HOUSEHOLD_SIZE}
                  onClick={() =>
                    onChangeProfile((prev) => ({
                      ...prev,
                      householdSize: clampHouseholdSize(prev.householdSize + 1),
                    }))
                  }
                  className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131C2E] text-slate-800 dark:text-slate-100 disabled:opacity-40 hover:border-teal-600/60 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <hr className="border-slate-200/80 dark:border-slate-800" />

          {/* Row 2: Household health & vulnerability switches */}
          <fieldset data-reveal>
            <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t(language, 'sensitivityLegend')}
            </legend>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <ToggleSwitch
                id="toggle-children"
                label={t(language, 'hasChildrenLabel')}
                checked={profile.hasChildren}
                onToggle={() =>
                  onChangeProfile((prev) => ({
                    ...prev,
                    hasChildren: !prev.hasChildren,
                  }))
                }
              />
              <ToggleSwitch
                id="toggle-elderly"
                label={t(language, 'hasElderlyLabel')}
                checked={profile.hasElderly}
                onToggle={() =>
                  onChangeProfile((prev) => ({ ...prev, hasElderly: !prev.hasElderly }))
                }
              />
              <ToggleSwitch
                id="toggle-respiratory"
                label={t(language, 'hasRespiratoryLabel')}
                checked={profile.hasRespiratoryCondition}
                onToggle={() =>
                  onChangeProfile((prev) => ({
                    ...prev,
                    hasRespiratoryCondition: !prev.hasRespiratoryCondition,
                  }))
                }
              />
            </div>
          </fieldset>

          <hr className="border-slate-200/80 dark:border-slate-800" />
          <CommuteSelectorRow profile={profile} onChangeProfile={onChangeProfile} />
          <hr className="border-slate-200/80 dark:border-slate-800" />
          <HomeEnvironmentRow profile={profile} onChangeProfile={onChangeProfile} />
          <hr className="border-slate-200/80 dark:border-slate-800" />

          {/* Row 5: Budget + Submit & Clear actions */}
          <div
            data-reveal
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"
          >
            <BudgetSelectorField profile={profile} onChangeProfile={onChangeProfile} />

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onClearData}
                className="min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-500 text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>{t(language, 'clearMyData')}</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="min-h-[48px] px-6 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 font-semibold text-base inline-flex items-center justify-center gap-2 active:scale-[0.98] transition-transform whitespace-nowrap disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>{t(language, 'submitProfileLoading')}</span>
                  </>
                ) : (
                  <span>{t(language, 'submitProfile')}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
