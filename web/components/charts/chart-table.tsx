import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type ChartTableProps = {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

/**
 * The table twin every chart carries. A tooltip enhances a chart; it never gates
 * a value, and a reader who cannot separate two marks by color reads the numbers
 * here instead.
 */
export function ChartTable({ caption, columns, rows }: ChartTableProps) {
  return (
    <details className="group mt-4">
      <summary className="cursor-pointer text-xs text-foreground-lighter hover:text-foreground">
        {caption}
      </summary>
      <div className="mt-3 max-h-64 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row[0]}>
                {row.map((cell, index) => (
                  <TableCell
                    key={columns[index]}
                    className={
                      index === 0 ? 'text-foreground' : 'text-foreground-light tabular-nums'
                    }
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
