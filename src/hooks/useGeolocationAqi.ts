import { useState } from 'react';
import { clampAqi } from '../lib/aqi';
import { t, type TranslationKey } from '../lib/i18n';
import { getAirQualityByCoords } from '../services/api';
import type { AirQualityReading, Coordinates, LanguageCode } from '../types';

function requestBrowserCoords(
  language: LanguageCode,
  onSuccess: (
    coords: Coordinates,
    reading: AirQualityReading | null,
    notice: TranslationKey | null
  ) => void,
  onDenied: () => void
): void {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = {
        lat: Number(pos.coords.latitude.toFixed(2)),
        lon: Number(pos.coords.longitude.toFixed(2)),
      };
      onSuccess(coords, null, null);
      void getAirQualityByCoords(coords.lat, coords.lon)
        .then((r) =>
          onSuccess(
            coords,
            { ...r, aqi: clampAqi(r.aqi), city: t(language, 'locationApproxLabel') },
            null
          )
        )
        .catch(() => onSuccess(coords, null, 'cityPreviewErrorNotice'));
    },
    onDenied,
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }
  );
}

export function useGeolocationAqi({
  language,
  onPreviewReadingChange,
  onLocationChange,
}: {
  language: LanguageCode;
  onPreviewReadingChange?: (reading: AirQualityReading) => void;
  onLocationChange?: (coords: Coordinates | null) => void;
}) {
  const [locStatus, setLocStatus] = useState<'idle' | 'loading' | 'active' | 'notice'>(
    'idle'
  );
  const [locNoticeKey, setLocNoticeKey] = useState<TranslationKey | null>(null);

  const resetLoc = () => {
    setLocStatus('idle');
    setLocNoticeKey(null);
    onLocationChange?.(null);
  };

  const triggerGeo = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocStatus('notice');
      setLocNoticeKey('locationUnsupportedNotice');
      return;
    }
    setLocStatus('loading');
    setLocNoticeKey(null);
    requestBrowserCoords(
      language,
      (coords, reading, notice) => {
        onLocationChange?.(coords);
        setLocStatus('active');
        if (reading) onPreviewReadingChange?.(reading);
        if (notice) setLocNoticeKey(notice);
      },
      () => {
        onLocationChange?.(null);
        setLocStatus('notice');
        setLocNoticeKey('locationDeniedNotice');
      }
    );
  };

  return { locStatus, locNoticeKey, resetLoc, triggerGeo };
}
