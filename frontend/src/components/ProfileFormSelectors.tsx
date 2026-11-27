import {
  Bike,
  Building2,
  Car,
  Flame,
  Footprints,
  Home,
  Laptop,
  TrainFront,
  Zap,
} from 'lucide-react';
import { t, type TranslationKey } from '../lib/i18n';
import { clampCommuteKm, MAX_COMMUTE_KM, MIN_COMMUTE_KM } from '../lib/validation';
import type {
  BudgetLevel,
  CommuteMode,
  CookingFuel,
  HomeType,
  UserProfile,
} from '../types';
import { RadioCard } from './ui/RadioCard';
import { RangeSlider } from './ui/RangeSlider';

type ProfileUpdater = (
  updater: UserProfile | ((prev: UserProfile) => UserProfile)
) => void;
interface SelectorRowProps {
  profile: UserProfile;
  onChangeProfile: ProfileUpdater;
}

const COMMUTE_OPTIONS: {
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

const HOME_OPTIONS: { value: HomeType; labelKey: TranslationKey; icon: typeof Home }[] =
  [
    { value: 'apartment', labelKey: 'homeApartment', icon: Building2 },
    { value: 'independent_house', labelKey: 'homeHouse', icon: Home },
  ];

const COOKING_OPTIONS: {
  value: CookingFuel;
  labelKey: TranslationKey;
  icon: typeof Flame;
}[] = [
  { value: 'lpg', labelKey: 'fuelLpg', icon: Flame },
  { value: 'induction_electric', labelKey: 'fuelInduction', icon: Zap },
  { value: 'piped_gas', labelKey: 'fuelPipedGas', icon: Flame },
  { value: 'biomass_wood', labelKey: 'fuelBiomass', icon: Flame },
];

const BUDGET_OPTIONS: { value: BudgetLevel; labelKey: TranslationKey }[] = [
  { value: 'low', labelKey: 'budgetLow' },
  { value: 'medium', labelKey: 'budgetMedium' },
  { value: 'high', labelKey: 'budgetHigh' },
];

function CommuteDistanceControl({
  isWfh,
  commuteKm,
  language,
  onChangeKm,
}: {
  isWfh: boolean;
  commuteKm: number;
  language: UserProfile['language'];
  onChangeKm: (next: number) => void;
}) {
  return (
    <div className="lg:col-span-4">
      <RangeSlider
        id="saans-commute-km"
        label={t(language, 'commuteKmLabel')}
        valueLabel={`${isWfh ? 0 : commuteKm} ${t(language, 'commuteKmUnit')}`}
        min={MIN_COMMUTE_KM}
        max={MAX_COMMUTE_KM}
        step={2}
        disabled={isWfh}
        value={isWfh ? 0 : commuteKm}
        onChange={onChangeKm}
      />
      <div className="font-mono mt-1.5 flex justify-between text-sm text-slate-600 dark:text-slate-300 tabular-nums">
        <span>{MIN_COMMUTE_KM} km</span>
        <span>{Math.round((MIN_COMMUTE_KM + MAX_COMMUTE_KM) / 2)} km</span>
        <span>{MAX_COMMUTE_KM} km</span>
      </div>
    </div>
  );
}

export function CommuteSelectorRow({ profile, onChangeProfile }: SelectorRowProps) {
  const { language } = profile;
  const isWfh = profile.commuteMode === 'work_from_home';
  return (
    <div data-reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <fieldset className="lg:col-span-8">
        <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'commuteLegend')}
        </legend>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {COMMUTE_OPTIONS.map((opt) => (
            <RadioCard
              key={opt.value}
              name="commuteMode"
              value={opt.value}
              checked={profile.commuteMode === opt.value}
              label={t(language, opt.labelKey)}
              icon={opt.icon}
              minHeightClass="min-h-[72px]"
              layoutClass="flex flex-col items-start justify-between gap-2"
              onSelect={(mode) =>
                onChangeProfile((prev) => ({
                  ...prev,
                  commuteMode: mode,
                  commuteKm: mode === 'work_from_home' ? 0 : prev.commuteKm || 14,
                }))
              }
            />
          ))}
        </div>
      </fieldset>
      <CommuteDistanceControl
        isWfh={isWfh}
        commuteKm={profile.commuteKm}
        language={language}
        onChangeKm={(next) =>
          onChangeProfile((prev) => ({ ...prev, commuteKm: clampCommuteKm(next) }))
        }
      />
    </div>
  );
}

function HomeTypeField({ profile, onChangeProfile }: SelectorRowProps) {
  return (
    <fieldset className="lg:col-span-4">
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(profile.language, 'homeTypeLabel')}
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {HOME_OPTIONS.map((opt) => (
          <RadioCard
            key={opt.value}
            name="homeType"
            value={opt.value}
            checked={profile.homeType === opt.value}
            label={t(profile.language, opt.labelKey)}
            icon={opt.icon}
            onSelect={(homeType) => onChangeProfile((prev) => ({ ...prev, homeType }))}
          />
        ))}
      </div>
    </fieldset>
  );
}

function PurifierChoiceField({ profile, onChangeProfile }: SelectorRowProps) {
  return (
    <fieldset className="lg:col-span-3">
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(profile.language, 'purifierLabel')}
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {(['yes', 'no'] as const).map((choice) => (
          <RadioCard
            key={choice}
            name="hasAirPurifier"
            value={choice}
            checked={profile.hasAirPurifier === (choice === 'yes')}
            label={t(profile.language, choice)}
            layoutClass="flex items-center justify-center"
            onSelect={(c) =>
              onChangeProfile((prev) => ({ ...prev, hasAirPurifier: c === 'yes' }))
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

function CookingFuelField({ profile, onChangeProfile }: SelectorRowProps) {
  return (
    <fieldset className="lg:col-span-5">
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(profile.language, 'cookingLegend')}
      </legend>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {COOKING_OPTIONS.map((opt) => (
          <RadioCard
            key={opt.value}
            name="cookingFuel"
            value={opt.value}
            checked={profile.cookingFuel === opt.value}
            label={t(profile.language, opt.labelKey)}
            icon={opt.icon}
            onSelect={(cookingFuel) =>
              onChangeProfile((prev) => ({ ...prev, cookingFuel }))
            }
          />
        ))}
      </div>
    </fieldset>
  );
}

export function HomeEnvironmentRow({ profile, onChangeProfile }: SelectorRowProps) {
  return (
    <div data-reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <HomeTypeField profile={profile} onChangeProfile={onChangeProfile} />
      <PurifierChoiceField profile={profile} onChangeProfile={onChangeProfile} />
      <CookingFuelField profile={profile} onChangeProfile={onChangeProfile} />
    </div>
  );
}

export function BudgetSelectorField({ profile, onChangeProfile }: SelectorRowProps) {
  return (
    <fieldset className="flex-1">
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(profile.language, 'budgetLegend')}
      </legend>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {BUDGET_OPTIONS.map((opt) => (
          <RadioCard
            key={opt.value}
            name="budget"
            value={opt.value}
            checked={profile.budget === opt.value}
            label={t(profile.language, opt.labelKey)}
            minHeightClass="min-h-[48px]"
            layoutClass="flex items-center justify-center text-center"
            onSelect={(budget) => onChangeProfile((prev) => ({ ...prev, budget }))}
          />
        ))}
      </div>
    </fieldset>
  );
}
