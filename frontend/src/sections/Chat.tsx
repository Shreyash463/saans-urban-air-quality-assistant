import { MessageSquare } from 'lucide-react';
import type { FormEvent } from 'react';
import { ChatInputForm, ChatMessageLog } from '../components/ChatPanelParts';
import { useChatController } from '../hooks/useChatController';
import { t, type TranslationKey } from '../lib/i18n';
import type { LanguageCode, PlanResponse, UserProfile } from '../types';

const STARTER_QUESTION_KEYS: TranslationKey[] = [
  'chatSuggestion1',
  'chatSuggestion2',
  'chatSuggestion3',
];

function ChatSectionHeader({ language }: { language: LanguageCode }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 dark:text-teal-300">
        <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>{t(language, 'navChat')}</span>
      </div>
      <h2
        id="chat-heading"
        className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50"
      >
        {t(language, 'chatHeading')}
      </h2>
      <p className="mt-1.5 text-base text-slate-600 dark:text-slate-300">
        {t(language, 'chatSubheading')}
      </p>
    </div>
  );
}

function ChatStarterChips({
  language,
  disabled,
  onSelect,
}: {
  language: LanguageCode;
  disabled: boolean;
  onSelect: (q: string) => void;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
        {t(language, 'chatSuggestionsLabel')}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {STARTER_QUESTION_KEYS.map((key) => {
          const text = t(language, key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(text)}
              disabled={disabled}
              className="min-h-[40px] px-3.5 py-2 rounded-full border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#0B1220] text-sm font-medium text-slate-800 dark:text-slate-100 hover:border-teal-600 dark:hover:border-teal-400 hover:bg-teal-50/70 dark:hover:bg-teal-950/40 transition-colors text-left cursor-pointer disabled:opacity-50"
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ChatProps {
  profile: UserProfile;
  plan: PlanResponse | null;
}

export default function Chat({ profile, plan }: ChatProps) {
  const { language } = profile;
  const ctrl = useChatController(profile, plan);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ctrl.submitQuestion(ctrl.input);
  };

  return (
    <section
      id="chat"
      aria-labelledby="chat-heading"
      className="saans-section-anchor py-12 sm:py-16 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <ChatSectionHeader language={language} />
        <div className="saans-theme-surface mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131C2E] p-4 sm:p-6 flex flex-col gap-5">
          <div>
            <ChatStarterChips
              language={language}
              disabled={ctrl.isLoading}
              onSelect={(q) => void ctrl.submitQuestion(q)}
            />
            <ChatMessageLog
              messages={ctrl.messages}
              language={language}
              isLoading={ctrl.isLoading}
              messagesEndRef={ctrl.messagesEndRef}
            />
          </div>
          <ChatInputForm
            language={language}
            input={ctrl.input}
            errorKey={ctrl.errorKey}
            isLoading={ctrl.isLoading}
            onChangeInput={ctrl.setInput}
            onSubmit={onSubmit}
          />
        </div>
      </div>
    </section>
  );
}
