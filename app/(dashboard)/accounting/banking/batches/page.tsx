"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Layers,
  ChevronRight,
  Loader2,
  FileStack,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface BatchItem {
  id: string;
  billId: string | null;
  contactId: string | null;
  amount: number;
  status: string;
}

interface Batch {
  id: string;
  name: string;
  status: "draft" | "submitted" | "completed";
  totalAmount: number;
  currencyCode: string;
  paymentCount: number;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  items: BatchItem[];
}

interface BillOption {
  id: string;
  billNumber: string;
  total: number;
  amountDue: number;
  currencyCode: string;
  contactId: string;
  contact: { id: string; name: string } | null;
}

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  draft: "secondary",
  submitted: "default",
  completed: "outline",
};

export default function PaymentBatchesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog form
  const [batchName, setBatchName] = useState("");
  const [bills, setBills] = useState<BillOption[]>([]);
  const [selectedBills, setSelectedBills] = useState<
    { billId: string; contactId: string; amount: string; currencyCode: string }[]
  >([]);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchBatches = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/payment-batches", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setBatches(data.data || []))
      .finally(() => setLoading(false));
  }, [orgId]);

  const fetchBills = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/bills?status=received&limit=100", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setBills(data.data || []));
  }, [orgId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  function openCreateDialog() {
    setBatchName("");
    setSelectedBills([]);
    fetchBills();
    setShowDialog(true);
  }

  function toggleBill(bill: BillOption) {
    setSelectedBills((prev) => {
      const existing = prev.find((b) => b.billId === bill.id);
      if (existing) {
        return prev.filter((b) => b.billId !== bill.id);
      }
      return [
        ...prev,
        {
          billId: bill.id,
          contactId: bill.contactId,
          amount: (bill.amountDue / 100).toFixed(2),
          currencyCode: bill.currencyCode,
        },
      ];
    });
  }

  function updateBillAmount(billId: string, amount: string) {
    setSelectedBills((prev) =>
      prev.map((b) => (b.billId === billId ? { ...b, amount } : b))
    );
  }

  async function handleCreateBatch() {
    if (!orgId || !batchName || selectedBills.length === 0) return;
    setSaving(true);

    try {
      const res = await fetch("/api/v1/payment-batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: batchName,
          items: selectedBills.map((b) => ({
            billId: b.billId,
            contactId: b.contactId,
            amount: parseMoney(b.amount),
            currencyCode: b.currencyCode,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to create batch");
        return;
      }

      toast.success("Payment batch created");
      setShowDialog(false);
      fetchBatches();
    } catch {
      toast.error("Failed to create batch");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Payment Batches</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Group multiple bill payments into batches
          </p>
        </div>
        <Button
          size="sm"
          onClick={openCreateDialog}
          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs"
        >
          <Plus className="mr-1.5 size-3.5" />
          Create Batch
        </Button>
      </div>

      {/* Empty state */}
      {batches.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Layers className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No payment batches</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a batch to process multiple payments at once
            </p>
          </div>
          <Button
            size="sm"
            onClick={openCreateDialog}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            Create Batch
          </Button>
        </div>
      )}

      {/* Batch list */}
      {batches.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
          {batches.map((batch) => (
            <button
              key={batch.id}
              type="button"
              onClick={() =>
                router.push(`/accounting/banking/batches/${batch.id}`)
              }
              className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <FileStack className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{batch.name}</p>
                  <Badge
                    variant={STATUS_VARIANTS[batch.status] || "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {batch.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                  <span>
                    {batch.paymentCount} payment
                    {batch.paymentCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-border">{"\u00B7"}</span>
                  <span>
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="font-mono text-sm font-semibold tabular-nums">
                  {formatMoney(batch.totalAmount, batch.currencyCode)}
                </p>
                <ChevronRight className="size-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Create Batch Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Payment Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Batch Name</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g., March Supplier Payments"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                Select Bills ({selectedBills.length} selected)
              </Label>
              <div className="max-h-[240px] overflow-y-auto rounded-lg border divide-y divide-border">
                {bills.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3 text-center">
                    No unpaid bills found
                  </p>
                )}
                {bills.map((b) => {
                  const isSelected = selectedBills.some(
                    (s) => s.billId === b.id
                  );
                  const selectedItem = selectedBills.find(
                    (s) => s.billId === b.id
                  );
                  return (
                    <div key={b.id} className="px-3 py-2.5">
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleBill(b)}
                      >
                        <div
                          className={cn(
                            "size-4 rounded border flex items-center justify-center transition-colors",
                            isSelected
                              ? "bg-emerald-600 border-emerald-600"
                              : "border-border"
                          )}
                        >
                          {isSelected && (
                            <svg
                              className="size-3 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">
                            {b.billNumber} - {b.contact?.name || "Unknown"}
                          </p>
                        </div>
                        <p className="text-xs font-mono tabular-nums text-muted-foreground">
                          {formatMoney(b.amountDue, b.currencyCode)}
                        </p>
                      </div>
                      {isSelected && selectedItem && (
                        <div className="mt-2 ml-6">
                          <Input
                            type="text"
                            value={selectedItem.amount}
                            onChange={(e) =>
                              updateBillAmount(b.id, e.target.value)
                            }
                            className="h-7 text-xs"
                            placeholder="Amount"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedBills.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-sm font-mono font-semibold tabular-nums">
                  {formatMoney(
                    selectedBills.reduce(
                      (sum, b) => sum + parseMoney(b.amount),
                      0
                    )
                  )}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateBatch}
              disabled={
                saving || !batchName || selectedBills.length === 0
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
