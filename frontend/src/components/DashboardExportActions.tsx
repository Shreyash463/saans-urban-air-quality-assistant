import { Check, Copy, Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatPlanAsText } from '../lib/planExport';
import type { LanguageCode, PlanResponse } from '../types';
import { Button } from './ui/Button';

async function copyTextSafe(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function triggerPlanDownload(plan: PlanResponse, language: LanguageCode): void {
  const blob = new Blob([formatPlanAsText(plan, language)], {
    type: 'text/plain;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const slug =
    plan.aqi.city
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'city';
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `saans-plan-${slug}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function useExportActions(plan: PlanResponse, language: LanguageCode) {
  const [actionMessage, setActionMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const onPrint = () => {
    try {
      if (typeof window.print === 'function') window.print();
      else setActionMessage(t(language, 'printBlockedNotice'));
    } catch {
      setActionMessage(t(language, 'printBlockedNotice'));
    }
  };

  const onDownload = () => {
    triggerPlanDownload(plan, language);
    setActionMessage(t(language, 'downloadedConfirmation'));
  };

  const onCopy = async () => {
    try {
      await copyTextSafe(formatPlanAsText(plan, language));
      setCopied(true);
      setActionMessage(t(language, 'copiedConfirmation'));
      globalThis.setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionMessage(t(language, 'printBlockedNotice'));
    }
  };

  return { actionMessage, copied, onPrint, onDownload, onCopy };
}

export function DashboardExportActions({
  plan,
  language,
}: {
  plan: PlanResponse;
  language: LanguageCode;
}) {
  const { actionMessage, copied, onPrint, onDownload, onCopy } = useExportActions(
    plan,
    language
  );
  return (
    <div className="no-print flex flex-col items-start sm:items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={onPrint} className="px-3.5 py-2">
          <Printer className="w-4 h-4" aria-hidden="true" />
          <span>{t(language, 'printPlanButton')}</span>
        </Button>
        <Button type="button" onClick={onDownload} className="px-3.5 py-2">
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>{t(language, 'downloadPlanButton')}</span>
        </Button>
        <Button type="button" onClick={() => void onCopy()} className="px-3.5 py-2">
          {copied ? (
            <Check
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
          ) : (
            <Copy className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{t(language, 'copyPlanButton')}</span>
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-xs font-medium text-teal-800 dark:text-teal-300 min-h-[1rem]"
      >
        {actionMessage}
      </p>
    </div>
  );
}
