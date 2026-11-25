import { sanitizeCity } from './validation';
import type { AirQualityReading } from '../types';

interface DemoCityEntry {
  displayName: string;
  aqi: number;
  dominantPollutant: string;
}

const DEMO_CITY_TABLE: Readonly<Record<string, DemoCityEntry>> = {
  delhi: { displayName: 'Delhi', aqi: 380, dominantPollutant: 'PM2.5' },
  'new delhi': { displayName: 'New Delhi', aqi: 380, dominantPollutant: 'PM2.5' },
  lucknow: { displayName: 'Lucknow', aqi: 310, dominantPollutant: 'PM2.5' },
  kolkata: { displayName: 'Kolkata', aqi: 240, dominantPollutant: 'PM2.5' },
  mumbai: { displayName: 'Mumbai', aqi: 150, dominantPollutant: 'PM10' },
  pune: { displayName: 'Pune', aqi: 130, dominantPollutant: 'PM10' },
  noida: { displayName: 'Noida', aqi: 365, dominantPollutant: 'PM2.5' },
  gurugram: { displayName: 'Gurugram', aqi: 350, dominantPollutant: 'PM2.5' },
  patna: { displayName: 'Patna', aqi: 295, dominantPollutant: 'PM2.5' },
  bengaluru: { displayName: 'Bengaluru', aqi: 95, dominantPollutant: 'PM10' },
  chennai: { displayName: 'Chennai', aqi: 110, dominantPollutant: 'PM10' },
};

const UNKNOWN_CITY_AQI = 160;

/** Quick-pick demo cities displayed in the profile form. */
export const QUICK_PICK_CITIES: readonly string[] = [
  'Delhi',
  'Mumbai',
  'Pune',
  'Lucknow',
  'Kolkata',
];

/**
 * Lightweight deterministic demo AQI lookup kept separate from heavy template generators
 * so the initial bundle stays small.
 */
export function getMockAirQuality(city: string): AirQualityReading {
  const cleaned = sanitizeCity(city) || 'Delhi';
  const entry = DEMO_CITY_TABLE[cleaned.toLowerCase()];

  if (entry) {
    return {
      city: entry.displayName,
      aqi: entry.aqi,
      dominantPollutant: entry.dominantPollutant,
      updatedAt: '',
      source: 'demo',
      sourceDetail: 'Sample reading',
    };
  }

  return {
    city: cleaned,
    aqi: UNKNOWN_CITY_AQI,
    dominantPollutant: 'PM2.5',
    updatedAt: '',
    source: 'demo',
    sourceDetail: 'Sample reading',
  };
}
