import {
  Bike,
  Building2,
  Car,
  Flame,
  Footprints,
  Home,
  Laptop,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  TrainFront,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AqiCategoryBadge } from '../components/AqiCategoryBadge';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { useDebounce } from '../hooks/useDebounce';
import { t, type TranslationKey } from '../lib/i18n';
import {
  CITY_MAX_LENGTH,
  clampCommuteKm,
  clampHouseholdSize,
  MAX_COMMUTE_KM,
  MAX_HOUSEHOLD_SIZE,
  MIN_COMMUTE_KM,
  MIN_HOUSEHOLD_SIZE,
  validateCity,
} from '../lib/validation';
import { getAirQuality } from '../services/api';
import { QUICK_PICK_CITIES } from '../services/mockPlanGenerator';
import type {
  AirQualityReading,
  BudgetLevel,
  CommuteMode,
  CookingFuel,
  HomeType,
  UserProfile,
} from '../types';

interface ProfileFormProps {
  profile: UserProfile;
  onChangeProfile: (
    updater: UserProfile | ((prev: UserProfile) => UserProfile)
  ) => void;
  onSubmitProfile: (profile: UserProfile) => Promise<void>;
  onClearData: () => void;
  isSubmitting: boolean;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
}

/**
 * Accessible multi-field household profile form with real labels, fieldset/legend,
 * debounced city AQI lookup, inline aria-describedby validation, >=14px/16px
 * readable typography, and local preference persistence.
 */
