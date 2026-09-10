'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createConversationAction } from '@/app/(app)/chat/actions';

import { Composer } from './composer';
import { SpaceFilter, type SpaceOption } from './space-filter';

type NewConversationProps = {
  readonly spaces: readonly SpaceOption[];
};

/** The first question opens the conversation and travels to it in the query string. */
export function NewConversation({ spaces }: NewConversationProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function open(question: string) {
    setOpening(true);
    setFailure(null);

    const state = await createConversationAction({
      spaceFilter: selected.length === 0 ? null : [...selected],
    });

    if (state.status !== 'success') {
      setOpening(false);
      setFailure(state.status === 'error' ? state.message : null);
      return;
    }

    router.push(`/chat/${state.data}?ask=${encodeURIComponent(question)}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <Composer
        onAsk={(question) => void open(question)}
        busy={opening}
        placeholder="Ask anything in your knowledge base"
        autoFocus
      />

      <div className="flex items-center gap-3">
        <SpaceFilter spaces={spaces} selected={selected} onChange={setSelected} />
        <p className="text-xs text-tertiary-foreground">
          {selected.length === 0
            ? 'Searching every space you can see.'
            : 'Searching the spaces you picked.'}
        </p>
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
