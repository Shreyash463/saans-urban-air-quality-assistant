import { MessageSquare, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { t, type TranslationKey } from '../lib/i18n';
import { CHAT_TYPING_MIN_MS, CHAT_TYPING_RANGE_MS } from '../lib/motion';
import { CHAT_MAX_LENGTH, validateChatQuestion } from '../lib/validation';
import { askFollowUp } from '../services/api';
import { generateMockPlan } from '../services/mockPlanGenerator';
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
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

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
        const activePlan = plan ?? generateMockPlan(profile);
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

          {/* Message history log */}
          <div
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label={t(language, 'chatHeading')}
            className="min-h-[180px] max-h-[400px] overflow-y-auto rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0B1220]/80 p-4 space-y-3.5"
          >
            {messages.length === 0 ? (
              <p className="text-base text-slate-600 dark:text-slate-300 py-8 text-center">
                {t(language, 'chatEmptyState')}
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`saans-msg-enter flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950 font-medium'
                        : 'bg-white dark:bg-[#131C2E] border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <p>{msg.text}</p>
                  </div>
                  <span className="mt-1 px-1 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                    {msg.role === 'user' ? 'You' : t(language, 'brandName')} ·{' '}
                    {msg.timestamp}
                  </span>
                </div>
              ))
            )}

            {isLoading ? (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#131C2E] border border-slate-200 dark:border-slate-700 w-fit"
                role="status"
                aria-live="polite"
              >
                <span className="sr-only">{t(language, 'chatTypingSr')}</span>
                <span
                  aria-hidden="true"
                  className="inline-flex items-center gap-1.5 py-1"
                >
                  <span
                    className="saans-typing-dot w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="saans-typing-dot w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400"
                    style={{ animationDelay: '160ms' }}
                  />
                  <span
                    className="saans-typing-dot w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400"
                    style={{ animationDelay: '320ms' }}
                  />
                </span>
              </div>
            ) : null}
          </div>

          {/* Input form with strict 500-char limit and live counter */}
          <form onSubmit={handleSubmit} noValidate className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="saans-chat-input"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                {t(language, 'chatInputLabel')}
              </label>
              <span
                id="saans-chat-counter"
                className={`text-sm tabular-nums ${
                  input.length >= CHAT_MAX_LENGTH
                    ? 'text-amber-800 dark:text-amber-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {input.length} / {CHAT_MAX_LENGTH}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                id="saans-chat-input"
                type="text"
                maxLength={CHAT_MAX_LENGTH}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value.slice(0, CHAT_MAX_LENGTH));
                  if (errorKey) setErrorKey(null);
                }}
                placeholder={t(language, 'chatInputPlaceholder')}
                aria-invalid={errorKey !== null}
                aria-describedby={
                  errorKey
                    ? 'saans-chat-error saans-chat-counter'
                    : 'saans-chat-counter'
                }
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
              />

              <button
                type="submit"
                disabled={isLoading}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-400 dark:hover:bg-teal-300 text-white dark:text-slate-950 font-semibold text-base inline-flex items-center justify-center gap-2 active:scale-[0.97] transition-transform whitespace-nowrap disabled:opacity-55 cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span>{t(language, 'chatSend')}</span>
              </button>
            </div>

            {errorKey ? (
              <p
                id="saans-chat-error"
                role="alert"
                className="text-sm font-medium text-red-700 dark:text-red-300"
              >
                {t(language, errorKey)}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
