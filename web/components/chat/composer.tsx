'use client';

import { ArrowUp } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type ComposerProps = {
  readonly onAsk: (question: string) => void;
  readonly busy: boolean;
  readonly placeholder: string;
  readonly autoFocus?: boolean;
};

export function Composer({ onAsk, busy, placeholder, autoFocus }: ComposerProps) {
  const [question, setQuestion] = useState('');
  const canAsk = question.trim() !== '' && !busy;

  function ask(event?: FormEvent) {
    event?.preventDefault();
    if (!canAsk) return;

    onAsk(question.trim());
    setQuestion('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    ask();
  }

  return (
    <form onSubmit={ask} className="flex items-end gap-2">
      <Textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Ask a question"
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={2}
        className="min-h-[52px] resize-none rounded-[var(--radius-panel)] border-border bg-background-surface-100 text-sm text-foreground placeholder:text-foreground-lighter focus-visible:ring-border-strong"
      />
      <Button type="submit" size="icon" disabled={!canAsk} aria-label="Ask">
        <ArrowUp />
      </Button>
    </form>
  );
}
