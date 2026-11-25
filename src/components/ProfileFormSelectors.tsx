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

type ProfileUpdater = (
  updater: UserProfile | ((prev: UserProfile) => UserProfile)
) => void;

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

const CARD_SELECTED =
  'bg-teal-50/80 border-teal-600 text-teal-950 dark:bg-teal-950/45 dark:border-teal-400 dark:text-teal-100';
const CARD_IDLE =
  'bg-slate-50/70 border-slate-300 text-slate-800 hover:border-slate-400 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200';

export function CommuteSelectorRow({
  profile,
  onChangeProfile,
}: {
  profile: UserProfile;
  onChangeProfile: ProfileUpdater;
}) {
  const { language } = profile;
  const isWfh = profile.commuteMode === 'work_from_home';

  return (
    <div data-reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <fieldset className="lg:col-span-8">
        <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'commuteLegend')}
        </legend>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {COMMUTE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = profile.commuteMode === option.value;
            return (
              <label
                key={option.value}
                className={`min-h-[72px] p-3 rounded-xl border flex flex-col items-start justify-between gap-2 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                  selected ? CARD_SELECTED : CARD_IDLE
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
                        option.value === 'work_from_home' ? 0 : prev.commuteKm || 14,
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
  );
}

export function HomeEnvironmentRow({
  profile,
  onChangeProfile,
}: {
  profile: UserProfile;
  onChangeProfile: ProfileUpdater;
}) {
  const { language } = profile;
  const homeOptions: {
    value: HomeType;
    labelKey: TranslationKey;
    icon: typeof Home;
  }[] = [
    { value: 'apartment', labelKey: 'homeApartment', icon: Building2 },
    { value: 'independent_house', labelKey: 'homeHouse', icon: Home },
  ];

  return (
    <div data-reveal className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <fieldset className="lg:col-span-4">
        <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(language, 'homeTypeLabel')}
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {homeOptions.map((item) => {
            const Icon = item.icon;
            const selected = profile.homeType === item.value;
            return (
              <label
                key={item.value}
                className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                  selected ? CARD_SELECTED : CARD_IDLE
                }`}
              >
                <input
                  type="radio"
                  name="homeType"
                  value={item.value}
                  checked={selected}
                  onChange={() =>
                    onChangeProfile((prev) => ({ ...prev, homeType: item.value }))
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
          {[true, false].map((val) => {
            const selected = profile.hasAirPurifier === val;
            return (
              <label
                key={String(val)}
                className={`min-h-[56px] p-3 rounded-xl border flex items-center justify-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 font-medium text-sm ${
                  selected ? CARD_SELECTED : CARD_IDLE
                }`}
              >
                <input
                  type="radio"
                  name="hasAirPurifier"
                  checked={selected}
                  onChange={() =>
                    onChangeProfile((prev) => ({ ...prev, hasAirPurifier: val }))
                  }
                  className="sr-only"
                />
                <span>{t(language, val ? 'yes' : 'no')}</span>
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
          {COOKING_OPTIONS.map((fuel) => {
            const Icon = fuel.icon;
            const selected = profile.cookingFuel === fuel.value;
            return (
              <label
                key={fuel.value}
                className={`min-h-[56px] p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                  selected ? CARD_SELECTED : CARD_IDLE
                }`}
              >
                <input
                  type="radio"
                  name="cookingFuel"
                  value={fuel.value}
                  checked={selected}
                  onChange={() =>
                    onChangeProfile((prev) => ({ ...prev, cookingFuel: fuel.value }))
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
  );
}

export function BudgetSelectorField({
  profile,
  onChangeProfile,
}: {
  profile: UserProfile;
  onChangeProfile: ProfileUpdater;
}) {
  const { language } = profile;
  return (
    <fieldset className="flex-1">
      <legend className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {t(language, 'budgetLegend')}
      </legend>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {BUDGET_OPTIONS.map((opt) => {
          const selected = profile.budget === opt.value;
          return (
            <label
              key={opt.value}
              className={`min-h-[48px] px-4 py-3 rounded-xl border flex items-center justify-center text-center cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-teal-500 ${
                selected ? `${CARD_SELECTED} font-semibold` : CARD_IDLE
              }`}
            >
              <input
                type="radio"
                name="budget"
                value={opt.value}
                checked={selected}
                onChange={() =>
                  onChangeProfile((prev) => ({ ...prev, budget: opt.value }))
                }
                className="sr-only"
              />
              <span className="text-sm leading-snug">{t(language, opt.labelKey)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
