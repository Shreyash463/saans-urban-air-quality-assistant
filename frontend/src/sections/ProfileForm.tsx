import { Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CityLocationField, type CityErrorKey } from '../components/CityLocationField';
import {
  BudgetSelectorField,
  CommuteSelectorRow,
  HomeEnvironmentRow,
} from '../components/ProfileFormSelectors';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { Button } from '../components/ui/Button';
import { t } from '../lib/i18n';
import {
  clampHouseholdSize,
  MAX_HOUSEHOLD_SIZE,
  MIN_HOUSEHOLD_SIZE,
  sanitizeUserProfile,
  validateCity,
} from '../lib/validation';
import type {
  AirQualityReading,
  Coordinates,
  LanguageCode,
  UserProfile,
} from '../types';

export interface ProfileFormProps {
  profile: UserProfile;
  onChangeProfile: (
    updater: UserProfile | ((prev: UserProfile) => UserProfile)
  ) => void;
  onSubmitProfile: (cleanProfile: UserProfile) => void | Promise<void>;
  onClearData: () => void;
  isSubmitting: boolean;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
  onLocationChange?: (coords: Coordinates | null) => void;
  hasActiveLocation?: boolean;
}

interface StepperProps {
  householdSize: number;
  language: LanguageCode;
  onChangeSize: (delta: number) => void;
}

function HouseholdSizeStepper({ householdSize, language, onChangeSize }: StepperProps) {
  return (
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
        <Button
          type="button"
          aria-label={t(language, 'householdSizeDecrease')}
          disabled={householdSize <= MIN_HOUSEHOLD_SIZE}
          onClick={() => onChangeSize(-1)}
          className="min-w-[44px] rounded-lg disabled:opacity-40"
        >
          <Minus className="w-4 h-4" aria-hidden="true" />
        </Button>
        <span
          className="font-mono min-w-[92px] text-center text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
          aria-live="polite"
        >
          {householdSize}{' '}
          <span className="text-sm font-sans font-normal text-slate-600 dark:text-slate-300">
            {t(language, 'householdMembersUnit')}
          </span>
        </span>
        <Button
          type="button"
          aria-label={t(language, 'householdSizeIncrease')}
          disabled={householdSize >= MAX_HOUSEHOLD_SIZE}
          onClick={() => onChangeSize(1)}
          className="min-w-[44px] rounded-lg disabled:opacity-40"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SensitivitySwitches({
  profile,
  onChangeProfile,
}: {
  profile: UserProfile;
  onChangeProfile: ProfileFormProps['onChangeProfile'];
}) {
  const { language } = profile;
  const toggleFlag = (key: 'hasChildren' | 'hasElderly' | 'hasRespiratoryCondition') =>
    onChangeProfile((prev) => ({ ...prev, [key]: !prev[key] }));
  return (
    <fieldset>
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(language, 'sensitivityLegend')}
      </legend>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <ToggleSwitch
          id="toggle-children"
          label={t(language, 'hasChildrenLabel')}
          checked={profile.hasChildren}
          onToggle={() => toggleFlag('hasChildren')}
        />
        <ToggleSwitch
          id="toggle-elderly"
          label={t(language, 'hasElderlyLabel')}
          checked={profile.hasElderly}
          onToggle={() => toggleFlag('hasElderly')}
        />
        <ToggleSwitch
          id="toggle-respiratory"
          label={t(language, 'hasRespiratoryLabel')}
          checked={profile.hasRespiratoryCondition}
          onToggle={() => toggleFlag('hasRespiratoryCondition')}
        />
      </div>
    </fieldset>
  );
}

function ProfileSubmitActions({
  language,
  isSubmitting,
  onClearData,
}: {
  language: LanguageCode;
  isSubmitting: boolean;
  onClearData: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 shrink-0">
      <Button
        type="button"
        variant="secondary"
        onClick={onClearData}
        className="min-h-[48px] px-4 py-2.5"
      >
        <RotateCcw className="w-4 h-4" aria-hidden="true" />
        <span>{t(language, 'clearMyData')}</span>
      </Button>
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="min-h-[48px] px-6 py-2.5 text-base"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : null}
        <span>
          {t(language, isSubmitting ? 'submitProfileLoading' : 'submitProfile')}
        </span>
      </Button>
    </div>
  );
}

