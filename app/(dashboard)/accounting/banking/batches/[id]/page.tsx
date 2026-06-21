"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  FileStack,
  Trash2,
  Mail,
  Send,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

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

interface RemittanceLine {
  billId: string;
  billNumber: string;
  billDate: string;
  billReference: string | null;
  billTotal: number;
  amountPaid: number;
  currencyCode: string;
}

interface RemittanceGroup {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  currencyCode: string;
  totalPaid: number;
  lines: RemittanceLine[];
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
  const [remittanceOpen, setRemittanceOpen] = useState(false);
  const [remittanceLoading, setRemittanceLoading] = useState(false);
  const [remittanceGroups, setRemittanceGroups] = useState<
    RemittanceGroup[] | null
  >(null);
  const [sending, setSending] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useDocumentTitle("Accounting \u00B7 Batch Details");

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

  async function handleOpenRemittance() {
    if (!orgId || !batch) return;
    setRemittanceOpen(true);
    setRemittanceLoading(true);
    setRemittanceGroups(null);
    try {
      const res = await fetch(
        `/api/v1/payment-batches/${batch.id}/remittance`,
        {
          headers: { "x-organization-id": orgId },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load remittance advice");
        setRemittanceOpen(false);
        return;
      }
      setRemittanceGroups(data.remittances || []);
    } catch {
      toast.error("Failed to load remittance advice");
      setRemittanceOpen(false);
    } finally {
      setRemittanceLoading(false);
    }
  }

  async function handleSendRemittance() {
    if (!orgId || !batch) return;
    setSending(true);
    try {
      const res = await fetch(
        `/api/v1/payment-batches/${batch.id}/remittance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to email remittance advice");
        return;
      }
      const sentCount = data.sent?.length ?? 0;
      const skippedCount = data.skipped?.length ?? 0;
      if (sentCount === 0) {
        toast.warning(
          skippedCount > 0
            ? "No remittance emailed - suppliers have no email address"
            : "No suppliers to email"
        );
      } else {
        toast.success(
          `Remittance advice emailed to ${sentCount} supplier(s)` +
            (skippedCount > 0
              ? ` (${skippedCount} skipped - no email)`
              : "")
        );
      }
      setRemittanceOpen(false);
    } catch {
      toast.error("Failed to email remittance advice");
    } finally {
      setSending(false);
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
        <div className="flex items-center gap-2">
          {batch.status !== "draft" && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenRemittance}
            >
              <Mail className="mr-2 size-4" />
              View / email remittance advice
            </Button>
          )}
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

      {/* Remittance advice */}
      <Dialog open={remittanceOpen} onOpenChange={setRemittanceOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remittance advice</DialogTitle>
            <DialogDescription>
              A summary of which bills were paid, grouped by supplier. Email it
              so each supplier knows their payment is on the way.
            </DialogDescription>
          </DialogHeader>

          {remittanceLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : remittanceGroups && remittanceGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No suppliers to send remittance advice to.
            </p>
          ) : (
            <div className="space-y-4">
              {remittanceGroups?.map((group) => (
                <div
                  key={group.contactId}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {group.contactName}
                      </p>
                      {group.contactEmail ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {group.contactEmail}
                        </p>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                          <AlertCircle className="size-3" />
                          No email on file - won&apos;t be sent
                        </p>
                      )}
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums shrink-0">
                      {formatMoney(group.totalPaid, group.currencyCode)}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {group.lines.map((line) => (
                      <div
                        key={line.billId}
                        className="flex items-center justify-between gap-2 px-4 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono truncate">
                            {line.billNumber}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(
                              line.billDate + "T00:00:00"
                            ).toLocaleDateString()}
                            {line.billReference
                              ? ` · ${line.billReference}`
                              : ""}
                          </p>
                        </div>
                        <p className="font-mono text-xs tabular-nums shrink-0">
                          {formatMoney(line.amountPaid, line.currencyCode)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRemittanceOpen(false)}
              disabled={sending}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleSendRemittance}
              disabled={
                sending ||
                remittanceLoading ||
                !remittanceGroups ||
                !remittanceGroups.some((g) => g.contactEmail)
              }
            >
              {sending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Send className="mr-2 size-4" />
              )}
              Email to suppliers
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
