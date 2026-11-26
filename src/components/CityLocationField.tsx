import { Loader2, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AqiCategoryBadge } from './AqiCategoryBadge';
import { useDebounce } from '../hooks/useDebounce';
import { QUICK_PICK_CITIES } from '../lib/cities';
import { t, type TranslationKey } from '../lib/i18n';
import { CITY_MAX_LENGTH, validateCity } from '../lib/validation';
import { getAirQuality, getAirQualityByCoords } from '../services/api';
import type { AirQualityReading, Coordinates, LanguageCode } from '../types';

interface CityLocationFieldProps {
  city: string;
  language: LanguageCode;
  cityErrorKey: TranslationKey | null;
  hasActiveLocation: boolean;
  onCityValueChange: (nextCity: string, nextErrorKey: TranslationKey | null) => void;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
  onLocationChange?: (coords: Coordinates | null) => void;
}

export function CityLocationField({
  city,
  language,
  cityErrorKey,
  hasActiveLocation,
  onCityValueChange,
  onPreviewReadingChange,
  onLocationChange,
}: CityLocationFieldProps) {
  const [cityPreview, setCityPreview] = useState<AirQualityReading | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNoticeKey, setLocationNoticeKey] = useState<TranslationKey | null>(
    null
  );

  const debouncedCity = useDebounce(city, 300);
  const initialMountCityRef = useRef<string | null>(city.trim().toLowerCase());

  useEffect(() => {
    if (hasActiveLocation) return;
    const check = validateCity(debouncedCity);
    if (!check.valid) {
      setCityPreview(null);
      return;
    }
    if (
      initialMountCityRef.current !== null &&
      check.sanitized.toLowerCase() === initialMountCityRef.current
    ) {
      initialMountCityRef.current = null;
      return;
    }
    initialMountCityRef.current = null;

    let cancelled = false;
    getAirQuality(check.sanitized)
      .then((reading) => {
        if (!cancelled) {
          setCityPreview(reading);
          setLocationNoticeKey(null);
          onPreviewReadingChange?.(reading);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCityPreview(null);
          setLocationNoticeKey('cityPreviewErrorNotice');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedCity, hasActiveLocation, onPreviewReadingChange]);

  const handleCityChange = (rawValue: string) => {
    onLocationChange?.(null);
    setLocationNoticeKey(null);
    const trimmedMax = rawValue.slice(0, CITY_MAX_LENGTH + 5);
    const nextErr = cityErrorKey
      ? (() => {
          const result = validateCity(trimmedMax);
          return result.valid ? null : (result.errorKey ?? null);
        })()
      : null;
    onCityValueChange(trimmedMax, nextErr);
  };

  const handleQuickPick = (pickedCity: string) => {
    onLocationChange?.(null);
    setLocationNoticeKey(null);
    onCityValueChange(pickedCity, null);
  };

  const handleUseMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNoticeKey('locationUnsupportedNotice');
      return;
    }
    setLocating(true);
    setLocationNoticeKey(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordinates = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };
        onLocationChange?.(coords);
        onCityValueChange('Your location', null);
        void getAirQualityByCoords(coords.lat, coords.lon)
          .then((reading) => {
            setCityPreview(reading);
            onPreviewReadingChange?.(reading);
          })
          .catch(() => {
            setCityPreview(null);
            setLocationNoticeKey('cityPreviewErrorNotice');
          })
          .finally(() => {
            setLocating(false);
          });
      },
      () => {
        setLocating(false);
        setLocationNoticeKey('locationDeniedNotice');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 }
    );
  };

  return (
    <div className="lg:col-span-7">
      <div className="min-h-[28px] flex flex-wrap items-center justify-between gap-2">
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
              {hasActiveLocation ? `${t(language, 'locationApproxLabel')} · ` : ''}
              AQI {cityPreview.aqi}
            </span>
            <AqiCategoryBadge aqi={cityPreview.aqi} language={language} size="sm" />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col sm:flex-row gap-2">
        <input
          id="saans-city-input"
          name="city"
          type="text"
          autoComplete="address-level2"
          maxLength={CITY_MAX_LENGTH + 5}
          value={city}
          onChange={(e) => handleCityChange(e.target.value)}
          placeholder={t(language, 'cityPlaceholder')}
          aria-invalid={cityErrorKey !== null}
          aria-describedby={cityErrorKey ? 'saans-city-error' : 'saans-city-hint'}
          className={`flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border text-base bg-slate-50 dark:bg-[#0B1220] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 transition-colors ${
            cityErrorKey
              ? 'border-red-600 dark:border-red-400'
              : 'border-slate-300 dark:border-slate-700 focus:border-teal-600 dark:focus:border-teal-400'
          }`}
        />

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={locating}
          className="min-h-[48px] px-4 py-2.5 rounded-xl border border-teal-600/50 dark:border-teal-400/50 bg-teal-50/70 dark:bg-teal-950/40 text-sm font-semibold text-teal-900 dark:text-teal-200 hover:bg-teal-100/80 dark:hover:bg-teal-900/50 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
          )}
          <span>
            {locating
              ? t(language, 'useMyLocationLoading')
              : t(language, 'useMyLocation')}
          </span>
        </button>
      </div>

      {locationNoticeKey ? (
        <p
          role="status"
          className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200"
        >
          {t(language, locationNoticeKey)}
        </p>
      ) : null}

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
        {QUICK_PICK_CITIES.map((pickedCity) => {
          const isActive = city.trim().toLowerCase() === pickedCity.toLowerCase();
          return (
            <button
              key={pickedCity}
              type="button"
              onClick={() => handleQuickPick(pickedCity)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-teal-700 border-teal-700 text-white dark:bg-teal-400 dark:border-teal-400 dark:text-slate-950'
                  : 'bg-slate-50 border-slate-300 text-slate-800 hover:border-teal-600/60 dark:bg-[#0B1220] dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              {pickedCity}
            </button>
          );
        })}
      </div>
    </div>
  );
}
