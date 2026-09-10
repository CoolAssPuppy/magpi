import type { Enums } from '@/lib/database.types';
import type { StatusTone } from '@/lib/ui/status-tone';

export type ConnectionStatus = Enums<'connection_status'>;

/** What a person can do about the state the connection is in. At most one action. */
export type ConnectionRecovery =
  | { readonly kind: 'none' }
  | { readonly kind: 'reconnect'; readonly label: string }
  | { readonly kind: 'resync'; readonly label: string };

export type ConnectionStatusInput = {
  readonly status: ConnectionStatus;
  readonly statusDetail: string | null;
  readonly lastSyncedAt: string | null;
};

export type ConnectionStatusView = {
  readonly status: ConnectionStatus;
  readonly label: string;
  readonly tone: StatusTone;
  /** Always a sentence. A revoked connection with no recorded reason still says why it stopped. */
  readonly reason: string;
  readonly recovery: ConnectionRecovery;
};

const RECONNECT: ConnectionRecovery = { kind: 'reconnect', label: 'Reconnect' };
const RESYNC: ConnectionRecovery = { kind: 'resync', label: 'Sync now' };

export function describeConnectionStatus(input: ConnectionStatusInput): ConnectionStatusView {
  const detail = input.statusDetail?.trim();

  switch (input.status) {
    case 'active':
      return {
        status: input.status,
        label: 'Connected',
        tone: 'positive',
        reason: detail ?? 'Reading on the usual schedule.',
        recovery: RESYNC,
      };
    case 'syncing':
      return {
        status: input.status,
        label: 'Syncing',
        tone: 'progress',
        reason: detail ?? 'Reading from the source now.',
        recovery: { kind: 'none' },
      };
    case 'error':
      return {
        status: input.status,
        label: 'Sync failed',
        tone: 'destructive',
        reason: detail ?? 'The last sync failed and the source gave no reason.',
        recovery: RESYNC,
      };
    case 'revoked':
      return {
        status: input.status,
        label: 'Access revoked',
        tone: 'destructive',
        reason: detail ?? 'Access to this account was revoked at the provider.',
        recovery: RECONNECT,
      };
    case 'expired':
      return {
        status: input.status,
        label: 'Access expired',
        tone: 'warning',
        reason: detail ?? 'The access token expired and could not be refreshed.',
        recovery: RECONNECT,
      };
    default: {
      const unhandled: never = input.status;
      throw new Error(`Unhandled connection status: ${String(unhandled)}`);
    }
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
}

export function formatLastSynced(lastSyncedAt: string | null, now: Date): string {
  if (!lastSyncedAt) return 'Never synced';

  const elapsed = now.getTime() - new Date(lastSyncedAt).getTime();
  if (elapsed < MINUTE) return 'Synced just now';
  if (elapsed < HOUR) return `Synced ${plural(Math.floor(elapsed / MINUTE), 'minute')}`;
  if (elapsed < DAY) return `Synced ${plural(Math.floor(elapsed / HOUR), 'hour')}`;
  return `Synced ${plural(Math.floor(elapsed / DAY), 'day')}`;
}
