import { Send } from 'lucide-react';
import type { FormEvent, RefObject } from 'react';
import { t } from '../lib/i18n';
import { CHAT_MAX_LENGTH } from '../lib/validation';
import type { ChatMessage, LanguageCode } from '../types';
import { Button } from './ui/Button';

export type ChatErrorKey = 'errorChatRequired' | 'errorChatTooLong';

interface ChatMessageLogProps {
  messages: ChatMessage[];
  language: LanguageCode;
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

interface ChatInputFormProps {
  language: LanguageCode;
  input: string;
  errorKey: ChatErrorKey | null;
  isLoading: boolean;
  onChangeInput: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
}

function ChatBubble({
  message,
  language,
}: {
  message: ChatMessage;
  language: LanguageCode;
}) {
  const isUser = message.role === 'user';
  const bubbleTone = isUser
    ? 'bg-teal-700 text-white dark:bg-teal-400 dark:text-slate-950 rounded-br-sm'
    : 'bg-slate-100 text-slate-800 dark:bg-[#0B1220] dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-bl-sm';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed whitespace-pre-line ${bubbleTone}`}
      >
        <span className="sr-only">
          {isUser ? (language === 'hi' ? 'आप' : 'You') : t(language, 'brandName')}:{' '}
        </span>
        {message.text}
      </div>
    </div>
  );
}

export function ChatMessageLog({
  messages,
  language,
  isLoading,
  messagesEndRef,
}: ChatMessageLogProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      data-testid="chat-messages"
      className="h-80 sm:h-96 overflow-y-auto pr-1 space-y-4 border-b border-slate-200/80 dark:border-slate-800 pb-4"
    >
      {messages.length === 0 ? (
        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed">
          {t(language, 'chatEmptyState')}
        </p>
      ) : (
        messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} language={language} />
        ))
      )}
      {isLoading ? (
        <div className="flex justify-start" aria-live="polite">
          <div className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-slate-100 dark:bg-[#0B1220] border border-slate-200 dark:border-slate-800">
            <span className="w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse [animation-delay:120ms]" />
            <span className="w-2 h-2 rounded-full bg-teal-600 dark:bg-teal-400 animate-pulse [animation-delay:240ms]" />
            <span className="sr-only">{t(language, 'chatTypingSr')}</span>
          </div>
        </div>
      ) : null}
      <div ref={messagesEndRef} />
    </div>
  );
}

function ChatInputLabelRow({
  language,
  length,
}: {
  language: LanguageCode;
  length: number;
}) {
  const tone =
    length >= CHAT_MAX_LENGTH
      ? 'text-amber-800 dark:text-amber-300 font-semibold'
      : 'text-slate-600 dark:text-slate-300';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <label
        htmlFor="saans-chat-input"
        className="text-base font-semibold text-slate-900 dark:text-slate-100"
      >
        {t(language, 'chatInputLabel')}
      </label>
      <span
        id="saans-chat-counter"
        className={`font-mono text-sm tabular-nums ${tone}`}
      >
        {length} / {CHAT_MAX_LENGTH}
      </span>
    </div>
  );
}

export function ChatInputForm({
  language,
  input,
  errorKey,
  isLoading,
  onChangeInput,
  onSubmit,
}: ChatInputFormProps) {
  const describedBy = errorKey
    ? 'saans-chat-error saans-chat-counter'
    : 'saans-chat-counter';
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2">
      <ChatInputLabelRow language={language} length={input.length} />
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          id="saans-chat-input"
          type="text"
          maxLength={CHAT_MAX_LENGTH}
          value={input}
          onChange={(e) => onChangeInput(e.target.value.slice(0, CHAT_MAX_LENGTH))}
          placeholder={t(language, 'chatInputPlaceholder')}
          aria-invalid={errorKey !== null}
          aria-describedby={describedBy}
          className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
          className="min-h-[48px] px-5 py-2.5 text-base"
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          <span>{t(language, isLoading ? 'chatSending' : 'chatSend')}</span>
        </Button>
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