export function ProfileForm({
  profile,
  onChangeProfile,
  onSubmitProfile,
  onClearData,
  isSubmitting,
  onPreviewReadingChange,
}: ProfileFormProps) {
  const { language } = profile;
  const [cityErrorKey, setCityErrorKey] = useState<TranslationKey | null>(null);
  const [cityPreview, setCityPreview] = useState<AirQualityReading | null>(null);

  const debouncedCity = useDebounce(profile.city, 300);

  useEffect(() => {
    const check = validateCity(debouncedCity);
    if (!check.valid) {
      setCityPreview(null);
      return;
    }

    let cancelled = false;
    getAirQuality(check.sanitized).then((reading) => {
      if (!cancelled) {
        setCityPreview(reading);
        onPreviewReadingChange?.(reading);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedCity, onPreviewReadingChange]);

  const handleCityChange = (rawValue: string) => {
    const trimmedMax = rawValue.slice(0, CITY_MAX_LENGTH + 5);
    onChangeProfile((prev) => ({ ...prev, city: trimmedMax }));
    if (cityErrorKey) {
      const result = validateCity(trimmedMax);
      setCityErrorKey(result.valid ? null : (result.errorKey ?? null));
    }
  };

  const handleQuickPick = (city: string) => {
    onChangeProfile((prev) => ({ ...prev, city }));
    setCityErrorKey(null);
  };

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

  const commuteOptions: {
    value: CommuteMode;
    labelKey: TranslationKey;
    icon: typeof Car;
  }[] = [
    { value: 'car', labelKey: 'commuteCar', icon: Car },
    { value: 'two_wheeler', labelKey: 'commuteTwoWheeler', icon: Bike },
    { value: 'public_transport', labelKey: 'commutePublic', icon: TrainFront },
    { value: 'walk_cycle', labelKey: 'commuteWalkCycle', icon: Footprints },
    { value: 'work_from_home', labelKey: 'commuteWfh', icon: Laptop },
  ];

  const cookingOptions: {
    value: CookingFuel;
    labelKey: TranslationKey;
    icon: typeof Flame;
  }[] = [
    { value: 'lpg', labelKey: 'fuelLpg', icon: Flame },
    { value: 'induction_electric', labelKey: 'fuelInduction', icon: Zap },
    { value: 'piped_gas', labelKey: 'fuelPipedGas', icon: Flame },
    { value: 'biomass_wood', labelKey: 'fuelBiomass', icon: Flame },
  ];

  const budgetOptions: { value: BudgetLevel; labelKey: TranslationKey }[] = [
    { value: 'low', labelKey: 'budgetLow' },
    { value: 'medium', labelKey: 'budgetMedium' },
    { value: 'high', labelKey: 'budgetHigh' },
  ];

  const isWfh = profile.commuteMode === 'work_from_home';

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
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="saans-city-input"
                  className="block text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t(language, 'cityLabel')}
                </label>
                {cityPreview ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums"
                      style={{ fontFamily: 'var(--font-mono)' }}
                    >
                      AQI {cityPreview.aqi}
                    </span>
                    <AqiCategoryBadge
                      aqi={cityPreview.aqi}
                      language={language}
                      size="sm"
                    />
                  </div>
                ) : null}
              </div>

              <input
                id="saans-city-input"
                name="city"
                type="text"
                autoComplete="address-level2"
                maxLength={CITY_MAX_LENGTH + 5}
                value={profile.city}
                onChange={(e) => handleCityChange(e.target.value)}
                placeholder={t(language, 'cityPlaceholder')}
                aria-invalid={cityErrorKey !== null}
                aria-describedby={cityErrorKey ? 'saans-city-error' : 'saans-city-hint'}
                className={`mt-2 w-full min-h-[48px] px-4 py-2.5 rounded-xl border text-base bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition-colors ${
                  cityErrorKey
                    ? 'border-red-600 dark:border-red-400'
                    : 'border-slate-300 dark:border-slate-700 focus:border-teal-600 dark:focus:border-teal-400'
                }`}
              />

              {cityErrorKey ? (
                <p
                  id="saans-city-error"
                  role="alert"
                  className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
                >
                  {t(language, cityErrorKey)}
                </p>
              ) : (
                <p
                  id="saans-city-hint"
                  className="mt-2 text-sm text-slate-600 dark:text-slate-300"
                >
                  {t(language, 'cityQuickPickLabel')}
                </p>
              )}

              <div
                className="mt-2.5 flex flex-wrap gap-2"
                role="group"
                aria-label={t(language, 'cityQuickPickLabel')}
              >
                {QUICK_PICK_CITIES.map((city) => {
                  const isActive =
                    profile.city.trim().toLowerCase() === city.toLowerCase();
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => handleQuickPick(city)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-teal-700 border-teal-700 text-white dark:bg-teal-400 dark:border-teal-400 dark:text-slate-950'
                          : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-teal-600/60 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {city}
                    </button>
                  );
                })}
              </div>
            </div>

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
                  onChangeProfile((prev) => ({
                    ...prev,
                    hasElderly: !prev.hasElderly,
                  }))
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

          {/* Row 3: Commute mode radio cards + commute distance slider */}
          <div
            data-reveal
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <fieldset className="lg:col-span-8">
              <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'commuteLegend')}
              </legend>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                {commuteOptions.map((option) => {
                  const Icon = option.icon;
                  const selected = profile.commuteMode === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`min-h-[72px] p-3 rounded-xl border flex flex-col items-start justify-between gap-2 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                        selected
                          ? 'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100'
                          : 'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="commuteMode"
                        value={option.value}
                        checked={selected}
                        onChange={() =>
                          onChangeProfile((prev) => ({
                            ...prev,
                            commuteMode: option.value,
                            commuteKm:
                              option.value === 'work_from_home'
                                ? 0
                                : prev.commuteKm || 14,
                          }))
                        }
                        className="sr-only"
                      />
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          selected
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium leading-tight">
                        {t(language, option.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="lg:col-span-4">
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor="saans-commute-km"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t(language, 'commuteKmLabel')}
                </label>
                <span
                  className="text-sm font-semibold text-teal-800 dark:text-teal-300 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {isWfh ? 0 : profile.commuteKm} {t(language, 'commuteKmUnit')}
                </span>
              </div>

              <div className="mt-4">
                <input
                  id="saans-commute-km"
                  type="range"
                  min={MIN_COMMUTE_KM}
                  max={MAX_COMMUTE_KM}
                  step={2}
                  disabled={isWfh}
                  value={isWfh ? 0 : profile.commuteKm}
                  onChange={(e) =>
                    onChangeProfile((prev) => ({
                      ...prev,
                      commuteKm: clampCommuteKm(Number(e.target.value)),
                    }))
                  }
                  className="saans-slider w-full h-3 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
                <div
                  className="mt-1.5 flex justify-between text-sm text-slate-600 dark:text-slate-300 tabular-nums"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <span>0 km</span>
                  <span>60 km</span>
                  <span>120 km</span>
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-200/80 dark:border-slate-800" />

          {/* Row 4: Home type + Air purifier + Cooking fuel */}
          <div
            data-reveal
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <fieldset className="lg:col-span-4">
              <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'homeTypeLabel')}
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {(
                  [
                    { value: 'apartment', labelKey: 'homeApartment', icon: Building2 },
                    { value: 'independent_house', labelKey: 'homeHouse', icon: Home },
                  ] as {
                    value: HomeType;
                    labelKey: TranslationKey;
                    icon: typeof Home;
                  }[]
                ).map((item) => {
                  const Icon = item.icon;
                  const selected = profile.homeType === item.value;
                  return (
                    <label
                      key={item.value}
                      className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                        selected
                          ? 'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100'
                          : 'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="homeType"
                        value={item.value}
                        checked={selected}
                        onChange={() =>
                          onChangeProfile((prev) => ({
                            ...prev,
                            homeType: item.value,
                          }))
                        }
                        className="sr-only"
                      />
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium leading-tight">
                        {t(language, item.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="lg:col-span-3">
              <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'purifierLabel')}
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {[
                  { value: true, labelKey: 'yes' as TranslationKey },
                  { value: false, labelKey: 'no' as TranslationKey },
                ].map((opt) => {
                  const selected = profile.hasAirPurifier === opt.value;
                  return (
                    <label
                      key={String(opt.value)}
                      className={`min-h-[56px] p-3 rounded-xl border flex items-center justify-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                        selected
                          ? 'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100 font-semibold'
                          : 'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="hasAirPurifier"
                        value={String(opt.value)}
                        checked={selected}
                        onChange={() =>
                          onChangeProfile((prev) => ({
                            ...prev,
                            hasAirPurifier: opt.value,
                          }))
                        }
                        className="sr-only"
                      />
                      <span className="text-sm">{t(language, opt.labelKey)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="lg:col-span-5">
              <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'cookingLegend')}
              </legend>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {cookingOptions.map((fuel) => {
                  const Icon = fuel.icon;
                  const selected = profile.cookingFuel === fuel.value;
                  return (
                    <label
                      key={fuel.value}
                      className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                        selected
                          ? 'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100'
                          : 'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="cookingFuel"
                        value={fuel.value}
                        checked={selected}
                        onChange={() =>
                          onChangeProfile((prev) => ({
                            ...prev,
                            cookingFuel: fuel.value,
                          }))
                        }
                        className="sr-only"
                      />
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium leading-tight">
                        {t(language, fuel.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <hr className="border-slate-200/80 dark:border-slate-800" />

          {/* Row 5: Budget + Submit & Clear actions */}
          <div
            data-reveal
            className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"
          >
            <fieldset className="flex-1">
              <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t(language, 'budgetLegend')}
              </legend>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {budgetOptions.map((opt) => {
                  const selected = profile.budget === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`min-h-[48px] px-4 py-3 rounded-xl border flex items-center justify-center text-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                        selected
                          ? 'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100 font-semibold'
                          : 'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="budget"
                        value={opt.value}
                        checked={selected}
                        onChange={() =>
                          onChangeProfile((prev) => ({
                            ...prev,
                            budget: opt.value,
                          }))
                        }
                        className="sr-only"
                      />
                      <span className="text-sm leading-snug">
                        {t(language, opt.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

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
