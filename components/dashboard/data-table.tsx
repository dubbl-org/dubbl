"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

function WindowChrome() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border/50">
      <div className="size-2 rounded-full bg-rose-400/70" />
      <div className="size-2 rounded-full bg-amber-400/70" />
      <div className="size-2 rounded-full bg-emerald-400/70" />
      <span className="ml-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Data
      </span>
    </div>
  );
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = "No data found.",
  onRowClick,
}: DataTableProps<T>) {
  const skeletonWidths = ["w-24", "w-32", "w-20", "w-28", "w-16"];

  if (loading) {
    return (
      <div className="rounded-xl border border-border/50 overflow-hidden bg-card/80 backdrop-blur-sm">
        <WindowChrome />
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 border-b-2 border-emerald-500">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("text-[10px] uppercase tracking-wider font-semibold text-muted-foreground", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="even:bg-muted/30">
                {columns.map((col, ci) => (
                  <TableCell key={col.key}>
                    <Skeleton className={`h-4 animate-shimmer ${skeletonWidths[ci % skeletonWidths.length]}`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-card/80 backdrop-blur-sm">
      <WindowChrome />
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20 border-b-2 border-emerald-500">
            {columns.map((col) => (
              <TableHead key={col.key} className={cn("text-[10px] uppercase tracking-wider font-semibold text-muted-foreground", col.className)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "even:bg-muted/30 transition-colors duration-100 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
