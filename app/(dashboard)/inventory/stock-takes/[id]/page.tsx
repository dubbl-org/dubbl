"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Play,
  CheckCircle,
  Trash2,
  XCircle,
  Loader2,
  EyeOff,
  Search,
  Minus,
  Plus,
  Check,
  ChevronsUp,
  X,
  ArrowUpDown,
} from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

type SortKey = "name" | "code" | "expected" | "counted" | "discrepancy";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "code", label: "Code" },
  { value: "expected", label: "Expected Qty" },
  { value: "counted", label: "Counted Qty" },
  { value: "discrepancy", label: "Discrepancy" },
];

interface StockTakeLine {
  id: string;
  inventoryItem: { id: string; name: string; code: string };
  expectedQuantity: number;
  countedQuantity: number | null;
  discrepancy: number | null;
  adjusted: boolean;
}

interface StockTakeDetail {
  id: string;
  name: string;
  notes: string | null;
  status: "draft" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  warehouse?: { id: string; name: string; code: string } | null;
  lines: StockTakeLine[];
}

type LineFilter = "all" | "uncounted" | "matched" | "discrepancies";

const STATUS_CONFIG: Record<
  StockTakeDetail["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  },
  in_progress: {
    label: "In Progress",
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  cancelled: {
    label: "Cancelled",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  },
};

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Isolated counter cell - manages its own editing state for smooth transitions */
function CounterCell({
  line,
  isSaving,
  onUpdate,
}: {
  line: StockTakeLine;
  isSaving: boolean;
  onUpdate: (lineId: string, qty: number) => void;
}) {
  const isUncounted = line.countedQuantity === null;
  // Local editing state - only active while user is typing
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const displayValue = editing
    ? editValue
    : line.countedQuantity !== null
      ? String(line.countedQuantity)
      : "";

  function handleFocus() {
    setEditing(true);
    setEditValue(line.countedQuantity !== null ? String(line.countedQuantity) : "");
  }

  function handleBlur() {
    setEditing(false);
    if (editValue === "") return;
    const num = parseInt(editValue);
    if (isNaN(num) || num < 0) return;
    if (num !== line.countedQuantity) {
      onUpdate(line.id, num);
    }
  }

  return (
    <div className="flex items-center justify-end">
      {/* Left button: Match (✓) when uncounted, Minus (-) when counting */}
      <button
        className={cn(
          "flex size-7 items-center justify-center rounded-l-md border border-r-0 transition-colors disabled:opacity-40 disabled:pointer-events-none",
          isUncounted
            ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        )}
        disabled={isSaving}
        title={isUncounted ? "Match expected quantity" : "Decrease"}
        onClick={() => {
          if (isUncounted) {
            onUpdate(line.id, line.expectedQuantity);
          } else {
            const next = Math.max(0, (line.countedQuantity ?? 0) - 1);
            onUpdate(line.id, next);
          }
        }}
      >
        {isUncounted ? <Check className="size-3" /> : <Minus className="size-3" />}
      </button>

      {/* Value display */}
      <div className="flex h-7 items-center justify-center border-y w-10 bg-background">
        {isSaving ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={displayValue}
            placeholder="-"
            className="w-full h-full text-center text-sm font-mono tabular-nums bg-transparent outline-none"
            onFocus={handleFocus}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, "");
              setEditValue(raw);
            }}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        )}
      </div>

      {/* Plus button */}
      <button
        className="flex size-7 items-center justify-center rounded-r-md border border-l-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        disabled={isSaving}
        onClick={() => {
          const next = isUncounted ? 0 : (line.countedQuantity ?? 0) + 1;
          onUpdate(line.id, next);
        }}
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

