import type { Database } from '@/lib/database.types';
import type { ModelPurpose } from '@/lib/models';

type UsageKind = Database['public']['Enums']['usage_kind'];

/** Its own module, so usage-recorder.ts and call.ts do not form an import cycle. */
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
    case 'extract':
      return 'chat_tokens';
    default: {
      const unhandled: never = purpose;
      return unhandled;
    }
  }
}
