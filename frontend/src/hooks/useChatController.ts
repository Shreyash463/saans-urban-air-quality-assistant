import { useEffect, useRef, useState } from 'react';
import type { ChatErrorKey } from '../components/ChatPanelParts';
import { getAqiCategory } from '../lib/aqi';
import { t } from '../lib/i18n';
import { validateChatQuestion } from '../lib/validation';
import { ApiRequestError, askFollowUp } from '../services/api';
import type { ChatMessage, PlanResponse, RoutineItem, UserProfile } from '../types';

const FALLBACK_ROUTINE: RoutineItem[] = [
  {
    timeSlot: 'morning',
    title: 'Morning protection',
    detail: 'Keep windows closed.',
    impactNote: 'Cuts smog ingress.',
  },
  {
    timeSlot: 'midday',
    title: 'Midday window',
    detail: 'Brief cross-ventilation.',
    impactNote: 'Refreshes air.',
  },
  {
    timeSlot: 'evening',
    title: 'Evening seal',
    detail: 'Run exhaust when cooking.',
    impactNote: 'Traps fumes.',
  },
  {
    timeSlot: 'night',
    title: 'Night recovery',
    detail: 'Wet-mop floors earlier.',
    impactNote: 'Lower dust.',
  },
];

function makeMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string
): ChatMessage {
  return { id, role, text, timestamp: new Date().toISOString() };
}

function buildFallbackContextPlan(profile: UserProfile): PlanResponse {
  const cat = getAqiCategory(180);
  return {
    aqi: {
      city: profile.city || 'Delhi',
      aqi: 180,
      dominantPollutant: 'PM2.5',
      updatedAt: '',
      source: 'demo',
    },
    summary: `${profile.city || 'Delhi'} sample context (${cat.label.en}).`,
    healthAdvisory: 'Consult a doctor if symptoms occur.',
    routine: FALLBACK_ROUTINE,
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
