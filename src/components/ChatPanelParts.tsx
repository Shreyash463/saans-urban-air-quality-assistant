import { Send } from 'lucide-react';
import type { FormEvent, RefObject } from 'react';
import { t, type TranslationKey } from '../lib/i18n';
import { CHAT_MAX_LENGTH } from '../lib/validation';
import type { ChatMessage, LanguageCode } from '../types';

interface ChatMessageLogProps {
  logRef: RefObject<HTMLDivElement | null>;
  language: LanguageCode;
  messages: ChatMessage[];
  isLoading: boolean;
  wakingServer: boolean;
}

export function ChatMessageLog({
  logRef,
  language,
  messages,
  isLoading,
  wakingServer,
}: ChatMessageLogProps) {
  return (
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
              {msg.role === 'user' ? 'You' : t(language, 'brandName')} · {msg.timestamp}
            </span>
          </div>
        ))
      )}

      {isLoading ? (
        <div
          className="flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#131C2E] border border-slate-200 dark:border-slate-700 w-fit"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">{t(language, 'chatTypingSr')}</span>
          <span aria-hidden="true" className="inline-flex items-center gap-1.5 py-1">
            {[0, 160, 320].map((delay) => (
              <span
                key={delay}
                className="saans-typing-dot w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          {wakingServer ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t(language, 'loadingWakingServer')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface ChatInputFormProps {
  language: LanguageCode;
  input: string;
  isLoading: boolean;
  errorKey: TranslationKey | null;
  onChangeInput: (next: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ChatInputForm({
  language,
  input,
  isLoading,
  errorKey,
  onChangeInput,
  onSubmit,
}: ChatInputFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
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
          onChange={(e) => onChangeInput(e.target.value.slice(0, CHAT_MAX_LENGTH))}
          placeholder={t(language, 'chatInputPlaceholder')}
          aria-invalid={errorKey !== null}
          aria-describedby={
            errorKey ? 'saans-chat-error saans-chat-counter' : 'saans-chat-counter'
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
  );
}
