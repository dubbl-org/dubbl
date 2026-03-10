"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  FileStack,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BatchItemDetail {
  id: string;
  billId: string | null;
  contactId: string | null;
  amount: number;
  currencyCode: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  bill: {
    id: string;
    billNumber: string;
    total: number;
    amountDue: number;
    contact: { id: string; name: string } | null;
  } | null;
  contact: { id: string; name: string } | null;
}

interface BatchDetail {
  id: string;
  name: string;
  status: "draft" | "submitted" | "completed";
  totalAmount: number;
  currencyCode: string;
  paymentCount: number;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items: BatchItemDetail[];
}

const ITEM_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  processing: { label: "Processing", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchBatch = useCallback(() => {
    if (!orgId || !id) return;
    fetch(`/api/v1/payment-batches/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setBatch(data.batch || null))
      .finally(() => setLoading(false));
  }, [orgId, id]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  async function handleSubmit() {
    if (!orgId || !batch) return;

    const confirmed = await confirm({
      title: "Submit Payment Batch",
      description: `This will process ${batch.paymentCount} payment(s) totaling ${formatMoney(batch.totalAmount, batch.currencyCode)}. This action cannot be undone.`,
      confirmLabel: "Submit Batch",
      destructive: false,
    });

    if (!confirmed) return;
    setSubmitting(true);

    try {
      const res = await fetch(
        `/api/v1/payment-batches/${batch.id}/submit`,
        {
          method: "POST",
          headers: { "x-organization-id": orgId },
        }
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to submit batch");
        return;
      }

      toast.success(
        `Batch submitted - ${data.processed}/${data.total} payments processed`
      );
      fetchBatch();
    } catch {
      toast.error("Failed to submit batch");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!orgId || !batch) return;

    try {
      const res = await fetch(`/api/v1/payment-batches/${batch.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ removeItemIds: [itemId] }),
      });

      if (!res.ok) {
        toast.error("Failed to remove item");
        return;
      }

      toast.success("Item removed from batch");
      fetchBatch();
    } catch {
      toast.error("Failed to remove item");
    }
  }

  if (loading) return <BrandLoader />;

  if (!batch) {
    return (
      <ContentReveal className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Batch not found</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/accounting/banking/batches")}
        >
          Back to Batches
        </Button>
      </ContentReveal>
    );
  }

  const completedCount = batch.items.filter(
    (i) => i.status === "completed"
  ).length;
  const failedCount = batch.items.filter(
    (i) => i.status === "failed"
  ).length;

  return (
    <ContentReveal className="space-y-6">
      {confirmDialog}

      {/* Back nav */}
      <button
        type="button"
        onClick={() => router.push("/accounting/banking/batches")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Back to Batches
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <FileStack className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{batch.name}</h2>
              <Badge
                variant={
                  batch.status === "draft"
                    ? "secondary"
                    : batch.status === "submitted"
                      ? "default"
                      : "outline"
                }
                className="text-[10px] capitalize"
              >
                {batch.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Created {new Date(batch.createdAt).toLocaleDateString()}
              {batch.completedAt && (
                <>
                  {" "}
                  {"\u00B7"} Completed{" "}
                  {new Date(batch.completedAt).toLocaleDateString()}
                </>
              )}
            </p>
          </div>
        </div>
        {batch.status === "draft" && (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || batch.items.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 size-4" />
            )}
            Submit Batch
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">Total Amount</p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
            {formatMoney(batch.totalAmount, batch.currencyCode)}
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-[11px] text-muted-foreground">Payments</p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
            {batch.paymentCount}
          </p>
        </div>
        {batch.status !== "draft" && (
          <>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Completed</p>
              <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {completedCount}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Failed</p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-sm font-semibold tabular-nums",
                  failedCount > 0
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
                )}
              >
                {failedCount}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Items */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Items ({batch.items.length})
        </p>
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
          {batch.items.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              No items in this batch
            </p>
          )}
          {batch.items.map((item) => {
            const statusConfig =
              ITEM_STATUS_CONFIG[item.status] || ITEM_STATUS_CONFIG.pending;
            const contactName =
              item.bill?.contact?.name ||
              item.contact?.name ||
              "Unknown";

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {contactName}
                    </p>
                    {batch.status !== "draft" && (
                      <Badge
                        variant={statusConfig.variant}
                        className="text-[10px]"
                      >
                        {statusConfig.label}
                      </Badge>
                    )}
                  </div>
                  {item.bill && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {item.bill.billNumber}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {formatMoney(item.amount, item.currencyCode)}
                  </p>
                  {batch.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ContentReveal>
  );
}
