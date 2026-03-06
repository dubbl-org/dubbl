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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileText, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  sortKey?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (key: string) => void;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyMessage = "No data found.",
  emptyAction,
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
}: DataTableProps<T>) {
  const skeletonWidths = ["w-24", "w-32", "w-20", "w-28", "w-16"];

  function renderHeader(col: Column<T>) {
    if (col.sortKey && onSort) {
      const isActive = sortBy === col.sortKey;
      return (
        <button
          onClick={() => onSort(col.sortKey!)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {col.header}
          {isActive ? (
            sortOrder === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 opacity-40" />
          )}
        </button>
      );
    }
    return col.header;
  }

  if (loading) {
    return (
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((col) => (
                <TableHead key={col.key} className={cn("h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", col.className)}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="h-12">
                {columns.map((col, ci) => (
                  <TableCell key={col.key}>
                    <Skeleton className={`h-4 ${skeletonWidths[ci % skeletonWidths.length]}`} />
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
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((col) => (
              <TableHead key={col.key} className={cn("h-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground", col.className)}>
                {renderHeader(col)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-12 text-center"
              >
                <div className="flex flex-col items-center gap-3">
                  <FileText className="size-8 text-muted-foreground/30" />
                  <p className="text-[13px] text-muted-foreground">
                    {emptyMessage}
                  </p>
                  {emptyAction && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={emptyAction.onClick}
                    >
                      {emptyAction.label}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow
                key={i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "h-12 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={cn("text-[13px]", col.className)}>
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
