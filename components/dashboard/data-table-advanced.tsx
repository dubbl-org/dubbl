"use client";

import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronUp, ChevronDown, ChevronsUpDown, Settings2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdvancedColumn<T> {
  key: string;
  header: string;
  className?: string;
  sortable?: boolean;
  filterable?: boolean;
  render: (row: T) => React.ReactNode;
  getValue?: (row: T) => string | number;
}

interface DataTableAdvancedProps<T> {
  columns: AdvancedColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  selectable?: boolean;
  onSelectionChange?: (selected: T[]) => void;
  bulkActions?: React.ReactNode;
  searchPlaceholder?: string;
}

type SortDir = "asc" | "desc" | null;

export function DataTableAdvanced<T>({
  columns,
  data,
  loading,
  emptyMessage = "No data found.",
  onRowClick,
  pageSize = 25,
  selectable,
  onSelectionChange,
  bulkActions,
  searchPlaceholder = "Search...",
}: DataTableAdvancedProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(columns.map((c) => c.key))
  );

  function toggleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }

  const filtered = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        if (!col.getValue) return false;
        return String(col.getValue(row)).toLowerCase().includes(lower);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.getValue) return filtered;
    return [...filtered].sort((a, b) => {
      const av = col.getValue!(a);
      const bv = col.getValue!(b);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const activeCols = columns.filter((c) => visibleCols.has(c.key));

  function toggleSelect(index: number) {
    const next = new Set(selectedIds);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIds(next);
    onSelectionChange?.(
      Array.from(next).map((i) => sorted[i])
    );
  }

  function toggleAll() {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(sorted.map((_, i) => i));
      setSelectedIds(all);
      onSelectionChange?.([...sorted]);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-8 w-8" />
        </div>
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="h-10 bg-muted/50 hover:bg-muted/50">
                {activeCols.map((col) => (
                  <TableHead key={col.key} className={cn("h-10 text-xs font-medium text-muted-foreground", col.className)}>
                    {col.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="h-10">
                  {activeCols.map((col, ci) => (
                    <TableCell key={col.key} className="py-1.5">
                      <Skeleton className={`h-4 ${["w-24", "w-32", "w-20", "w-28", "w-16"][ci % 5]}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="h-8 w-64 text-sm"
          />
          {selectable && selectedIds.size > 0 && bulkActions}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Settings2 className="mr-1.5 size-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {columns.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.key}
                checked={visibleCols.has(col.key)}
                onCheckedChange={(checked) => {
                  const next = new Set(visibleCols);
                  if (checked) next.add(col.key);
                  else next.delete(col.key);
                  setVisibleCols(next);
                }}
              >
                {col.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="h-10 bg-muted/50 hover:bg-muted/50">
              {selectable && (
                <TableHead className="w-10 h-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sorted.length && sorted.length > 0}
                    onChange={toggleAll}
                    className="size-3.5 rounded border-muted-foreground/30"
                  />
                </TableHead>
              )}
              {activeCols.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "h-10 text-xs font-medium text-muted-foreground",
                    col.sortable && "cursor-pointer select-none",
                    col.className
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      sortKey === col.key ? (
                        sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 text-muted-foreground/40" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={activeCols.length + (selectable ? 1 : 0)}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paged.map((row, i) => {
                const globalIdx = page * pageSize + i;
                return (
                  <TableRow
                    key={i}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "h-10 transition-colors",
                      onRowClick && "cursor-pointer",
                      selectedIds.has(globalIdx) && "bg-muted/50"
                    )}
                  >
                    {selectable && (
                      <TableCell className="py-1.5 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(globalIdx)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelect(globalIdx);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="size-3.5 rounded border-muted-foreground/30"
                        />
                      </TableCell>
                    )}
                    {activeCols.map((col) => (
                      <TableCell key={col.key} className={cn("py-1.5", col.className)}>
                        {col.render(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground tabular-nums">
            {sorted.length} result{sorted.length !== 1 ? "s" : ""}
            {search && ` for "${search}"`}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-md"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="px-2 text-xs text-muted-foreground tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7 rounded-md"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
