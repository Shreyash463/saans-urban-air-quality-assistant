// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSamplePlan, buildSampleProfile } from '../../tests/fixtures/samplePlan';
import { CommunityActionsSection } from '../components/CommunityActionsSection';
import { QUICK_PICK_CITIES } from '../lib/cities';
import { loadLanguageBundle, t } from '../lib/i18n';
import { formatPlanAsText } from '../lib/planExport';
import { isPlanResponse } from '../lib/validation';
import Simulator from '../sections/Simulator';

const SAMPLE_PROFILE = buildSampleProfile({ hasRespiratoryCondition: false });

describe('Community actions, multiplier slider, exports, and Hindi bundle loading', () => {
  afterEach(() => {
    cleanup();
  });

  it('loads Hindi dictionary dynamically via loadLanguageBundle without throwing', async () => {
    const hiDict = await loadLanguageBundle('hi');
    expect(hiDict.communityHeading).toBe('इसे सामुदायिक पहल बनाएं');
    expect(t('hi', 'useMyLocation')).toBe('मेरा स्थान उपयोग करें');

    const enDict = await loadLanguageBundle('en');
    expect(enDict.communityHeading).toBe('Make it a community effort');
  });

  it('exports communityActions in plain-text plan output and includes Delhi quick pick', () => {
    expect(QUICK_PICK_CITIES).toContain('Delhi');
    const plan = buildSamplePlan();
    expect(plan.communityActions?.length).toBeGreaterThanOrEqual(3);
    expect(isPlanResponse(plan)).toBe(true);

    const exported = formatPlanAsText(plan, 'en');
    expect(exported).toContain('[Make it a community effort]');
  });

  it('renders CommunityActionsSection cleanly with zero axe violations', async () => {
    const plan = buildSamplePlan();
    const { container } = render(
      <CommunityActionsSection actions={plan.communityActions ?? []} language="en" />
    );
    expect(screen.getByText('Make it a community effort')).toBeInTheDocument();
    const axeRes = await axe.run(container, { rules: { region: { enabled: false } } });
    expect(axeRes.violations).toEqual([]);
  });

  it('scales Simulator community CO2 savings across participating households', () => {
    render(<Simulator profile={SAMPLE_PROFILE} />);
    const transitToggle = document.getElementById('sim-switch-commute_transit');
    expect(transitToggle).not.toBeNull();
    fireEvent.click(transitToggle!);
    const slider = screen.getByRole('slider', { name: /Participating households/i });
    const co2Before = screen.getByTestId('community-co2-value').textContent;
    fireEvent.change(slider, { target: { value: '200' } });
    expect(screen.getByTestId('community-co2-value').textContent).not.toBe(co2Before);
  });
});
