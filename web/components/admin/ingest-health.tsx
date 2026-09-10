import { EmptyState } from '@/components/app/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatSince } from '@/lib/analytics/format';
import type { IngestHealthRow } from '@/lib/analytics/queries';
import type { Database } from '@/lib/database.types';

import { StatusBadge, type StatusTone } from './status-badge';

type ConnectionStatus = Database['public']['Enums']['connection_status'];

const STATUS_TONE: Record<ConnectionStatus, StatusTone> = {
  active: 'positive',
  syncing: 'neutral',
  error: 'critical',
  revoked: 'warning',
  expired: 'warning',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  active: 'Active',
  syncing: 'Syncing',
  error: 'Error',
  revoked: 'Revoked',
  expired: 'Expired',
};

/** The reason column: what failed, the stage it failed in, and the error recorded. */
function failureText(row: IngestHealthRow): string {
  if (!row.latestFailure) return row.statusDetail ?? 'No failures';

  const verb = row.latestFailure.status === 'timeout' ? 'Timed out' : 'Failed';
  const reason = row.latestFailure.error ?? 'no reason recorded';
  return `${verb} at ${row.latestFailure.stage}: ${reason}`;
}

export function IngestHealth({ rows, now }: { rows: readonly IngestHealthRow[]; now: Date }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No sources connected"
        description="Connect a source to see its imports here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last sync</TableHead>
          <TableHead className="text-right">Documents</TableHead>
          <TableHead className="text-right">Failures</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.connectionId}>
            <TableCell className="text-foreground capitalize">{row.provider}</TableCell>
            <TableCell>
              <StatusBadge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</StatusBadge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatSince(row.lastSyncedAt, now)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {row.documentsPulled.toLocaleString('en-US')}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {row.recentFailures.toLocaleString('en-US')}
            </TableCell>
            <TableCell
              className="max-w-[36ch] truncate text-muted-foreground"
              title={failureText(row)}
            >
              {failureText(row)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
