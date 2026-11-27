// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSamplePlan, buildSampleProfile } from '../../tests/fixtures/samplePlan';
import { useChatController } from '../hooks/useChatController';
import * as api from '../services/api';

const TEST_PROFILE = buildSampleProfile({
  city: 'Pune',
  householdSize: 3,
  hasRespiratoryCondition: false,
  budget: 'medium',
});

describe('useChatController hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates empty questions and clears error state when typing input', async () => {
    const plan = buildSamplePlan();
    const { result } = renderHook(() => useChatController(TEST_PROFILE, plan));

    await act(async () => {
      await result.current.submitQuestion('   ');
    });
    expect(result.current.errorKey).toBe('errorChatRequired');

    act(() => {
      result.current.setInput('Mask question');
    });
    expect(result.current.errorKey).toBeNull();
    expect(result.current.input).toBe('Mask question');
  });

  it('sends follow-ups with plan or fallback context and maps rate-limit/network failures', async () => {
    const askSpy = vi
      .spyOn(api, 'askFollowUp')
      .mockResolvedValueOnce({ answer: 'Wear N95 near traffic.' })
      .mockRejectedValueOnce(new api.ApiRequestError('rate_limit', 'Too busy'))
      .mockRejectedValueOnce(new Error('Offline'));

    const { result } = renderHook(() => useChatController(TEST_PROFILE, null));
    await act(async () => {
      await result.current.submitQuestion('Which mask works?');
      await result.current.submitQuestion('Follow up 1');
      await result.current.submitQuestion('Follow up 2');
    });
    expect(askSpy).toHaveBeenCalledTimes(3);
    expect(askSpy.mock.calls[0]?.[2].aqi.source).toBe('demo');
    expect(result.current.messages).toHaveLength(6);
    expect(result.current.messages[1].text).toContain('Wear N95');
    expect(result.current.messages[3].text).not.toBe('');
    expect(result.current.messages[5].text).not.toBe('');
  });
});
