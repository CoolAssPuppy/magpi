import type { ChatEvent, Citation } from './protocol';

export type ChatTurn =
  | { readonly kind: 'question'; readonly id: string; readonly content: string }
  | {
      readonly kind: 'answer';
      readonly id: string;
      readonly content: string;
      readonly citations: readonly Citation[];
      readonly streaming: boolean;
    }
  | { readonly kind: 'failure'; readonly id: string; readonly message: string };

export type ChatState = {
  readonly turns: readonly ChatTurn[];
  readonly asking: boolean;
  readonly title: string | null;
};

export type ChatAction =
  | { readonly type: 'ask'; readonly question: string; readonly turnId: string }
  | { readonly type: 'event'; readonly event: ChatEvent };

export function initialChatState(
  turns: readonly ChatTurn[],
  title: string | null = null,
): ChatState {
  return { turns, asking: false, title };
}

/**
 * The whole of the streaming screen's behavior, with no React in it. The
 * pending answer is the last turn, which is what every event acts on.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ask':
      return {
        ...state,
        asking: true,
        turns: [
          ...state.turns,
          { kind: 'question', id: `${action.turnId}-q`, content: action.question },
          {
            kind: 'answer',
            id: `${action.turnId}-a`,
            content: '',
            citations: [],
            streaming: true,
          },
        ],
      };
    case 'event':
      return applyEvent(state, action.event);
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case 'citations':
      return updatePending(state, (answer) => ({ ...answer, citations: event.citations }));
    case 'delta':
      return updatePending(state, (answer) => ({
        ...answer,
        content: answer.content + event.text,
      }));
    case 'done':
      return {
        ...state,
        asking: false,
        turns: replaceLast(state.turns, (answer) =>
          answer.kind === 'answer' ? { ...answer, id: event.messageId, streaming: false } : answer,
        ),
      };
    case 'title':
      return { ...state, title: event.title };
    case 'error':
      return {
        ...state,
        asking: false,
        turns: replaceLast(state.turns, (turn) => ({
          kind: 'failure',
          id: turn.id,
          message: event.message,
        })),
      };
    default: {
      const unhandled: never = event;
      return unhandled;
    }
  }
}

function updatePending(
  state: ChatState,
  update: (answer: Extract<ChatTurn, { kind: 'answer' }>) => ChatTurn,
): ChatState {
  return {
    ...state,
    turns: replaceLast(state.turns, (turn) => (turn.kind === 'answer' ? update(turn) : turn)),
  };
}

function replaceLast(
  turns: readonly ChatTurn[],
  replace: (turn: ChatTurn) => ChatTurn,
): readonly ChatTurn[] {
  const last = turns.at(-1);
  if (!last) return turns;
  return [...turns.slice(0, -1), replace(last)];
}
