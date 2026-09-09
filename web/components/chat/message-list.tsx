import { ErrorState } from '@/components/app/error-state';
import type { ChatTurn } from '@/lib/chat/turns';

import { AssistantTurn } from './assistant-turn';

export function MessageList({ turns }: { turns: readonly ChatTurn[] }) {
  return (
    <ol className="flex flex-col gap-8">
      {turns.map((turn) => (
        <li key={turn.id}>{renderTurn(turn)}</li>
      ))}
    </ol>
  );
}

function renderTurn(turn: ChatTurn) {
  switch (turn.kind) {
    case 'question':
      return (
        <p className="max-w-[var(--measure-prose)] font-heading text-base leading-snug font-medium text-foreground">
          {turn.content}
        </p>
      );
    case 'answer':
      return (
        <AssistantTurn
          content={turn.content}
          citations={turn.citations}
          streaming={turn.streaming}
        />
      );
    case 'failure':
      return <ErrorState title="That question did not get an answer" detail={turn.message} />;
    default: {
      const unhandled: never = turn;
      return unhandled;
    }
  }
}
