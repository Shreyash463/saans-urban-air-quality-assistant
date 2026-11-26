import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChatInputForm, ChatMessageLog } from '../components/ChatPanelParts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { t, type TranslationKey } from '../lib/i18n';
import { CHAT_TYPING_MIN_MS, CHAT_TYPING_RANGE_MS } from '../lib/motion';
import { validateChatQuestion } from '../lib/validation';
import { askFollowUp } from '../services/api';
import type { ChatMessage, PlanResponse, UserProfile } from '../types';

interface ChatProps {
  profile: UserProfile;
  plan: PlanResponse | null;
}

/**
 * Compact "Ask Saans" follow-up assistant panel with suggested question chips,
 * 500-char limit + live counter, accessible role="log" history, typing indicator
 * (instant under reduced motion), and auto-scroll to newest message.
 */
export default function Chat({ profile, plan }: ChatProps) {
  const { language } = profile;
  const reducedMotion = useReducedMotion();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [wakingServer, setWakingServer] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setWakingServer(false);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setWakingServer(true);
    }, 6000);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [isLoading]);

  const suggestions: readonly string[] = [
    t(language, 'chatSuggestion1'),
    t(language, 'chatSuggestion2'),
    t(language, 'chatSuggestion3'),
  ];

  // Smoothly keep the newest message in view inside the chat log
  useEffect(() => {
    const container = logRef.current;
    if (!container) return;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isLoading, reducedMotion]);

  const sendQuestion = useCallback(
    async (rawText: string) => {
      const check = validateChatQuestion(rawText);
      if (!check.valid) {
        setErrorKey(check.errorKey ?? 'errorChatRequired');
        return;
      }

      setErrorKey(null);
      const nowLabel = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        text: check.sanitized,
        timestamp: nowLabel,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      try {
        const activePlan = plan ?? {
          ...(await import('../services/mockPlanGenerator')).generateMockPlan(profile),
          isOfflineSample: true,
        };
        // Deterministic realistic delay (550-830ms) skipped completely under reduced motion
        const delayMs = reducedMotion
          ? 0
          : CHAT_TYPING_MIN_MS + ((check.sanitized.length * 17) % CHAT_TYPING_RANGE_MS);

        const [reply] = await Promise.all([
          askFollowUp(check.sanitized, profile, activePlan),
          delayMs > 0
            ? new Promise<void>((resolve) => {
                globalThis.setTimeout(resolve, delayMs);
              })
            : Promise.resolve(),
        ]);

        const replyMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply.answer,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        setMessages((prev) => [...prev, replyMsg]);
      } catch {
        setErrorKey('chatErrorFallback');
      } finally {
        setIsLoading(false);
      }
    },
    [plan, profile, reducedMotion]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendQuestion(input);
  };

  return (
    <section
      id="chat"
      aria-labelledby="chat-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl" data-reveal>
          <div className="flex items-center gap-2.5">
            <MessageSquare
              className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0"
              aria-hidden="true"
            />
            <h2
              id="chat-heading"
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
            >
              {t(language, 'chatHeading')}
            </h2>
          </div>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
            {t(language, 'chatSubheading')}
          </p>
        </div>

        <div className="saans-theme-surface mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-5 sm:p-6 space-y-5">
          {/* Suggested question chips */}
          <div>
            <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
              {t(language, 'chatSuggestionsLabel')}
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void sendQuestion(suggestion)}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] hover:border-teal-600/60 dark:hover:border-teal-400/60 text-sm font-medium text-slate-800 dark:text-slate-200 text-left transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <ChatMessageLog
            logRef={logRef}
            language={language}
            messages={messages}
            isLoading={isLoading}
            wakingServer={wakingServer}
          />

          <ChatInputForm
            language={language}
            input={input}
            isLoading={isLoading}
            errorKey={errorKey}
            onChangeInput={(next) => {
              setInput(next);
              if (errorKey) setErrorKey(null);
            }}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </section>
  );
}
