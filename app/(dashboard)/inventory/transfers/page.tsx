"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeftRight,
  Plus,
  Loader2,
  ArrowRight,

  Check,
  X,
  Warehouse,
  Package,

} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
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

const STATUS_STYLES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300",
  in_transit: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<Transfer | null>(null);
  const [completing, setCompleting] = useState(false);
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchTransfers = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/inventory/transfers", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setTransfers(data.data || []))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    if (!orgId) return;
    fetch("/api/v1/inventory?limit=100", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => setItems(data.data || []));
  }, [orgId]);

  useEffect(() => {
    function handler() { fetchTransfers(); }
    window.addEventListener("refetch-transfers", handler);
    return () => window.removeEventListener("refetch-transfers", handler);
  }, [fetchTransfers]);

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{transfers.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Draft</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">{transfers.filter((t) => t.status === "draft").length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In Transit</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">{transfers.filter((t) => t.status === "in_transit").length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{transfers.filter((t) => t.status === "completed").length}</p>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card divide-y">
        {transfers.map((transfer) => (
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
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", STATUS_STYLES[transfer.status])}>
                  {transfer.status.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {transfer.lines.length} item{transfer.lines.length !== 1 ? "s" : ""} · {new Date(transfer.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={(v) => { if (!v) { setDetailOpen(false); setActiveTransfer(null); } }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Transfer Details</SheetTitle>
          </SheetHeader>
          {activeTransfer && (
            <div className="space-y-4 px-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{activeTransfer.fromWarehouse.name}</span>
                <ArrowRight className="size-3 text-muted-foreground" />
                <span className="font-medium">{activeTransfer.toWarehouse.name}</span>
              </div>
              <Badge variant="outline" className={cn(STATUS_STYLES[activeTransfer.status])}>
                {activeTransfer.status.replace("_", " ")}
              </Badge>
              {activeTransfer.notes && (
                <p className="text-sm text-muted-foreground">{activeTransfer.notes}</p>
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Items</p>
                <div className="rounded-lg border divide-y">
                  {activeTransfer.lines.map((line) => {
                    const item = items.find((i) => i.id === line.inventoryItemId);
                    return (
                      <div key={line.id} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm">{item?.name || "Unknown item"}</span>
                        <span className="text-sm font-mono">{line.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {(activeTransfer.status === "draft" || activeTransfer.status === "in_transit") && (
                <div className="flex gap-2">
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
