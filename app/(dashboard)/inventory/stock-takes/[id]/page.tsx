"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Play,
  CheckCircle,
  Trash2,
  XCircle,
  Loader2,
} from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface StockTakeLine {
  id: string;
  itemName: string;
  itemCode: string;
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
  lines: StockTakeLine[];
}

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

export default function StockTakeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [stockTake, setStockTake] = useState<StockTakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
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
    }
  }

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
                {new Date(stockTake.createdAt).toLocaleDateString()}
                {stockTake.completedAt && (
                  <>
                    {" "}
                    · Completed{" "}
                    {new Date(stockTake.completedAt).toLocaleDateString()}
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
          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_100px_80px_60px] sm:grid-cols-[1fr_100px_120px_100px_80px] gap-2 px-4 py-2.5 border-b bg-muted/50">
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
              {stockTake.lines.map((line) => {
                const disc =
                  line.countedQuantity !== null
                    ? line.countedQuantity - line.expectedQuantity
                    : null;

                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-[1fr_80px_100px_80px_60px] sm:grid-cols-[1fr_100px_120px_100px_80px] gap-2 px-4 py-3 items-center"
                  >
                    {/* Item info */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {line.itemName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {line.itemCode}
                      </p>
                    </div>

                    {/* Expected */}
                    <p className="text-sm font-mono tabular-nums text-right">
                      {line.expectedQuantity}
                    </p>

                    {/* Counted */}
                    <div className="flex justify-end">
                      {isEditable ? (
                        <Input
                          type="number"
                          min={0}
                          defaultValue={
                            line.countedQuantity !== null
                              ? line.countedQuantity
                              : ""
                          }
                          className="h-7 w-20 text-right text-sm font-mono tabular-nums"
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val === "") return;
                            const num = parseInt(val);
                            if (isNaN(num)) return;
                            if (num !== line.countedQuantity) {
                              handleUpdateLine(line.id, num);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                        />
                      ) : (
                        <p className="text-sm font-mono tabular-nums">
                          {line.countedQuantity !== null
                            ? line.countedQuantity
                            : "-"}
                        </p>
                      )}
                    </div>

                    {/* Discrepancy */}
                    <p
                      className={cn(
                        "text-sm font-mono tabular-nums text-right font-medium",
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
                      {line.adjusted && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          Adj
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ContentReveal>

      {confirmDialog}
    </div>
  );
}