export default function StockTakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [stockTake, setStockTake] = useState<StockTakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [blindMode, setBlindMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [savingLines, setSavingLines] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useEffect(() => {
    if (!orgId) return;

    fetch(`/api/v1/stock-takes/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.stockTake) setStockTake(data.stockTake);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleStartCount() {
    if (!orgId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/stock-takes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ status: "in_progress" }),
      });
      if (!res.ok) throw new Error("Failed to start count");
      const data = await res.json();
      setStockTake(data.stockTake);
      toast.success("Stock take started");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start count"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApplyAdjustments() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Apply adjustments?",
      description:
        "This will update inventory quantities based on the counted values. This action cannot be undone.",
      confirmLabel: "Apply",
      destructive: false,
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/stock-takes/${id}/apply`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error("Failed to apply adjustments");
      const data = await res.json();
      setStockTake(data.stockTake);
      toast.success("Adjustments applied");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to apply adjustments"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Cancel this stock take?",
      description: "This will mark the stock take as cancelled.",
      confirmLabel: "Cancel Stock Take",
      destructive: true,
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/stock-takes/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel");
      const data = await res.json();
      setStockTake(data.stockTake);
      toast.success("Stock take cancelled");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to cancel stock take"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Delete this stock take?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/stock-takes/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Stock take deleted");
      router.push("/inventory/stock-takes");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete stock take"
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateLine(lineId: string, countedQuantity: number) {
    if (!orgId) return;

    setSavingLines((prev) => new Set(prev).add(lineId));

    // Optimistic update
    setStockTake((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((line) =>
          line.id === lineId
            ? {
                ...line,
                countedQuantity,
                discrepancy: countedQuantity - line.expectedQuantity,
              }
            : line
        ),
      };
    });

    try {
      const res = await fetch(
        `/api/v1/stock-takes/${id}/lines/${lineId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({ countedQuantity }),
        }
      );
      if (!res.ok) throw new Error("Failed to update line");
      const data = await res.json();

      setStockTake((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((line) =>
            line.id === lineId
              ? {
                  ...line,
                  countedQuantity: data.line.countedQuantity,
                  discrepancy: data.line.discrepancy,
                }
              : line
          ),
        };
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update count"
      );
      // Revert on error - refetch
      fetch(`/api/v1/stock-takes/${id}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.stockTake) setStockTake(data.stockTake);
        });
    } finally {
      setSavingLines((prev) => {
        const next = new Set(prev);
        next.delete(lineId);
        return next;
      });
    }
  }

  // Progress calculations (must be before early returns for hooks)
  const lines = useMemo(() => stockTake?.lines ?? [], [stockTake?.lines]);
  const totalLines = lines.length;
  const countedLines = lines.filter((l) => l.countedQuantity !== null).length;
  const progressPct =
    totalLines > 0 ? Math.round((countedLines / totalLines) * 100) : 0;
  const matchCount = lines.filter(
    (l) => l.countedQuantity !== null && l.discrepancy === 0
  ).length;
  const discrepancyCount = lines.filter(
    (l) =>
      l.countedQuantity !== null &&
      l.discrepancy !== null &&
      l.discrepancy !== 0
  ).length;
  const uncountedCount = totalLines - countedLines;
  const accuracyPct =
    totalLines > 0 ? Math.round((matchCount / totalLines) * 100) : 100;

  // Filtered, searched, sorted lines
  const filteredLines = useMemo(() => {
    let result = lines;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.inventoryItem.name.toLowerCase().includes(q) ||
          l.inventoryItem.code.toLowerCase().includes(q)
      );
    }

    switch (lineFilter) {
      case "uncounted":
        result = result.filter((l) => l.countedQuantity === null);
        break;
      case "matched":
        result = result.filter(
          (l) => l.countedQuantity !== null && (l.discrepancy ?? l.countedQuantity - l.expectedQuantity) === 0
        );
        break;
      case "discrepancies":
        result = result.filter(
          (l) =>
            l.countedQuantity !== null &&
            (l.discrepancy ?? l.countedQuantity - l.expectedQuantity) !== 0
        );
        break;
    }

    // Sort
    const dir = sortOrder === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return dir * a.inventoryItem.name.localeCompare(b.inventoryItem.name);
        case "code":
          return dir * a.inventoryItem.code.localeCompare(b.inventoryItem.code);
        case "expected":
          return dir * (a.expectedQuantity - b.expectedQuantity);
        case "counted":
          return dir * ((a.countedQuantity ?? -1) - (b.countedQuantity ?? -1));
        case "discrepancy": {
          const dA = a.countedQuantity !== null ? a.countedQuantity - a.expectedQuantity : 0;
          const dB = b.countedQuantity !== null ? b.countedQuantity - b.expectedQuantity : 0;
          return dir * (Math.abs(dB) - Math.abs(dA));
        }
        default:
          return 0;
      }
    });

    return result;
  }, [lines, searchQuery, lineFilter, sortBy, sortOrder]);

  if (loading) return <BrandLoader />;

  if (!stockTake) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Stock take not found</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/inventory/stock-takes")}
        >
          Back to Stock Takes
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[stockTake.status];
  const isEditable = stockTake.status === "in_progress";

  async function handleConfirmAllRemaining() {
    if (!orgId || !stockTake) return;
    const uncounted = stockTake.lines.filter((l) => l.countedQuantity === null);
    if (uncounted.length === 0) return;

    const confirmed = await confirm({
      title: `Confirm ${uncounted.length} remaining items?`,
      description:
        "This will set the counted quantity to the expected quantity for all uncounted items.",
      confirmLabel: "Confirm All",
    });
    if (!confirmed) return;

    setConfirmingAll(true);
    try {
      await Promise.all(
        uncounted.map((line) =>
          handleUpdateLine(line.id, line.expectedQuantity)
        )
      );
      toast.success(`${uncounted.length} items confirmed`);
    } finally {
      setConfirmingAll(false);
    }
  }

  function getRowVarianceClass(line: StockTakeLine) {
    if (line.countedQuantity === null) return "";
    const disc = line.discrepancy ?? line.countedQuantity - line.expectedQuantity;
    if (disc === 0) return "bg-emerald-50/50 dark:bg-emerald-950/10";
    if (Math.abs(disc) <= 5) return "bg-amber-50/50 dark:bg-amber-950/10";
    return "bg-red-50/50 dark:bg-red-950/10";
  }

  return (
    <div>
      {/* Back link */}
      <button
        onClick={() => router.push("/inventory/stock-takes")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-3.5" />
        Back to stock takes
      </button>

      <ContentReveal className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
              <ClipboardList className="size-5 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{stockTake.name}</h1>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0", statusCfg.className)}
                >
                  {statusCfg.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Created{" "}
                {new Date(stockTake.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {stockTake.warehouse && (
                  <>
                    {" · "}
                    {stockTake.warehouse.name} ({stockTake.warehouse.code})
                  </>
                )}
                {stockTake.completedAt && (
                  <>
                    {" · Completed "}
                    {new Date(stockTake.completedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {stockTake.status === "draft" && (
              <>
                <Button
                  size="sm"
                  onClick={handleStartCount}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {actionLoading ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 size-3.5" />
                  )}
                  Start Count
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="mr-1.5 size-3.5" />
                  Delete
                </Button>
              </>
            )}
            {stockTake.status === "in_progress" && (
              <>
                <Button
                  size="sm"
                  variant={blindMode ? "default" : "outline"}
                  onClick={() => setBlindMode(!blindMode)}
                >
                  <EyeOff className="mr-1.5 size-3.5" />
                  Blind Count
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyAdjustments}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {actionLoading ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-1.5 size-3.5" />
                  )}
                  Apply Adjustments
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="border-red-300 text-red-600 hover:bg-red-100 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <XCircle className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {stockTake.status !== "draft" && (
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">Counting progress</span>
              <span className="font-mono font-medium">{countedLines}/{totalLines} items</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-blue-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground pt-1">
              <span>Matches: <span className="font-medium text-emerald-600">{matchCount}</span></span>
              <span>Discrepancies: <span className="font-medium text-red-600">{discrepancyCount}</span></span>
              <span>Uncounted: <span className="font-medium">{uncountedCount}</span></span>
            </div>
          </div>
        )}

        {/* Variance summary (completed only) */}
        {stockTake.status === "completed" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xl font-bold font-mono">{totalLines}</p>
              <p className="text-[11px] text-muted-foreground">Total Items</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xl font-bold font-mono text-emerald-600">{matchCount}</p>
              <p className="text-[11px] text-muted-foreground">Accurate</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xl font-bold font-mono text-red-600">{discrepancyCount}</p>
              <p className="text-[11px] text-muted-foreground">Discrepancies</p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <p className="text-xl font-bold font-mono">{accuracyPct}%</p>
              <p className="text-[11px] text-muted-foreground">Accuracy</p>
            </div>
          </div>
        )}

        {/* Notes */}
        {stockTake.notes && (
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Notes
            </p>
            <p className="text-sm text-foreground">{stockTake.notes}</p>
          </div>
        )}

        {/* Lines */}
        {stockTake.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <ClipboardList className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No items in this stock take
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Toolbar: Tabs + Search */}
            <div className="flex flex-col gap-3">
              {/* Filter tabs + bulk action */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={lineFilter} onValueChange={(v) => setLineFilter(v as LineFilter)}>
                  <TabsList>
                    <TabsTrigger value="all">
                      All
                      <span className="ml-1 text-[10px] font-mono opacity-60">{totalLines}</span>
                    </TabsTrigger>
                    <TabsTrigger value="uncounted">
                      Uncounted
                      <span className="ml-1 text-[10px] font-mono opacity-60">{uncountedCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value="matched">
                      Matched
                      <span className="ml-1 text-[10px] font-mono opacity-60">{matchCount}</span>
                    </TabsTrigger>
                    <TabsTrigger value="discrepancies">
                      Discrepancies
                      <span className="ml-1 text-[10px] font-mono opacity-60">{discrepancyCount}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <AnimatePresence>
                  {isEditable && uncountedCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, filter: "blur(4px)" }}
                      animate={{ opacity: 1, filter: "blur(0px)" }}
                      exit={{ opacity: 0, filter: "blur(4px)" }}
                      transition={{ duration: 0.2 }}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleConfirmAllRemaining}
                        disabled={confirmingAll}
                        className="h-8 text-xs gap-1.5"
                      >
                        {confirmingAll ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <ChevronsUp className="size-3" />
                        )}
                        Confirm All Remaining ({uncountedCount})
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Search + Sort */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8 h-8 text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                  <SelectTrigger className="h-8 w-full sm:w-[150px] text-xs">
                    <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                >
                  <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_70px_96px_70px_50px] sm:grid-cols-[1fr_90px_110px_90px_70px] gap-2 px-4 py-2.5 border-b bg-muted/50">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Item
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Expected
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Counted
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Diff
                </p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-right">
                  Status
                </p>
              </div>

              {/* Table rows */}
              <div className="divide-y">
                <AnimatePresence mode="popLayout" initial={false}>
                  {filteredLines.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No items match your search or filter
                    </motion.div>
                  ) : (
                    filteredLines.map((line) => {
                      const disc =
                        line.countedQuantity !== null
                          ? line.countedQuantity - line.expectedQuantity
                          : null;
                      return (
                        <motion.div
                          key={line.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={cn(
                            "grid grid-cols-[1fr_70px_96px_70px_50px] sm:grid-cols-[1fr_90px_110px_90px_70px] gap-2 px-4 py-3 items-center transition-colors duration-300",
                            getRowVarianceClass(line)
                          )}
                        >
                          {/* Item info */}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {line.inventoryItem.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {line.inventoryItem.code}
                            </p>
                          </div>

                          {/* Expected */}
                          <p className="text-sm font-mono tabular-nums text-right">
                            {blindMode && isEditable ? "***" : line.expectedQuantity}
                          </p>

                          {/* Counted */}
                          {isEditable ? (
                            <CounterCell
                              line={line}
                              isSaving={savingLines.has(line.id)}
                              onUpdate={handleUpdateLine}
                            />
                          ) : (
                            <p className="text-sm font-mono tabular-nums text-right">
                              {line.countedQuantity !== null
                                ? line.countedQuantity
                                : "-"}
                            </p>
                          )}

                          {/* Discrepancy */}
                          <p
                            className={cn(
                              "text-sm font-mono tabular-nums text-right font-medium transition-colors duration-300",
                              disc === null
                                ? "text-muted-foreground"
                                : disc === 0
                                  ? "text-muted-foreground"
                                  : disc > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                            )}
                          >
                            {disc === null
                              ? "-"
                              : disc === 0
                                ? "0"
                                : disc > 0
                                  ? `+${disc}`
                                  : disc}
                          </p>

                          {/* Adjusted badge */}
                          <div className="flex justify-end">
                            <AnimatePresence>
                              {line.adjusted && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.8 }}
                                  transition={{ duration: 0.15 }}
                                >
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  >
                                    Adj
                                  </Badge>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Showing X of Y */}
            <AnimatePresence>
              {(searchQuery || lineFilter !== "all") && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-muted-foreground text-center"
                >
                  Showing {filteredLines.length} of {totalLines} items
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        )}
      </ContentReveal>

      {confirmDialog}
    </div>
  );
}
