import { describe, expect, it } from 'vitest';
import {
  clampAqi,
  getAqiAriaLabel,
  getAqiCategory,
  getAqiGaugeRatio,
} from '../lib/aqi';

describe('Indian CPCB AQI category helpers', () => {
  const boundaryCases: Array<[number, string, string]> = [
    [0, 'good', 'Good'],
    [50, 'good', 'Good'],
    [51, 'satisfactory', 'Satisfactory'],
    [100, 'satisfactory', 'Satisfactory'],
    [101, 'moderate', 'Moderate'],
    [200, 'moderate', 'Moderate'],
    [201, 'poor', 'Poor'],
    [300, 'poor', 'Poor'],
    [301, 'very_poor', 'Very Poor'],
    [400, 'very_poor', 'Very Poor'],
    [401, 'severe', 'Severe'],
    [500, 'severe', 'Severe'],
  ];

  it.each(boundaryCases)(
    'maps AQI %i to category "%s" (%s)',
    (aqi, expectedKey, expectedLabel) => {
      const category = getAqiCategory(aqi);
      expect(category.key).toBe(expectedKey);
      expect(category.label.en).toBe(expectedLabel);
      expect(category.label.hi.length).toBeGreaterThan(0);
      expect(category.icon.length).toBeGreaterThan(0);
    }
  );

  it('clamps out-of-range and non-finite AQI values cleanly', () => {
    expect(clampAqi(-40)).toBe(0);
    expect(clampAqi(720)).toBe(500);
    expect(clampAqi(Number.NaN)).toBe(0);
    expect(getAqiCategory(999).key).toBe('severe');
    expect(getAqiGaugeRatio(250)).toBeCloseTo(0.5, 5);
  });

  it('generates accessible aria-label text in English and Hindi', () => {
    expect(getAqiAriaLabel(380, 'en')).toBe('Air Quality Index 380, Very Poor');
    expect(getAqiAriaLabel(380, 'hi')).toContain('380');
    expect(getAqiAriaLabel(380, 'hi')).toContain('बहुत खराब');
  });
});
