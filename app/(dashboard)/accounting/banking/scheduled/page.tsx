"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface ScheduledPaymentItem {
  id: string;
  billId: string | null;
  contactId: string | null;
  amount: number;
  currencyCode: string;
  scheduledDate: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  processedAt: string | null;
  notes: string | null;
  createdAt: string;
  bill: {
    id: string;
    billNumber: string;
    total: number;
    amountDue: number;
    contact: { id: string; name: string } | null;
  } | null;
  contact: { id: string; name: string } | null;
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

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: React.ElementType }
> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "default", icon: Loader2 },
  completed: { label: "Completed", variant: "outline", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertCircle },
  cancelled: { label: "Cancelled", variant: "outline", icon: XCircle },
};

function getWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor(
    (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff <= 7) return "This Week";
  if (diff <= 14) return "Next Week";
  if (diff <= 30) return "This Month";
  return "Later";
}

export default function ScheduledPaymentsPage() {
  const [items, setItems] = useState<ScheduledPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dialog form state
  const [bills, setBills] = useState<BillOption[]>([]);
  const [selectedBillId, setSelectedBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchItems = useCallback(() => {
    if (!orgId) return;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/scheduled-payments?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setItems(data.data || []))
      .finally(() => setLoading(false));
  }, [orgId, statusFilter]);

  const fetchBills = useCallback(() => {
    if (!orgId) return;
    fetch("/api/v1/bills?status=received&limit=100", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setBills(data.data || []));
  }, [orgId]);

  // Process due payments on load
  useEffect(() => {
    if (!orgId) return;
    fetch("/api/v1/scheduled-payments/process", {
      method: "POST",
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.processed > 0) {
          toast.success(`Processed ${data.processed} scheduled payment(s)`);
        }
      })
      .catch(() => {})
      .finally(() => fetchItems());
  }, [orgId, fetchItems]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Group by week
  const grouped = useMemo(() => {
    const groups: Record<string, ScheduledPaymentItem[]> = {};
    const order = ["Overdue", "Today", "This Week", "Next Week", "This Month", "Later"];

    for (const item of items) {
      const label = getWeekLabel(item.scheduledDate);
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    }

    return order
      .filter((label) => groups[label])
      .map((label) => ({ label, items: groups[label] }));
  }, [items]);

  async function handleSchedule() {
    if (!orgId || !selectedBillId || !scheduledDate || !amount) return;
    setSaving(true);

    const selectedBill = bills.find((b) => b.id === selectedBillId);
    if (!selectedBill) return;

    try {
      const res = await fetch("/api/v1/scheduled-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          billId: selectedBillId,
          contactId: selectedBill.contactId,
          amount: parseMoney(amount),
          scheduledDate,
          notes: notes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to schedule payment");
        return;
      }

      toast.success("Payment scheduled");
      setShowDialog(false);
      resetForm();
      fetchItems();
    } catch {
      toast.error("Failed to schedule payment");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/scheduled-payments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!res.ok) {
        toast.error("Failed to cancel payment");
        return;
      }

      toast.success("Scheduled payment cancelled");
      fetchItems();
    } catch {
      toast.error("Failed to cancel payment");
    }
  }

  async function handleProcessNow() {
    if (!orgId) return;
    setProcessing(true);
    try {
      const res = await fetch("/api/v1/scheduled-payments/process", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.processed > 0) {
        toast.success(`Processed ${data.processed} payment(s)`);
      } else {
        toast.info("No payments due for processing");
      }
      fetchItems();
    } catch {
      toast.error("Failed to process payments");
    } finally {
      setProcessing(false);
    }
  }

  function resetForm() {
    setSelectedBillId("");
    setAmount("");
    setScheduledDate("");
    setNotes("");
  }

  function openScheduleDialog() {
    resetForm();
    fetchBills();
    setShowDialog(true);
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Scheduled Payments</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Schedule future payments for your bills
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleProcessNow}
            disabled={processing}
            className="h-8 text-xs"
          >
            {processing ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-3.5" />
            )}
            Process Due
          </Button>
          <Button
            size="sm"
            onClick={openScheduleDialog}
            className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs"
          >
            <Plus className="mr-1.5 size-3.5" />
            Schedule Payment
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <Calendar className="size-6 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No scheduled payments</p>
            <p className="text-xs text-muted-foreground mt-1">
              Schedule payments to automate your bill payments
            </p>
          </div>
          <Button
            size="sm"
            onClick={openScheduleDialog}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            Schedule Payment
          </Button>
        </div>
      )}

      {/* Grouped list */}
      {grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                "text-xs font-medium uppercase tracking-wider",
                group.label === "Overdue"
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              )}
            >
              {group.label}
            </p>
            <span className="text-xs text-muted-foreground/50 tabular-nums">
              ({group.items.length})
            </span>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
            {group.items.map((item) => {
              const config = STATUS_CONFIG[item.status];
              const StatusIcon = config.icon;
              const contactName =
                item.bill?.contact?.name ||
                item.contact?.name ||
                "Unknown";

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      item.status === "pending"
                        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                        : item.status === "completed"
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : item.status === "failed"
                            ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                            : "bg-muted text-muted-foreground"
                    )}
                  >
                    <StatusIcon className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {contactName}
                      </p>
                      <Badge variant={config.variant} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      {item.bill && (
                        <span className="font-mono">
                          {item.bill.billNumber}
                        </span>
                      )}
                      {item.bill && (
                        <span className="text-border">{"\u00B7"}</span>
                      )}
                      <span>
                        {new Date(
                          item.scheduledDate + "T00:00:00"
                        ).toLocaleDateString()}
                      </span>
                      {item.notes && (
                        <>
                          <span className="text-border">{"\u00B7"}</span>
                          <span className="truncate">{item.notes}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {formatMoney(item.amount, item.currencyCode)}
                    </p>
                    {item.status === "pending" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => handleCancel(item.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Schedule Payment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs">Bill</Label>
              <Select
                value={selectedBillId}
                onValueChange={(val) => {
                  setSelectedBillId(val);
                  const b = bills.find((x) => x.id === val);
                  if (b) setAmount((b.amountDue / 100).toFixed(2));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a bill" />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.billNumber} - {b.contact?.name || "Unknown"} (
                      {formatMoney(b.amountDue, b.currencyCode)} due)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Amount</Label>
              <Input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Scheduled Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add a note..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={saving || !selectedBillId || !scheduledDate || !amount}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
