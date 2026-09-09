import type { Database } from '@/lib/database.types';
import type { ModelPurpose } from '@/lib/models';

type UsageKind = Database['public']['Enums']['usage_kind'];

/**
 * Its own module because usage-recorder.ts needs it and call.ts imports
 * usage-recorder.ts back. A pure switch that imports nothing of ours cannot
 * close that loop.
 */
export function usageKindFor(
  purpose: ModelPurpose,
): Extract<UsageKind, 'embedding_tokens' | 'chat_tokens'> {
  switch (purpose) {
    case 'embedding':
      return 'embedding_tokens';
    case 'chat':
    case 'condense':
    case 'title':
    case 'dream':
      return 'chat_tokens';
    default: {
      const unhandled: never = purpose;
      return unhandled;
    }
  }
}
