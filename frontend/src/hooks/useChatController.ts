import { useEffect, useRef, useState } from 'react';
import type { ChatErrorKey } from '../components/ChatPanelParts';
import { getAqiCategory } from '../lib/aqi';
import { t } from '../lib/i18n';
import { validateChatQuestion } from '../lib/validation';
import { ApiRequestError, askFollowUp } from '../services/api';
import type { ChatMessage, PlanResponse, RoutineTimeSlot, UserProfile } from '../types';

const TIME_SLOTS: readonly RoutineTimeSlot[] = [
  'morning',
  'midday',
  'evening',
  'night',
];

function makeMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string
): ChatMessage {
  return { id, role, text, timestamp: new Date().toISOString() };
}

function buildFallbackContextPlan(profile: UserProfile): PlanResponse {
  const city = profile.city || 'Delhi';
  const cat = getAqiCategory(180);
  return {
    aqi: {
      city,
      aqi: 180,
      dominantPollutant: 'PM2.5',
      updatedAt: '',
      source: 'demo',
    },
    summary: `${city} sample context (${cat.label.en}).`,
    healthAdvisory: 'Consult a doctor if symptoms occur.',
    routine: TIME_SLOTS.map((timeSlot) => ({
      timeSlot,
      title: `${timeSlot} routine`,
      detail: 'Keep indoor air clean during smog hours.',
      impactNote: 'Lowers PM2.5 exposure.',
    })),
    indoorHacks: [
      {
        title: 'Wet mop',
        howTo: 'Damp mop floors daily.',
        estimatedBenefit: 'Reduces settled PM2.5',
        costLevel: 'free',
      },
    ],
    alternatives: [
      {
        current: 'Dry sweeping',
        swap: 'Wet mopping',
        why: 'Prevents dust resuspension.',
        pm25ReductionPct: 12,
        co2SavedKgPerMonth: 0,
      },
    ],
    maskGuidance: 'Wear a fitted N95 outdoors near traffic.',
    disclaimer: 'Not medical advice.',
  };
}

function resolveChatFailureText(err: unknown, language: 'en' | 'hi'): string {
  return err instanceof ApiRequestError && err.kind === 'rate_limit'
    ? t(language, 'planRateLimitBody')
    : t(language, 'chatErrorFallback');
}

async function requestReplyText(
  sanitized: string,
  profile: UserProfile,
  plan: PlanResponse | null
): Promise<string> {
  try {
    const reply = await askFollowUp(
      sanitized,
      profile,
      plan ?? buildFallbackContextPlan(profile)
    );
    return reply.answer;
  } catch (err) {
    return resolveChatFailureText(err, profile.language);
  }
}

export function useChatController(profile: UserProfile, plan: PlanResponse | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [errorKey, setErrorKey] = useState<ChatErrorKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (
      messages.length > 0 &&
      typeof messagesEndRef.current?.scrollIntoView === 'function'
    ) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isLoading]);

  const append = (role: 'user' | 'assistant', text: string) => {
    seqRef.current += 1;
    setMessages((prev) => [
      ...prev,
      makeMessage(`${role}-${seqRef.current}`, role, text),
    ]);
  };

  const submitQuestion = async (rawText: string) => {
    if (isLoading) return;
    const res = validateChatQuestion(rawText);
    if (!res.valid) {
      setErrorKey((res.errorKey as ChatErrorKey) ?? 'errorChatRequired');
      return;
    }
    setErrorKey(null);
    append('user', res.sanitized);
    setInput('');
    setIsLoading(true);
    append('assistant', await requestReplyText(res.sanitized, profile, plan));
    setIsLoading(false);
  };

  return {
    messages,
    input,
    errorKey,
    isLoading,
    messagesEndRef,
    submitQuestion,
    setInput: (val: string) => {
      setInput(val);
      if (errorKey) setErrorKey(null);
    },
  };
}
