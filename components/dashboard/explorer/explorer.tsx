"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  Layers,
  Plus,
  Rows3,
  Rows4,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState } from "@/components/dashboard/error-state";
import { InfoTip } from "@/components/dashboard/overview/widgets";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatDay, parseDay, toDayKey } from "./cells";
import { useRecords } from "./use-records";
import { useAssistant } from "@/components/dashboard/assistant/assistant-context";
import { TillyMark } from "@/components/dashboard/assistant/tilly-mark";
import type { ExplorerColumn, ExplorerConfig, ExplorerHelpers } from "./types";

/* ------------------------------------------------------------------ */
/*  Dates                                                              */
/* ------------------------------------------------------------------ */

type Preset = "all" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "this-year" | "last-year" | "last-12m" | "custom";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "last-12m", label: "Last 12 months" },
];

function presetRange(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  const day = (yy: number, mm: number, dd: number) => toDayKey(new Date(yy, mm, dd));
  switch (preset) {
    case "this-month":
      return { from: day(y, m, 1), to: day(y, m + 1, 0) };
    case "last-month":
      return { from: day(y, m - 1, 1), to: day(y, m, 0) };
    case "this-quarter":
      return { from: day(y, q, 1), to: day(y, q + 3, 0) };
    case "last-quarter":
      return { from: day(y, q - 3, 1), to: day(y, q, 0) };
    case "this-year":
      return { from: day(y, 0, 1), to: day(y, 11, 31) };
    case "last-year":
      return { from: day(y - 1, 0, 1), to: day(y - 1, 11, 31) };
    case "last-12m":
      return { from: day(y, m - 11, 1), to: day(y, m + 1, 0) };
    default:
      return {};
  }
}

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short" });
const MONTH_YEAR_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function monthKey(value: string | null | undefined) {
  return value ? value.slice(0, 7) : null;
}

function monthLabel(key: string, long = false) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  return long ? MONTH_YEAR_FMT.format(date) : MONTH_FMT.format(date);
}

function shortMoney(cents: number) {
  const n = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  if (n >= 1_000_000) return `${sign}${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${sign}${+(n / 1000).toFixed(1)}k`;
  return `${sign}${Math.round(n)}`;
}

/* ------------------------------------------------------------------ */
/*  Remembered view                                                    */
/* ------------------------------------------------------------------ */

interface Prefs {
  columns: Record<string, boolean>;
  density: "compact" | "comfortable";
  pageSize: number;
  sort: { key: string; dir: "asc" | "desc" } | null;
  groupBy: string;
  insights: boolean;
}

