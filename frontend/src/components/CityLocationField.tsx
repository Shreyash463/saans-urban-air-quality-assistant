import { LocateFixed, MapPin } from 'lucide-react';
import { useGeolocationAqi } from '../hooks/useGeolocationAqi';
import { QUICK_PICK_CITIES } from '../lib/cities';
import { t } from '../lib/i18n';
import { CITY_MAX_LENGTH, validateCity } from '../lib/validation';
import { getAirQuality } from '../services/api';
import type { AirQualityReading, Coordinates, LanguageCode } from '../types';

export type CityErrorKey =
  'errorCityRequired' | 'errorCityInvalidChars' | 'errorCityTooLong';

interface CityLocationFieldProps {
  city: string;
  language: LanguageCode;
  cityErrorKey: CityErrorKey | null;
  hasActiveLocation?: boolean;
  onCityValueChange: (city: string, errorKey: CityErrorKey | null) => void;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
  onLocationChange?: (coords: Coordinates | null) => void;
}

function CityQuickPicks({
  city,
  hasActiveLocation,
  language,
  onPick,
}: {
  city: string;
  hasActiveLocation?: boolean;
  language: LanguageCode;
  onPick: (cityName: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-600 dark:text-slate-300">
        {t(language, 'cityQuickPickLabel')}
      </span>
      {QUICK_PICK_CITIES.map((cityName) => {
        const isActive =
          !hasActiveLocation && city.trim().toLowerCase() === cityName.toLowerCase();
        const chipTone = isActive
          ? 'bg-teal-50 border-teal-600 text-teal-900 dark:bg-teal-950/60 dark:border-teal-400 dark:text-teal-200'
          : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-teal-600/50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200';
        return (
          <button
            key={cityName}
            type="button"
            onClick={() => onPick(cityName)}
            className={`min-h-[36px] px-3 py-1 rounded-full text-sm font-medium border transition-colors cursor-pointer ${chipTone}`}
          >
            {cityName}
          </button>
        );
      })}
    </div>
  );
}

function useCityLocationController(props: CityLocationFieldProps) {
  const { city, cityErrorKey, onCityValueChange, onPreviewReadingChange } = props;
  const geo = useGeolocationAqi(props);
  const previewAqi = (target: string) => {
    if (onPreviewReadingChange)
      void getAirQuality(target)
        .then(onPreviewReadingChange)
        .catch(() => undefined);
  };
  return {
    locStatus: geo.locStatus,
    locNoticeKey: geo.locNoticeKey,
    handleGeolocation: geo.triggerGeo,
    handleTextChange: (nextCity: string) => {
      geo.resetLoc();
      onCityValueChange(
        nextCity,
        cityErrorKey
          ? ((validateCity(nextCity).errorKey as CityErrorKey) ?? null)
          : null
      );
    },
    handleBlur: () => {
      const res = validateCity(city);
      const err = (res.errorKey as CityErrorKey) ?? null;
      onCityValueChange(city, err);
      if (!err && res.sanitized.length > 1) previewAqi(res.sanitized);
    },
    handleQuickPick: (cityName: string) => {
      geo.resetLoc();
      onCityValueChange(cityName, null);
      previewAqi(cityName);
    },
  };
}

function CityLabelRow({
  language,
  loading,
  onGeo,
}: {
  language: LanguageCode;
  loading: boolean;
  onGeo: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label
        htmlFor="saans-city-input"
        className="text-base font-semibold text-slate-900 dark:text-slate-100"
      >
        {t(language, 'cityLabel')}
      </label>
      <button
        type="button"
        onClick={onGeo}
        disabled={loading}
        className="min-h-[38px] inline-flex items-center gap-1.5 text-sm font-medium text-teal-800 dark:text-teal-300 hover:underline cursor-pointer disabled:opacity-60"
      >
        <LocateFixed className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{t(language, loading ? 'useMyLocationLoading' : 'useMyLocation')}</span>
      </button>
    </div>
  );
}

function CityInputField({
  city,
  language,
  cityErrorKey,
  describedBy,
  onChange,
  onBlur,
}: {
  city: string;
  language: LanguageCode;
  cityErrorKey: CityErrorKey | null;
  describedBy?: string;
  onChange: (val: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="mt-2 relative">
      <MapPin
        className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
        aria-hidden="true"
      />
      <input
        id="saans-city-input"
        type="text"
        value={city}
        maxLength={CITY_MAX_LENGTH}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={t(language, 'cityPlaceholder')}
        aria-invalid={cityErrorKey ? 'true' : undefined}
        aria-describedby={describedBy}
        className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-[#0B1220] text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-teal-600 dark:focus:border-teal-400"
      />
    </div>
  );
}

function CityStatusMessages({
  language,
  cityErrorKey,
  feedback,
}: {
  language: LanguageCode;
  cityErrorKey: CityErrorKey | null;
  feedback: string;
}) {
  return (
    <>
      {cityErrorKey ? (
        <p
          id="saans-city-error"
          role="alert"
          className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
        >
          {t(language, cityErrorKey)}
        </p>
      ) : null}
      {feedback ? (
        <p
          id="saans-location-feedback"
          className="mt-2 text-sm text-teal-800 dark:text-teal-300"
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </>
  );
}

export function CityLocationField(props: CityLocationFieldProps) {
  const { city, language, cityErrorKey, hasActiveLocation } = props;
  const ctrl = useCityLocationController(props);
  const feedback =
    ctrl.locStatus === 'active'
      ? `${t(language, 'locationApproxLabel')} ✓`
      : ctrl.locNoticeKey
        ? t(language, ctrl.locNoticeKey)
        : '';
  const describedBy = cityErrorKey
    ? 'saans-city-error'
    : feedback
      ? 'saans-location-feedback'
      : undefined;

  return (
    <div className="lg:col-span-7">
      <CityLabelRow
        language={language}
        loading={ctrl.locStatus === 'loading'}
        onGeo={ctrl.handleGeolocation}
      />
      <CityInputField
        city={city}
        language={language}
        cityErrorKey={cityErrorKey}
        describedBy={describedBy}
        onChange={ctrl.handleTextChange}
        onBlur={ctrl.handleBlur}
      />
      <CityStatusMessages
        language={language}
        cityErrorKey={cityErrorKey}
        feedback={feedback}
      />
      <CityQuickPicks
        city={city}
        hasActiveLocation={hasActiveLocation}
        language={language}
        onPick={ctrl.handleQuickPick}
      />
    </div>
  );
}