type ProfileCityRowProps = Pick<
  ProfileFormProps,
  | 'profile'
  | 'onChangeProfile'
  | 'onPreviewReadingChange'
  | 'onLocationChange'
  | 'hasActiveLocation'
> & {
  cityErrorKey: CityErrorKey | null;
  onCityErrorChange: (err: CityErrorKey | null) => void;
};

function ProfileCityRow(p: ProfileCityRowProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <CityLocationField
        city={p.profile.city}
        language={p.profile.language}
        cityErrorKey={p.cityErrorKey}
        hasActiveLocation={p.hasActiveLocation}
        onCityValueChange={(nextCity, nextErr) => {
          p.onChangeProfile((prev) => ({ ...prev, city: nextCity }));
          p.onCityErrorChange(nextErr);
        }}
        onPreviewReadingChange={p.onPreviewReadingChange}
        onLocationChange={p.onLocationChange}
      />
      <HouseholdSizeStepper
        householdSize={p.profile.householdSize}
        language={p.profile.language}
        onChangeSize={(delta) =>
          p.onChangeProfile((prev) => ({
            ...prev,
            householdSize: clampHouseholdSize(prev.householdSize + delta),
          }))
        }
      />
    </div>
  );
}

type ProfileCardProps = Omit<ProfileFormProps, 'onSubmitProfile'> & {
  cityErrorKey: CityErrorKey | null;
  onCityErrorChange: (err: CityErrorKey | null) => void;
  onSubmit: (e: FormEvent) => void;
};

function ProfileFormCard(p: ProfileCardProps) {
  return (
    <form
      onSubmit={p.onSubmit}
      noValidate
      className="saans-theme-surface mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-5 sm:p-8 space-y-8"
    >
      <ProfileCityRow
        profile={p.profile}
        onChangeProfile={p.onChangeProfile}
        onPreviewReadingChange={p.onPreviewReadingChange}
        onLocationChange={p.onLocationChange}
        hasActiveLocation={p.hasActiveLocation}
        cityErrorKey={p.cityErrorKey}
        onCityErrorChange={p.onCityErrorChange}
      />
      <hr className="border-slate-200/80 dark:border-slate-800" />
      <SensitivitySwitches profile={p.profile} onChangeProfile={p.onChangeProfile} />
      <hr className="border-slate-200/80 dark:border-slate-800" />
      <CommuteSelectorRow profile={p.profile} onChangeProfile={p.onChangeProfile} />
      <hr className="border-slate-200/80 dark:border-slate-800" />
      <HomeEnvironmentRow profile={p.profile} onChangeProfile={p.onChangeProfile} />
      <hr className="border-slate-200/80 dark:border-slate-800" />
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <BudgetSelectorField profile={p.profile} onChangeProfile={p.onChangeProfile} />
        <ProfileSubmitActions
          language={p.profile.language}
          isSubmitting={p.isSubmitting}
          onClearData={p.onClearData}
        />
      </div>
    </form>
  );
}

export function ProfileForm(props: ProfileFormProps) {
  const { profile, onChangeProfile, onSubmitProfile } = props;
  const [cityErrorKey, setCityErrorKey] = useState<CityErrorKey | null>(null);
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateCity(profile.city);
    if (!res.valid) {
      setCityErrorKey((res.errorKey as CityErrorKey) ?? 'errorCityRequired');
      document.getElementById('saans-city-input')?.focus();
      return;
    }
    setCityErrorKey(null);
    const cleaned = sanitizeUserProfile({ ...profile, city: res.sanitized });
    onChangeProfile(cleaned);
    void onSubmitProfile(cleaned);
  };

  return (
    <section
      id="profile"
      aria-labelledby="profile-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl">
          <h2
            id="profile-heading"
            className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
          >
            {t(profile.language, 'profileHeading')}
          </h2>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
            {t(profile.language, 'profileSubheading')}
          </p>
        </div>
        <ProfileFormCard
          profile={profile}
          onChangeProfile={onChangeProfile}
          onClearData={props.onClearData}
          isSubmitting={props.isSubmitting}
          onPreviewReadingChange={props.onPreviewReadingChange}
          onLocationChange={props.onLocationChange}
          hasActiveLocation={props.hasActiveLocation}
          cityErrorKey={cityErrorKey}
          onCityErrorChange={setCityErrorKey}
          onSubmit={handleSubmit}
        />
      </div>
    </section>
  );
}