function loadPrefs(id: string): Partial<Prefs> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(`dubbl.explorer.${id}`) || "{}");
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function ToolbarButton({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors",
        active
          ? "border-transparent bg-foreground/[0.06] font-medium text-foreground"
          : "border-border/80 text-foreground/75 hover:bg-foreground/[0.03] hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

function compare(a: unknown, b: unknown) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ------------------------------------------------------------------ */
/*  Explorer                                                           */
/* ------------------------------------------------------------------ */

/**
 * `refreshKey`: change it (e.g. a counter) to reload the rows from outside,
 * after a page-owned dialog saves, without losing the current filters.
 */
export function Explorer<T>({ config, refreshKey }: { config: ExplorerConfig<T>; refreshKey?: unknown }) {
  const router = useRouter();
  const { rows, loading, error, total, truncated, refresh } = useRecords<T>(config.endpoint, config.params, config.select, refreshKey);

  // View preferences, remembered per list
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const saved = loadPrefs(config.id);
    return {
      columns: saved.columns ?? {},
      density: saved.density ?? "compact",
      pageSize: saved.pageSize ?? 50,
      sort: saved.sort ?? config.defaultSort ?? null,
      groupBy: saved.groupBy ?? "none",
      insights: saved.insights ?? true,
    };
  });
  useEffect(() => {
    try {
      localStorage.setItem(`dubbl.explorer.${config.id}`, JSON.stringify(prefs));
    } catch {
      // storage full: the view still works, it just won't be remembered
    }
  }, [config.id, prefs]);
  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  // Filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [preset, setPreset] = useState<Preset>("all");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [parties, setParties] = useState<Set<string>>(new Set());
  const [facetFilters, setFacetFilters] = useState<Record<string, Set<string>>>({});
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const range = preset === "custom" ? custom : presetRange(preset);
  const visibleColumns = config.columns.filter((c) => prefs.columns[c.key] ?? !c.hidden);
  const moneyColumns = visibleColumns.filter((c) => c.money && !c.noTotal);
  const statusOptions = useMemo(() => config.status?.options ?? [], [config.status]);

  const resetPage = () => setPage(1);

  // Everything except the status filter, so the tabs and metrics show the whole picture
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !config.search(row).some((v) => v && v.toLowerCase().includes(q))) return false;
      if (config.date && (range.from || range.to)) {
        const d = config.date.get(row)?.slice(0, 10);
        if (!d) return false;
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
      }
      if (config.party && parties.size > 0 && !parties.has(config.party.get(row) ?? "")) return false;
      for (const facet of config.facets ?? []) {
        const set = facetFilters[facet.key];
        if (set && set.size > 0 && !set.has(facet.value(row) ?? "")) return false;
      }
      return true;
    });
  }, [rows, search, range.from, range.to, parties, facetFilters, config]);

  const filtered = useMemo(
    () => (config.status && status !== "all" ? base.filter((r) => config.status!.get(r) === status) : base),
    [base, status, config.status]
  );

  const sorted = useMemo(() => {
    const sort = prefs.sort;
    const col = sort && config.columns.find((c) => c.key === sort.key);
    if (!sort || !col?.value) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => compare(col.value!(a), col.value!(b)) * dir);
  }, [filtered, prefs.sort, config.columns]);

  const amountOf = useCallback((row: T) => config.amount?.(row) ?? 0, [config]);
  const currencyOf = useCallback((row: T) => config.currency?.(row) || "USD", [config]);
  const mainCurrency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(currencyOf(r), (counts.get(currencyOf(r)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  }, [rows, currencyOf]);
  const mixedCurrency = useMemo(() => new Set(filtered.map(currencyOf)).size > 1, [filtered, currencyOf]);
  const money = (cents: number) => formatMoney(cents, mainCurrency);

  // Status tabs
  const statusStats = useMemo(() => {
    const stats = new Map<string, { count: number; amount: number }>();
    for (const r of base) {
      const s = config.status?.get(r) ?? "";
      const cur = stats.get(s) ?? { count: 0, amount: 0 };
      cur.count++;
      cur.amount += amountOf(r);
      stats.set(s, cur);
    }
    return stats;
  }, [base, config.status, amountOf]);
  const baseAmount = useMemo(() => base.reduce((s, r) => s + amountOf(r), 0), [base, amountOf]);
  const filteredAmount = useMemo(() => filtered.reduce((s, r) => s + amountOf(r), 0), [filtered, amountOf]);

  // Insights
  const months = useMemo(() => {
    if (!config.date || !config.amount || config.chart === false) return [];
    let keys: string[] = [];
    const from = parseDay(range.from);
    const to = parseDay(range.to);
    if (from && to) {
      for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to && keys.length < 24; d.setMonth(d.getMonth() + 1)) {
        keys.push(toDayKey(d).slice(0, 7));
      }
    }
    if (keys.length < 2) {
      const now = new Date();
      keys = Array.from({ length: 12 }, (_, i) => toDayKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)).slice(0, 7));
    }
    const buckets = new Map(keys.map((k) => [k, { key: k, count: 0, total: 0, parts: new Map<string, number>() }]));
    for (const r of filtered) {
      const b = buckets.get(monthKey(config.date.get(r)) ?? "");
      if (!b) continue;
      const amt = amountOf(r);
      b.count++;
      b.total += amt;
      const s = config.status?.get(r) ?? "";
      b.parts.set(s, (b.parts.get(s) ?? 0) + amt);
    }
    return [...buckets.values()];
  }, [filtered, range.from, range.to, config, amountOf]);

  const topParties = useMemo(() => {
    if (!config.party) return [];
    const map = new Map<string, { name: string; count: number; amount: number }>();
    for (const r of filtered) {
      const name = config.party.get(r);
      if (!name) continue;
      const cur = map.get(name) ?? { name, count: 0, amount: 0 };
      cur.count++;
      cur.amount += amountOf(r);
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
  }, [filtered, config.party, amountOf]);

  const allParties = useMemo(() => {
    if (!config.party) return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      const name = config.party.get(r);
      if (name) map.set(name, (map.get(name) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows, config.party]);

  const facetValues = useMemo(() => {
    const out: Record<string, [string, number][]> = {};
    for (const facet of config.facets ?? []) {
      const map = new Map<string, number>();
      for (const r of rows) {
        const v = facet.value(r);
        if (v) map.set(v, (map.get(v) ?? 0) + 1);
      }
      out[facet.key] = [...map.entries()].sort((a, b) => b[1] - a[1]);
    }
    return out;
  }, [rows, config.facets]);

  // Grouping
  const groups = useMemo(() => {
    if (prefs.groupBy === "none") return null;
    const keyOf = (r: T): string => {
      if (prefs.groupBy === "status") return config.status?.get(r) ?? "";
      if (prefs.groupBy === "party") return config.party?.get(r) || "No " + (config.party?.label.toLowerCase() ?? "name");
      if (prefs.groupBy === "month") return monthKey(config.date?.get(r)) ?? "No date";
      const facet = config.facets?.find((f) => f.key === prefs.groupBy);
      return facet?.value(r) || "None";
    };
    const map = new Map<string, T[]>();
    for (const r of sorted) {
      const k = keyOf(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    const list = [...map.entries()].map(([key, items]) => ({ key, items, amount: items.reduce((s, r) => s + amountOf(r), 0) }));
    if (prefs.groupBy === "month") list.sort((a, b) => b.key.localeCompare(a.key));
    else if (prefs.groupBy === "status") list.sort((a, b) => statusOptions.findIndex((o) => o.value === a.key) - statusOptions.findIndex((o) => o.value === b.key));
    else list.sort((a, b) => b.amount - a.amount);
    return list;
  }, [prefs.groupBy, sorted, config, amountOf, statusOptions]);

  const groupLabel = (key: string) => {
    if (prefs.groupBy === "status") return statusOptions.find((o) => o.value === key)?.label ?? key;
    if (prefs.groupBy === "month" && /^\d{4}-\d{2}$/.test(key)) return monthLabel(key, true);
    return key;
  };

  // Paging
  const pageCount = Math.max(1, Math.ceil(sorted.length / prefs.pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = groups ? sorted : sorted.slice((safePage - 1) * prefs.pageSize, safePage * prefs.pageSize);

  // Selection
  const selectedRows = useMemo(() => filtered.filter((r) => selected.has(config.getId(r))), [filtered, selected, config]);
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const helpers: ExplorerHelpers = useMemo(() => ({ refresh, clearSelection }), [refresh, clearSelection]);

  // Peek
  const peekIndex = peekId ? sorted.findIndex((r) => config.getId(r) === peekId) : -1;
  const peekRow = peekIndex >= 0 ? sorted[peekIndex] : null;
  const movePeek = useCallback(
    (delta: number) => {
      if (peekIndex < 0) return;
      const next = sorted[Math.min(sorted.length - 1, Math.max(0, peekIndex + delta))];
      if (next) setPeekId(config.getId(next));
    },
    [peekIndex, sorted, config]
  );

  // Keyboard: "/" searches, arrows move through the open record
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (peekId && !typing && (e.key === "ArrowDown" || e.key === "j")) {
        e.preventDefault();
        movePeek(1);
      }
      if (peekId && !typing && (e.key === "ArrowUp" || e.key === "k")) {
        e.preventDefault();
        movePeek(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [peekId, movePeek]);

  const toggleSort = (col: ExplorerColumn<T>) => {
    if (!col.value || col.sortable === false) return;
    const cur = prefs.sort;
    if (cur?.key === col.key) setPref("sort", cur.dir === "desc" ? { key: col.key, dir: "asc" } : null);
    else setPref("sort", { key: col.key, dir: col.money || col.align === "right" ? "desc" : "asc" });
  };

  const { ask } = useAssistant();
  /** Hand the selection to Tilly as a short, readable list with ids for lookups. */
  const askTilly = (list: T[]) => {
    const titleCol = config.columns.find((c) => c.value);
    const lines = list.slice(0, 30).map((r) => {
      const parts = [
        titleCol ? String(titleCol.value!(r) ?? "") : "",
        config.party?.get(r),
        config.status?.get(r),
        config.amount ? money(amountOf(r)) : null,
        config.date?.get(r)?.slice(0, 10),
        `id ${config.getId(r)}`,
      ].filter(Boolean);
      return `- ${parts.join(" · ")}`;
    });
    const more = list.length > 30 ? `\n…and ${list.length - 30} more.` : "";
    const noun = list.length === 1 ? config.noun.one : config.noun.many;
    ask(`I've selected ${list.length} ${noun}:\n${lines.join("\n")}${more}\n\nWhat stands out, and what should I do with them?`, { newTab: true });
  };

  const exportCsv = (list: T[]) => {
    const header = visibleColumns.map((c) => csvCell(c.label)).join(",");
    const lines = list.map((r) =>
      visibleColumns
        .map((c) => {
          const v = c.csv ? c.csv(r) : c.value?.(r);
          return csvCell(c.money && typeof v === "number" ? (v / 100).toFixed(2) : v);
        })
        .join(",")
    );
    download(`${config.noun.many.toLowerCase().replace(/\s+/g, "-")}-${toDayKey(new Date())}.csv`, [header, ...lines].join("\n"));
  };

  const hasFilters = Boolean(search || preset !== "all" || parties.size || Object.values(facetFilters).some((s) => s.size));
  const clearFilters = () => {
    setSearch("");
    setPreset("all");
    setCustom({});
    setParties(new Set());
    setFacetFilters({});
    setStatus("all");
    resetPage();
  };

  const metrics = useMemo(() => config.metrics?.(base) ?? [], [config, base]);

  /* ---------------------------- render ---------------------------- */

  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (loading) return <ExplorerSkeleton />;
  if (rows.length === 0 && config.empty) return <>{config.empty}</>;

  const rowH = prefs.density === "compact" ? "h-10" : "h-[52px]";
  const colCount = visibleColumns.length + 2;
  const dateLabel = preset === "custom" ? (custom.from || custom.to ? `${formatDay(custom.from)} – ${formatDay(custom.to)}` : "Custom range") : PRESETS.find((p) => p.value === preset)?.label;

  const renderRow = (row: T) => {
    const id = config.getId(row);
    const isSelected = selected.has(id);
    const href = config.href?.(row);
    return (
      <tr
        key={id}
        onClick={(e) => {
          if ((e.metaKey || e.ctrlKey) && href) window.open(href, "_blank");
          else setPeekId(id);
        }}
        onDoubleClick={() => href && router.push(href)}
        className={cn(
          "group/row cursor-pointer border-b border-border/50 transition-colors last:border-0",
          rowH,
          peekId === id ? "bg-foreground/[0.055]" : isSelected ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.025]"
        )}
      >
        <td className="w-10 pl-3.5 pr-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={() => toggleRow(id)} aria-label="Select row" className="opacity-70 group-hover/row:opacity-100 data-[state=checked]:opacity-100" />
        </td>
        {visibleColumns.map((col) => (
          <td
            key={col.key}
            className={cn("max-w-[280px] truncate px-3 text-[13px]", col.align === "right" && "text-right", col.className)}
          >
            {col.render ? col.render(row) : col.money ? (
              <span className="tabular-nums">{formatMoney(Number(col.value?.(row) ?? 0), currencyOf(row))}</span>
            ) : (
              String(col.value?.(row) ?? "—")
            )}
          </td>
        ))}
        <td className="w-10 pr-2">
          {href && (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              aria-label="Open"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-foreground/[0.06] hover:text-foreground group-hover/row:opacity-100"
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="@container space-y-4">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">{config.noun.many}</h2>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            <span className="font-medium text-foreground">{filtered.length.toLocaleString()}</span>{" "}
            {filtered.length === 1 ? config.noun.one.toLowerCase() : config.noun.many.toLowerCase()}
            {config.amount && (
              <>
                {" "}worth <span className="font-medium text-foreground">{money(filteredAmount)}</span>
              </>
            )}
            {preset !== "all" && <> · {dateLabel?.toLowerCase()}</>}
            {truncated && <> · showing the latest {rows.length.toLocaleString()} of {total.toLocaleString()}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config.actions}
          <ToolbarButton onClick={() => exportCsv(sorted)}>
            <Download className="size-3.5" />
            Export
          </ToolbarButton>
          {config.create && (
            <button
              type="button"
              onClick={config.create.onClick}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" />
              {config.create.label}
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/60 @xl:grid-cols-3 @5xl:grid-cols-6">
          {metrics.map((m) => {
            const active = m.status && status === m.status;
            const pick = () => { setStatus(active ? "all" : m.status!); resetPage(); };
            // A div, not a button: the tile holds the InfoTip button and buttons can't nest
            return (
              <div
                key={m.key}
                role={m.status ? "button" : undefined}
                tabIndex={m.status ? 0 : undefined}
                aria-pressed={m.status ? Boolean(active) : undefined}
                onClick={m.status ? pick : undefined}
                onKeyDown={m.status ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } } : undefined}
                className={cn("min-w-0 bg-card px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset", m.status && "cursor-pointer transition-colors hover:bg-accent/60", active && "bg-accent")}
              >
                <span className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                  <span className="truncate">{m.label}</span>
                  {m.hint && <InfoTip>{m.hint}</InfoTip>}
                </span>
                <span className="mt-1.5 block truncate text-[19px] font-semibold tabular-nums tracking-[-0.02em]">{m.value}</span>
                {m.note && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{m.note}</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Insights */}
      {prefs.insights && months.length > 0 && (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_340px]">
          <MonthChart
            months={months}
            statusOptions={statusOptions}
            money={money}
            dateLabel={config.date!.label}
            amountLabel={config.amountLabel ?? "Value"}
            activeRange={range}
            onPick={(key) => {
              const [y, m] = key.split("-").map(Number);
              const from = toDayKey(new Date(y, m - 1, 1));
              const to = toDayKey(new Date(y, m, 0));
              if (preset === "custom" && custom.from === from && custom.to === to) setPreset("all");
              else {
                setPreset("custom");
                setCustom({ from, to });
              }
              resetPage();
            }}
            onHide={() => setPref("insights", false)}
          />
          {config.party && (
            <div className="hidden @4xl:block">
            <TopList
              title={`Top ${config.party.many.toLowerCase()}`}
              items={topParties.slice(0, 7)}
              total={filteredAmount}
              money={money}
              active={parties}
              onPick={(name) => {
                setParties((prev) => {
                  const next = new Set(prev);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  return next;
                });
                resetPage();
              }}
              moreCount={Math.max(0, topParties.length - 7)}
            />
            </div>
          )}
        </div>
      )}

      {/* The table */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card">
        {/* Status tabs */}
        {config.status && (
          <div className="border-b border-border/60">
            {baseAmount > 0 && (
              <div className="flex h-1 w-full">
                {statusOptions.map((o) => {
                  const amt = statusStats.get(o.value)?.amount ?? 0;
                  if (amt <= 0) return null;
                  return <span key={o.value} style={{ width: `${(amt / baseAmount) * 100}%`, backgroundColor: o.color, opacity: status === "all" || status === o.value ? 1 : 0.25 }} />;
                })}
              </div>
            )}
            <div className="flex gap-1 overflow-x-auto px-2 py-2">
              <StatusTab label="All" count={base.length} active={status === "all"} onClick={() => { setStatus("all"); resetPage(); }} />
              {statusOptions.map((o) => {
                const s = statusStats.get(o.value);
                if (!s?.count && status !== o.value) return null;
                return (
                  <StatusTab
                    key={o.value}
                    label={o.label}
                    hint={o.hint}
                    color={o.color}
                    count={s?.count ?? 0}
                    amount={config.amount && s?.amount ? shortMoney(s.amount) : undefined}
                    active={status === o.value}
                    onClick={() => { setStatus(status === o.value ? "all" : o.value); resetPage(); }}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1 @3xl:max-w-[320px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              onKeyDown={(e) => e.key === "Escape" && (setSearch(""), e.currentTarget.blur())}
              placeholder={`Search ${config.noun.many.toLowerCase()}…`}
              className="h-8 w-full rounded-lg bg-foreground/[0.04] pl-8 pr-8 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-border"
            />
            {search ? (
              <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground/60">/</kbd>
            )}
          </div>

          {config.date && (
            <Popover>
              <PopoverTrigger asChild>
                <ToolbarButton active={preset !== "all"}>
                  <CalendarDays className="size-3.5" />
                  {preset === "all" ? config.date.label : dateLabel}
                  <ChevronDown className="size-3 opacity-60" />
                </ToolbarButton>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[280px] p-1.5">
                <p className="px-2 pb-1 pt-1.5 text-[11.5px] font-medium text-muted-foreground">Filter by {config.date.label.toLowerCase()}</p>
                <div className="grid grid-cols-2 gap-0.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => { setPreset(p.value); resetPage(); }}
                      className={cn("rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", preset === p.value ? "bg-foreground/[0.06] font-medium" : "hover:bg-foreground/[0.035]")}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 border-t border-border/60 px-1 pt-2">
                  <p className="px-1 pb-1.5 text-[11.5px] font-medium text-muted-foreground">Custom range</p>
                  <div className="flex items-center gap-1.5">
                    <DatePicker value={custom.from} onChange={(v) => { setCustom((c) => ({ ...c, from: v })); setPreset("custom"); resetPage(); }} placeholder="From" className="h-8 flex-1 text-xs" />
                    <DatePicker value={custom.to} onChange={(v) => { setCustom((c) => ({ ...c, to: v })); setPreset("custom"); resetPage(); }} placeholder="To" className="h-8 flex-1 text-xs" />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {config.party && (
            <MultiPicker
              label={config.party.label}
              values={allParties}
              selected={parties}
              onChange={(next) => { setParties(next); resetPage(); }}
            />
          )}

          {(config.facets ?? []).map((facet) => (
            <MultiPicker
              key={facet.key}
              label={facet.label}
              values={facetValues[facet.key] ?? []}
              selected={facetFilters[facet.key] ?? new Set()}
              onChange={(next) => { setFacetFilters((f) => ({ ...f, [facet.key]: next })); resetPage(); }}
            />
          ))}

          {hasFilters && (
            <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center gap-1 px-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground">
              <X className="size-3" />
              Clear
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolbarButton active={prefs.groupBy !== "none"}>
                  <Layers className="size-3.5" />
                  <span className="hidden @2xl:inline">{prefs.groupBy === "none" ? "Group" : `By ${groupOptions(config).find((g) => g.value === prefs.groupBy)?.label.toLowerCase()}`}</span>
                </ToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Group rows by</DropdownMenuLabel>
                {groupOptions(config).map((g) => (
                  <DropdownMenuItem key={g.value} onClick={() => { setPref("groupBy", g.value); setCollapsed(new Set()); }} className="text-[13px]">
                    {g.label}
                    {prefs.groupBy === g.value && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolbarButton>
                  <SlidersHorizontal className="size-3.5" />
                  <span className="hidden @2xl:inline">View</span>
                </ToolbarButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Columns3 className="size-3" /> Columns
                </DropdownMenuLabel>
                {config.columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={prefs.columns[c.key] ?? !c.hidden}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(v) => setPref("columns", { ...prefs.columns, [c.key]: Boolean(v) })}
                    className="text-[13px]"
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">Row height</DropdownMenuLabel>
                <div className="flex gap-1 px-1.5 pb-1.5">
                  {([
                    ["compact", "Compact", Rows4],
                    ["comfortable", "Roomy", Rows3],
                  ] as const).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPref("density", value)}
                      className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] transition-colors", prefs.density === value ? "bg-foreground/[0.06] font-medium" : "text-muted-foreground hover:bg-foreground/[0.035]")}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </div>
                {months.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem checked={prefs.insights} onCheckedChange={(v) => setPref("insights", Boolean(v))} className="text-[13px]">
                      Show charts
                    </DropdownMenuCheckboxItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Grid */}
        <div className="max-h-[max(520px,calc(100svh-230px))] overflow-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="h-9">
                <th className="w-10 border-b border-border/60 pl-3.5 pr-1 text-left">
                  <Checkbox
                    checked={allSelected ? true : selectedRows.length > 0 ? "indeterminate" : false}
                    onCheckedChange={() => (allSelected ? clearSelection() : setSelected(new Set(filtered.map(config.getId))))}
                    aria-label="Select all"
                  />
                </th>
                {visibleColumns.map((col) => {
                  const sortable = Boolean(col.value) && col.sortable !== false;
                  const active = prefs.sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      className={cn("whitespace-nowrap border-b border-border/60 px-3 text-[12px] font-medium text-muted-foreground", col.align === "right" ? "text-right" : "text-left", col.className)}
                    >
                      <span className={cn("inline-flex items-center gap-1", col.align === "right" && "flex-row-reverse")}>
                        {sortable ? (
                          <button type="button" onClick={() => toggleSort(col)} className={cn("inline-flex items-center gap-1 transition-colors hover:text-foreground", active && "text-foreground", col.align === "right" && "flex-row-reverse")}>
                            {col.label}
                            {active ? prefs.sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                          </button>
                        ) : (
                          col.label
                        )}
                        {col.hint && <InfoTip>{col.hint}</InfoTip>}
                      </span>
                    </th>
                  );
                })}
                <th className="w-10 border-b border-border/60" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-20 text-center">
                    <p className="text-[14px] font-medium">No {config.noun.many.toLowerCase()} match</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">Try a different search or remove a filter.</p>
                    {(hasFilters || status !== "all") && (
                      <button type="button" onClick={clearFilters} className="mt-4 inline-flex h-8 items-center rounded-lg border border-border px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
                        Clear all filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : groups ? (
                groups.map((g) => {
                  const isCollapsed = collapsed.has(g.key);
                  const color = prefs.groupBy === "status" ? statusOptions.find((o) => o.value === g.key)?.color : undefined;
                  return (
                    <Fragment key={g.key}>
                      <tr
                        className="h-9 cursor-pointer bg-foreground/[0.025] hover:bg-foreground/[0.04]"
                        onClick={() =>
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.key)) next.delete(g.key);
                            else next.add(g.key);
                            return next;
                          })
                        }
                      >
                        <td colSpan={colCount} className="border-b border-border/60 px-3.5">
                          <span className="flex items-center gap-2 text-[13px]">
                            <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", !isCollapsed && "rotate-90")} />
                            {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
                            <span className="font-semibold">{groupLabel(g.key)}</span>
                            <span className="rounded-md bg-foreground/[0.06] px-1.5 text-[11.5px] tabular-nums text-muted-foreground">{g.items.length}</span>
                            {config.amount && <span className="ml-auto font-medium tabular-nums">{money(g.amount)}</span>}
                          </span>
                        </td>
                      </tr>
                      {!isCollapsed && g.items.map(renderRow)}
                    </Fragment>
                  );
                })
              ) : (
                pageRows.map(renderRow)
              )}
            </tbody>
            {sorted.length > 0 && moneyColumns.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 bg-card">
                <tr className="h-10">
                  <td className="border-t border-border/80" />
                  {visibleColumns.map((col, i) => (
                    <td key={col.key} className={cn("whitespace-nowrap border-t border-border/80 px-3 text-[13px]", col.align === "right" && "text-right", col.className)}>
                      {col.money && !col.noTotal ? (
                        <span className="font-semibold tabular-nums">
                          {money(sorted.reduce((s, r) => s + Number(col.value?.(r) ?? 0), 0))}
                        </span>
                      ) : i === 0 ? (
                        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                          Total of {sorted.length.toLocaleString()}
                          {mixedCurrency && <InfoTip>These rows use more than one currency, so the totals add the amounts as they are without converting them.</InfoTip>}
                        </span>
                      ) : null}
                    </td>
                  ))}
                  <td className="border-t border-border/80" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {!groups && sorted.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            <span className="tabular-nums">
              {((safePage - 1) * prefs.pageSize + 1).toLocaleString()}–{Math.min(safePage * prefs.pageSize, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}
              <span className="ml-3 hidden text-muted-foreground/70 @2xl:inline">Click a row to preview · double-click to open · ↑↓ to move</span>
            </span>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground">
                    {prefs.pageSize} per page <ChevronDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[25, 50, 100, 250, 500].map((n) => (
                    <DropdownMenuItem key={n} onClick={() => { setPref("pageSize", n); resetPage(); }} className="text-[13px]">
                      {n} per page
                      {prefs.pageSize === n && <Check className="ml-auto size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex items-center gap-1">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page" className="flex size-7 items-center justify-center rounded-md border border-border/80 transition-colors hover:bg-foreground/[0.03] disabled:opacity-40">
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="px-1.5 tabular-nums">
                  {safePage} / {pageCount}
                </span>
                <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page" className="flex size-7 items-center justify-center rounded-md border border-border/80 transition-colors hover:bg-foreground/[0.03] disabled:opacity-40">
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk bar */}
      {selectedRows.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-xl border border-border bg-popover py-1.5 pl-3.5 pr-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
            <span className="shrink-0 text-[13px]">
              <span className="font-semibold tabular-nums">{selectedRows.length}</span> selected
              {config.amount && <span className="ml-1.5 text-muted-foreground">· {money(selectedRows.reduce((s, r) => s + amountOf(r), 0))}</span>}
            </span>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" />
            {config.bulkActions?.(selectedRows, helpers)}
            <button
              type="button"
              onClick={() => askTilly(selectedRows)}
              className="tilly-hover inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-tilly-50 px-2.5 text-[13px] font-medium text-tilly-700 transition-colors hover:bg-tilly-100 dark:bg-tilly-700/15 dark:text-tilly-400"
            >
              <TillyMark size={15} />
              Ask Tilly
            </button>
            <ToolbarButton onClick={() => exportCsv(selectedRows)}>
              <Download className="size-3.5" />
              Export
            </ToolbarButton>
            <button type="button" onClick={clearSelection} aria-label="Clear selection" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      <Sheet open={Boolean(peekRow)} onOpenChange={(open) => !open && setPeekId(null)}>
        <SheetContent side="right" showCloseButton={false} overlayClassName="bg-black/[0.06] backdrop-blur-none" className="w-full gap-0 p-0 shadow-[-16px_0_48px_-24px_rgba(0,0,0,0.25)] sm:max-w-[540px]">
          <SheetTitle className="sr-only">{config.noun.one} preview</SheetTitle>
          {peekRow && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/70 px-2">
                <button type="button" onClick={() => movePeek(-1)} disabled={peekIndex <= 0} aria-label="Previous" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" onClick={() => movePeek(1)} disabled={peekIndex >= sorted.length - 1} aria-label="Next" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
                <span className="ml-1 text-[12.5px] tabular-nums text-muted-foreground">
                  {peekIndex + 1} of {sorted.length}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {config.href && (
                    <Link href={config.href(peekRow)} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium hover:bg-foreground/[0.04]">
                      Open <ArrowUpRight className="size-3.5" />
                    </Link>
                  )}
                  <button type="button" onClick={() => setPeekId(null)} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {config.preview ? config.preview(peekRow, helpers) : <DefaultPreview row={peekRow} columns={config.columns} currency={currencyOf(peekRow)} />}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function groupOptions<T>(config: ExplorerConfig<T>) {
  return [
    { value: "none", label: "No grouping" },
    ...(config.status ? [{ value: "status", label: "Status" }] : []),
    ...(config.party ? [{ value: "party", label: config.party.label }] : []),
    ...(config.date ? [{ value: "month", label: "Month" }] : []),
    ...(config.facets ?? []).map((f) => ({ value: f.key, label: f.label })),
  ];
}

/* ------------------------------------------------------------------ */
/*  Pieces of the explorer                                             */
/* ------------------------------------------------------------------ */

function StatusTab({ label, count, amount, color, active, hint, onClick }: { label: string; count: number; amount?: string; color?: string; active: boolean; hint?: string; onClick: () => void }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
        active ? "bg-foreground/[0.06] font-medium text-foreground" : "text-foreground/70 hover:bg-foreground/[0.03] hover:text-foreground",
        count === 0 && !active && "opacity-55"
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
      {amount && <span className="hidden tabular-nums text-muted-foreground/70 @3xl:inline">{amount}</span>}
    </button>
  );
  if (!hint) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-60 text-[12.5px]">{hint}</TooltipContent>
    </Tooltip>
  );
}

function MultiPicker({ label, values, selected, onChange }: { label: string; values: [string, number][]; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const [query, setQuery] = useState("");
  const shown = values.filter(([v]) => v.toLowerCase().includes(query.toLowerCase()));
  if (values.length < 2 && selected.size === 0) return null;
  const first = [...selected][0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarButton active={selected.size > 0}>
          {selected.size === 0 ? label : selected.size === 1 ? <span className="max-w-[140px] truncate">{first}</span> : `${label} · ${selected.size}`}
          <ChevronDown className="size-3 opacity-60" />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0">
        <div className="border-b border-border/60 p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find ${label.toLowerCase()}…`}
            className="h-8 w-full rounded-md bg-foreground/[0.04] px-2.5 text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {shown.map(([v, n]) => {
            const on = selected.has(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(v);
                  else next.add(v);
                  onChange(next);
                }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors", on ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.035]")}
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-foreground bg-foreground text-background" : "border-border")}>
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{v}</span>
                <span className="tabular-nums text-[12px] text-muted-foreground">{n}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">Nothing found</p>}
        </div>
        {selected.size > 0 && (
          <div className="border-t border-border/60 p-1">
            <button type="button" onClick={() => onChange(new Set())} className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground">
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface MonthBucket {
  key: string;
  count: number;
  total: number;
  parts: Map<string, number>;
}

function MonthChart({
  months,
  statusOptions,
  money,
  dateLabel,
  amountLabel,
  activeRange,
  onPick,
  onHide,
}: {
  months: MonthBucket[];
  statusOptions: { value: string; label: string; color: string }[];
  money: (cents: number) => string;
  dateLabel: string;
  amountLabel: string;
  activeRange: { from?: string; to?: string };
  onPick: (key: string) => void;
  onHide: () => void;
}) {
  const max = Math.max(...months.map((m) => m.total), 1);
  const sum = months.reduce((s, m) => s + m.total, 0);
  const count = months.reduce((s, m) => s + m.count, 0);
  const busiest = months.reduce((a, b) => (b.total > a.total ? b : a), months[0]);
  const singleMonth = activeRange.from && activeRange.to && activeRange.from.slice(0, 7) === activeRange.to.slice(0, 7) ? activeRange.from.slice(0, 7) : null;

  return (
    <div className="flex flex-col rounded-xl border border-border/80 bg-card p-4">
      <div className="flex items-start gap-2">
        <div>
          <p className="text-[14px] font-semibold">By month</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {amountLabel} by {dateLabel.toLowerCase()} · {count.toLocaleString()} in view · {money(sum)}
            {busiest?.total > 0 && <> · busiest {monthLabel(busiest.key, true)}</>}
          </p>
        </div>
        <button type="button" onClick={onHide} className="ml-auto text-[12px] text-muted-foreground hover:text-foreground">
          Hide
        </button>
      </div>
      <div className="mt-4 flex min-h-[96px] flex-1 items-end gap-1.5 @4xl:min-h-[132px]">
        {months.map((m) => {
          const h = (m.total / max) * 100;
          const dim = singleMonth && singleMonth !== m.key;
          return (
            <Tooltip key={m.key}>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => onPick(m.key)} className={cn("group flex h-full min-w-0 flex-1 flex-col justify-end", dim && "opacity-35")}>
                  <span className="flex w-full flex-col-reverse overflow-hidden rounded-[4px] transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(h, m.total > 0 ? 3 : 0)}%` }}>
                    {statusOptions.length > 0
                      ? statusOptions.map((o) => {
                          const v = m.parts.get(o.value) ?? 0;
                          return v > 0 ? <span key={o.value} style={{ height: `${(v / m.total) * 100}%`, backgroundColor: o.color }} /> : null;
                        })
                      : <span className="h-full bg-sky-500" />}
                  </span>
                  {m.total === 0 && <span className="h-[3px] w-full rounded-full bg-foreground/[0.06]" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="min-w-44 text-[12.5px]">
                <p className="font-semibold">{monthLabel(m.key, true)}</p>
                <p className="mb-1 text-muted-foreground">
                  {m.count} · {money(m.total)}
                </p>
                {statusOptions.map((o) => {
                  const v = m.parts.get(o.value) ?? 0;
                  return v > 0 ? (
                    <p key={o.value} className="flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: o.color }} />
                      {o.label}
                      <span className="ml-auto pl-3 tabular-nums">{money(v)}</span>
                    </p>
                  ) : null;
                })}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 border-t border-border/60 pt-1.5">
        {months.map((m, i) => (
          <span key={m.key} className={cn("min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground", months.length > 14 && i % 2 === 1 && "invisible")}>
            {monthLabel(m.key)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TopList({
  title,
  items,
  total,
  money,
  active,
  onPick,
  moreCount,
}: {
  title: string;
  items: { name: string; count: number; amount: number }[];
  total: number;
  money: (cents: number) => string;
  active: Set<string>;
  onPick: (name: string) => void;
  moreCount: number;
}) {
  return (
    <div className="h-full rounded-xl border border-border/80 bg-card p-4">
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">Click one to filter the list</p>
      <div className="mt-3 space-y-0.5">
        {items.map((it, i) => {
          const pct = total > 0 ? (it.amount / total) * 100 : 0;
          const on = active.has(it.name);
          return (
            <button
              key={it.name}
              type="button"
              onClick={() => onPick(it.name)}
              className={cn("relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-[5px] text-left text-[13px] transition-colors", on ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]")}
            >
              <span className="absolute inset-y-1 left-0 rounded-r-sm opacity-[0.13]" style={{ width: `${pct}%`, backgroundColor: ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#14B8A6"][i % 7] }} />
              <span className="relative w-4 shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="relative min-w-0 flex-1 truncate font-medium">{it.name}</span>
              <span className="relative text-[11.5px] tabular-nums text-muted-foreground">{it.count}×</span>
              <span className="relative w-24 text-right tabular-nums">{money(it.amount)}</span>
            </button>
          );
        })}
        {items.length === 0 && <p className="py-6 text-center text-[12.5px] text-muted-foreground">Nothing in view</p>}
        {moreCount > 0 && <p className="px-2 pt-1 text-[12px] text-muted-foreground">and {moreCount} more</p>}
      </div>
    </div>
  );
}

function DefaultPreview<T>({ row, columns, currency }: { row: T; columns: ExplorerColumn<T>[]; currency: string }) {
  return (
    <dl className="divide-y divide-border/60 px-5 py-2">
      {columns.map((c) => (
        <div key={c.key} className="flex items-center gap-4 py-2.5 text-[13px]">
          <dt className="w-36 shrink-0 text-muted-foreground">{c.label}</dt>
          <dd className="min-w-0 flex-1">
            {c.render ? c.render(row) : c.money ? formatMoney(Number(c.value?.(row) ?? 0), currency) : String(c.value?.(row) ?? "—")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="h-[86px] w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[220px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border/80">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex h-10 items-center gap-6 border-t border-border/50 px-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="ml-auto h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

