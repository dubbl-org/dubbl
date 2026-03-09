"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, MotionConfig } from "motion/react";
import {
  ArrowLeftRight,
  Plus,
  Loader2,
  ArrowRight,
  ArrowUpDown,
  Check,
  X,
  Warehouse,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface WarehouseInfo {
  id: string;
  name: string;
  code: string;
}

interface TransferLine {
  id: string;
  inventoryItemId: string;
  quantity: number;
  receivedQuantity: number | null;
}

interface Transfer {
  id: string;
  fromWarehouse: WarehouseInfo;
  toWarehouse: WarehouseInfo;
  status: "draft" | "in_transit" | "completed" | "cancelled";
  notes: string | null;
  lines: TransferLine[];
  createdAt: string;
  completedAt: string | null;
}

interface InventoryItemOption {
  id: string;
  name: string;
  code: string;
  quantityOnHand: number;
}

type StatusFilter = "all" | "draft" | "in_transit" | "completed" | "cancelled";
type SortKey = "createdAt" | "fromWarehouse" | "toWarehouse" | "items" | "status";

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
  in_transit: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_transit: "In Transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  in_transit: 1,
  completed: 2,
  cancelled: 3,
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "createdAt", label: "Newest" },
  { value: "fromWarehouse", label: "From" },
  { value: "toWarehouse", label: "To" },
  { value: "items", label: "Items" },
  { value: "status", label: "Status" },
];

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<Transfer | null>(null);
  const [completing, setCompleting] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Search, filter, sort state
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchTransfers = useCallback(() => {
    if (!orgId) return;
    const isRefetch = !loading;
    if (isRefetch) setRefetching(true);

    fetch("/api/v1/inventory/transfers", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setTransfers(data.data || []))
      .finally(() => {
        setLoading(false);
        setRefetching(false);
        setFetchKey((k) => k + 1);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    if (!orgId) return;
    fetch("/api/v1/inventory?limit=200", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => setItems(data.data || []));
  }, [orgId]);

  useEffect(() => {
    function handler() { fetchTransfers(); }
    window.addEventListener("refetch-transfers", handler);
    return () => window.removeEventListener("refetch-transfers", handler);
  }, [fetchTransfers]);

  // Re-fetch on filter/sort/search changes
  useEffect(() => {
    if (!loading) fetchTransfers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, debouncedSearch]);

  // Client-side filtering + sorting (applied after fetch)
  const filtered = transfers
    .filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const fromMatch = t.fromWarehouse.name.toLowerCase().includes(q) || t.fromWarehouse.code.toLowerCase().includes(q);
        const toMatch = t.toWarehouse.name.toLowerCase().includes(q) || t.toWarehouse.code.toLowerCase().includes(q);
        const noteMatch = t.notes?.toLowerCase().includes(q);
        if (!fromMatch && !toMatch && !noteMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "fromWarehouse":
          return dir * a.fromWarehouse.name.localeCompare(b.fromWarehouse.name);
        case "toWarehouse":
          return dir * a.toWarehouse.name.localeCompare(b.toWarehouse.name);
        case "items":
          return dir * (totalQty(a.lines) - totalQty(b.lines));
        case "status":
          return dir * ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
        case "createdAt":
        default:
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
    });

  // Stats from all transfers (unfiltered)
  const stats = {
    total: transfers.length,
    draft: transfers.filter((t) => t.status === "draft").length,
    inTransit: transfers.filter((t) => t.status === "in_transit").length,
    completed: transfers.filter((t) => t.status === "completed").length,
    totalItems: transfers.reduce((sum, t) => sum + t.lines.reduce((s, l) => s + l.quantity, 0), 0),
  };

  async function handleComplete(transfer: Transfer) {
    const confirmed = await confirm({
      title: "Complete transfer?",
      description: "This will update warehouse stock levels and cannot be undone.",
      confirmLabel: "Complete",
    });
    if (!confirmed || !orgId) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/v1/inventory/transfers/${transfer.id}/complete`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Transfer completed");
      setDetailOpen(false);
      setActiveTransfer(null);
      fetchTransfers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete transfer");
    } finally {
      setCompleting(false);
    }
  }

  async function handleCancel(transfer: Transfer) {
    const confirmed = await confirm({
      title: "Cancel transfer?",
      description: "This will mark the transfer as cancelled.",
      confirmLabel: "Cancel Transfer",
      destructive: true,
    });
    if (!confirmed || !orgId) return;
    try {
      await fetch(`/api/v1/inventory/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ status: "cancelled" }),
      });
      toast.success("Transfer cancelled");
      setDetailOpen(false);
      setActiveTransfer(null);
      fetchTransfers();
    } catch {
      toast.error("Failed to cancel transfer");
    }
  }

  function getItemName(inventoryItemId: string) {
    return items.find((i) => i.id === inventoryItemId)?.name || "Unknown item";
  }

  function getItemCode(inventoryItemId: string) {
    return items.find((i) => i.id === inventoryItemId)?.code || "";
  }

  function totalQty(lines: TransferLine[]) {
    return lines.reduce((sum, l) => sum + l.quantity, 0);
  }

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  if (loading) return <BrandLoader />;

  if (transfers.length === 0) {
    return (
      <ContentReveal>
        <div className="pt-8 pb-12 space-y-8">
          {/* Header */}
          <div className="text-center max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full uppercase tracking-wide">
                Stock Transfers
              </span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight">
              Move inventory between locations
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Create transfers to track stock as it moves from one warehouse to another.
            </p>
          </div>

          {/* Visual: Two warehouses with flow between them */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-0 max-w-2xl mx-auto">
            {/* Source warehouse */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <Warehouse className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Main Warehouse</p>
                  <p className="text-[11px] text-muted-foreground">WH-001</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { name: "Widget A", qty: 120, send: 30 },
                  { name: "Sensor B", qty: 85, send: 15 },
                  { name: "Cable C", qty: 200, send: 50 },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs">{item.name}</span>
                    <span className="text-xs font-mono text-red-500 dark:text-red-400">-{item.send}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow flow */}
            <div className="flex flex-col items-center gap-1 px-3">
              <div className="w-8 h-px bg-border" />
              <div className="flex size-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                <ArrowRight className="size-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="w-8 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground font-medium">95 units</span>
            </div>

            {/* Destination warehouse */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <Warehouse className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">East DC</p>
                  <p className="text-[11px] text-muted-foreground">WH-002</p>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { name: "Widget A", qty: 30 },
                  { name: "Sensor B", qty: 15 },
                  { name: "Cable C", qty: 50 },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                    <span className="text-xs">{item.name}</span>
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">+{item.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex justify-center">
            <Button
              onClick={() => openDrawer("transfer")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Transfer
            </Button>
          </div>

          {/* Status legend - compact horizontal */}
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {[
              { label: "Draft", color: "bg-slate-400" },
              { label: "In Transit", color: "bg-blue-400" },
              { label: "Completed", color: "bg-emerald-400" },
              { label: "Cancelled", color: "bg-red-400" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`size-2 rounded-full ${color}`} />
                <span className="text-[11px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {confirmDialog}
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Total", value: stats.total, color: "" },
          { label: "Draft", value: stats.draft, color: "" },
          { label: "In Transit", value: stats.inTransit, color: "text-blue-600 dark:text-blue-400" },
          { label: "Completed", value: stats.completed, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Total Units", value: stats.totalItems, color: "", hidden: "hidden lg:block" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className={cn("rounded-xl border bg-card p-4", stat.hidden)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.05 + i * 0.05 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
            <p className={cn("mt-2 text-2xl font-bold font-mono tabular-nums", stat.color)}>{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="in_transit">In Transit</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openDrawer("transfer")}
          >
            <Plus className="size-3" />
            New Transfer
          </Button>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by warehouse name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={toggleSortOrder}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* List */}
      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <ContentReveal key={fetchKey}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <ArrowLeftRight className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No transfers found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No transfers match this filter"}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="rounded-xl border bg-card divide-y">
              {filtered.map((transfer) => {
                const qty = totalQty(transfer.lines);
                return (
                  <div
                    key={transfer.id}
                    className="group flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => { setActiveTransfer(transfer); setDetailOpen(true); }}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                      <ArrowLeftRight className="size-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {transfer.fromWarehouse.name}
                        </p>
                        <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium truncate">
                          {transfer.toWarehouse.name}
                        </p>
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", STATUS_STYLES[transfer.status])}>
                          {STATUS_LABELS[transfer.status]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {transfer.lines.length} item{transfer.lines.length !== 1 ? "s" : ""} · {qty} unit{qty !== 1 ? "s" : ""}
                        </p>
                        {transfer.notes && (
                          <p className="text-xs text-muted-foreground truncate hidden sm:block">· {transfer.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-xs text-muted-foreground">
                        {new Date(transfer.createdAt).toLocaleDateString()}
                      </p>
                      {transfer.completedAt && (
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          Completed {new Date(transfer.completedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </MotionConfig>
      )}

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={(v) => { if (!v) { setDetailOpen(false); setActiveTransfer(null); } }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Transfer Details</SheetTitle>
          </SheetHeader>
          {activeTransfer && (
            <div className="space-y-5 px-4">
              {/* Warehouse flow */}
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">From</p>
                  <p className="text-sm font-medium truncate">{activeTransfer.fromWarehouse.name}</p>
                  <p className="text-[11px] text-muted-foreground">{activeTransfer.fromWarehouse.code}</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">To</p>
                  <p className="text-sm font-medium truncate">{activeTransfer.toWarehouse.name}</p>
                  <p className="text-[11px] text-muted-foreground">{activeTransfer.toWarehouse.code}</p>
                </div>
              </div>

              {/* Status + dates */}
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[activeTransfer.status])}>
                  {STATUS_LABELS[activeTransfer.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Created {new Date(activeTransfer.createdAt).toLocaleDateString()}
                </span>
                {activeTransfer.completedAt && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">
                    Completed {new Date(activeTransfer.completedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Notes */}
              {activeTransfer.notes && (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm text-muted-foreground">{activeTransfer.notes}</p>
                </div>
              )}

              {/* Summary */}
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Items</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{activeTransfer.lines.length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total Units</p>
                  <p className="text-lg font-bold font-mono tabular-nums">{totalQty(activeTransfer.lines)}</p>
                </div>
              </div>

              {/* Items list */}
              <div className="space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Line Items</p>
                <div className="rounded-lg border divide-y">
                  {activeTransfer.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{getItemName(line.inventoryItemId)}</p>
                        <p className="text-[11px] text-muted-foreground">{getItemCode(line.inventoryItemId)}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="text-sm font-mono font-medium tabular-nums">{line.quantity}</span>
                        {line.receivedQuantity != null && line.receivedQuantity !== line.quantity && (
                          <p className="text-[10px] text-amber-600">Received: {line.receivedQuantity}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {(activeTransfer.status === "draft" || activeTransfer.status === "in_transit") && (
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleComplete(activeTransfer)}
                    disabled={completing}
                  >
                    {completing ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Check className="size-3.5 mr-1.5" />}
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600"
                    onClick={() => handleCancel(activeTransfer)}
                  >
                    <X className="size-3.5 mr-1.5" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}
