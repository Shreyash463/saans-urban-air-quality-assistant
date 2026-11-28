// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSamplePlan } from '../../tests/fixtures/samplePlan';
import { AiBusyRetryNotice } from '../components/PlanStatusNotices';
import { Hero } from '../sections/Hero';

describe('AI busy retry countdown banner and Hero live/demo provenance labels', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('hides AiBusyRetryNotice for no_key fallback and enables retry after countdown', () => {
    const basePlan = buildSamplePlan();
    const { rerender } = render(
      <AiBusyRetryNotice
        plan={{ ...basePlan, generatedBy: 'rules', fallbackReason: 'no_key' }}
        language="en"
        isLoading={false}
        onRetryGemini={vi.fn()}
      />
    );
    expect(screen.queryByTestId('ai-busy-notice')).toBeNull();

    vi.useFakeTimers();
    const onRetry = vi.fn();
    rerender(
      <AiBusyRetryNotice
        plan={{
          ...basePlan,
          generatedBy: 'rules',
          fallbackReason: 'ai_busy',
          retryAfterSeconds: 2,
        }}
        language="en"
        isLoading={false}
        onRetryGemini={onRetry}
      />
    );
    expect(screen.getByTestId('ai-busy-notice')).toHaveTextContent(
      /try again in 2 seconds/i
    );
    const btn = screen.getByRole('button', { name: 'Try Gemini again' });
    expect(btn).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders honest sample-demo vs live Open-Meteo provenance labels in Hero', () => {
    const { rerender } = render(
      <Hero
        language="en"
        previewReading={{
          city: 'Delhi',
          aqi: 310,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T10:00:00+05:30',
          source: 'demo',
        }}
      />
    );
    expect(screen.getByText('Sample reading for demo')).toBeInTheDocument();

    rerender(
      <Hero
        language="en"
        previewReading={{
          city: 'Your location (approx.)',
          aqi: 180,
          dominantPollutant: 'PM2.5',
          updatedAt: '2026-11-26T10:00:00+05:30',
          source: 'live',
          sourceDetail: 'Open-Meteo',
        }}
      />
    );
    expect(screen.queryByText('Sample reading for demo')).toBeNull();
    expect(screen.getByText(/^Live ·/i)).toBeInTheDocument();
    expect(screen.getByText('Your location (approx.)')).toBeInTheDocument();
  });
});
