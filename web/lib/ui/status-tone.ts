/**
 * The tones a status can be shown in. Connections and dreams both write to it
 * and StatusPill draws it, so it lives with none of the three: it is the
 * vocabulary they agree on rather than something any one of them owns.
 */
export type StatusTone = 'neutral' | 'positive' | 'progress' | 'warning' | 'destructive';
