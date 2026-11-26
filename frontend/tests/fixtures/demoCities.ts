import demoCitiesContract from '../../../contract/demo-cities.json';
import { sanitizeCity } from '../../src/lib/validation';
import type { AirQualityReading } from '../../src/types';

interface DemoCityEntry {
  displayName: string;
  aqi: number;
  dominantPollutant: string;
}

const DEMO_CITY_TABLE = demoCitiesContract.cities as Readonly<
  Record<string, DemoCityEntry>
>;
const UNKNOWN_CITY_AQI = demoCitiesContract.unknownCityAqi;

export const QUICK_PICK_CITIES: readonly string[] = [
  'Delhi',
  'Mumbai',
  'Pune',
  'Lucknow',
  'Kolkata',
];

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
    dominantPollutant: demoCitiesContract.unknownCityPollutant,
    updatedAt: '',
    source: 'demo',
    sourceDetail: 'Sample reading',
  };
}
