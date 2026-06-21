"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, DollarSign, Ban, Undo2, ThumbsUp, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { formatMoney, minorUnitsToDecimal } from "@/lib/money";
import { DualAmount } from "@/components/ui/dual-amount";
import { RateNote, type RateInfo } from "@/components/ui/rate-note";
import Link from "next/link";

interface BillDetail {
  id: string; billNumber: string; issueDate: string; dueDate: string; status: string;
  subtotal: number; taxTotal: number; total: number; amountPaid: number; amountDue: number;
  currencyCode: string;
  contactId: string;
  notes: string | null; contact: { name: string } | null;
  rejectionReason: string | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number; account: { code: string; name: string } | null }[];
}

interface BaseAmounts {
  baseCurrency: string;
  rate: number | null;
  amounts: {
    total: number | null;
    amountDue: number | null;
    amountPaid: number | null;
    subtotal: number | null;
    taxTotal: number | null;
  };
  status?: RateInfo;
}

const statusConfig: Record<string, { class: string }> = {
  draft: { class: "" },
  pending_approval: { class: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  received: { class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  partial: { class: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  paid: { class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  overdue: { class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" },
  void: { class: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300" },
};

// Plain-language status labels (end users aren't accountants).
// "received" here means the bill has been approved and added to your books.
const statusLabels: Record<string, string> = {
  draft: "draft",
  pending_approval: "waiting for approval",
  received: "in your books",
  partial: "part paid",
  paid: "paid",
  overdue: "overdue",
  void: "cancelled",
};

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [b, setB] = useState<BillDetail | null>(null);
  const [base, setBase] = useState<BaseAmounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payOpen, setPayOpen] = useState(false);
  const [creditingSupplier, setCreditingSupplier] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Purchases · Bill Details");
  useEntityTitle(b?.billNumber);

  const loadBill = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/bills/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.bill) setB(data.bill); if (data.base) setBase(data.base); })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    loadBill();
  }, [loadBill]);

  async function handleReceive() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/bills/${id}/receive`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); toast.success("Bill added to your books"); }
    else toast.error("Couldn't add this bill to your books");
  }

  // Approve a bill that's waiting for approval. This posts it to your books
  // (same end state as "Add to my books") and stamps who approved it.
  async function handleApprove() {
    if (!orgId) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/v1/bills/${id}/approve`, { method: "POST", headers: { "x-organization-id": orgId } });
      if (res.ok) {
        toast.success("Bill approved and added to your books");
        loadBill();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Couldn't approve this bill");
      }
    } finally {
      setApproving(false);
    }
  }

  // Reject a bill that's waiting for approval. Sends it back to draft with the
  // reason recorded, so it can be fixed and re-submitted.
  async function handleReject() {
    if (!orgId) return;
    setRejecting(true);
    try {
      const res = await fetch(`/api/v1/bills/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (res.ok) {
        setRejectOpen(false);
        setRejectReason("");
        toast.success("Bill rejected and sent back to draft");
        loadBill();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Couldn't reject this bill");
      }
    } finally {
      setRejecting(false);
    }
  }

  async function handlePay() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(payAmount) * 100);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await fetch(`/api/v1/bills/${id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ amount, date: payDate }),
    });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); setPayOpen(false); toast.success("Payment recorded"); }
    else toast.error("Failed");
  }

  async function handleVoid() {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Cancel this bill?",
      description: "This stops the bill from counting toward what you owe. You can't undo this.",
      confirmLabel: "Cancel bill",
      destructive: true,
    });
    if (!confirmed) return;
    const res = await fetch(`/api/v1/bills/${id}/void`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); toast.success("Bill cancelled"); }
  }

  // Record a supplier credit (a "debit note") — money the supplier owes you back,
  // e.g. for returned goods or an overcharge. Starts a credit pre-filled from
  // this bill's lines so you don't have to retype them.
  async function handleSupplierCredit() {
    if (!orgId || !b) return;
    const confirmed = await confirm({
      title: "Record a supplier credit?",
      description:
        "Use this when a supplier owes you money back (for example, returned goods or an overcharge). We'll start a credit pre-filled from this bill's items, which you can adjust.",
      confirmLabel: "Start supplier credit",
    });
    if (!confirmed) return;
    setCreditingSupplier(true);
    try {
      const res = await fetch(`/api/v1/debit-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId: b.contactId,
          billId: b.id,
          issueDate: new Date().toISOString().split("T")[0],
          currencyCode: b.currencyCode,
          reference: b.billNumber,
          lines: b.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity / 100,
            unitPrice: l.unitPrice / 100,
          })),
        }),
      });
      if (res.ok) {
        toast.success("Supplier credit recorded");
        router.push("/purchases");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Couldn't record the supplier credit");
      }
    } finally {
      setCreditingSupplier(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!b) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Bill not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases">Back to bills</Link>
        </Button>
      </div>
    );
  }

  const sc = statusConfig[b.status] || statusConfig.draft;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/purchases"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">{b.billNumber}</h1>
                <Badge variant="outline" className={sc.class}>{statusLabels[b.status] || b.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {b.contact?.name || "Unknown supplier"} · Due {b.dueDate}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {b.status === "pending_approval" && (
              <>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  loading={approving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                  title="Approve this bill and add it to your books so it counts toward what you owe"
                >
                  <ThumbsUp className="mr-2 size-3.5" />Approve
                </Button>
                <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) setRejectReason(""); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" title="Send this bill back to draft with a reason">
                      <X className="mr-2 size-3.5" />Reject
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Reject this bill?</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        This sends the bill back to draft so it can be fixed and re-submitted. Add a reason so everyone knows why.
                      </p>
                      <div className="space-y-2">
                        <Label>Reason (optional)</Label>
                        <Input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. amount doesn't match the order"
                        />
                      </div>
                      <Button onClick={handleReject} loading={rejecting} className="w-full bg-red-600 hover:bg-red-700">
                        Reject bill
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {b.status === "draft" && (
              <Button size="sm" onClick={handleReceive} className="bg-emerald-600 hover:bg-emerald-700" title="Approve this bill and add it to your books so it counts toward what you owe">
                <Check className="mr-2 size-3.5" />Add to my books
              </Button>
            )}
            {["received", "partial", "overdue"].includes(b.status) && (
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <DollarSign className="mr-2 size-3.5" />Record Payment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <CurrencyInput prefix="$" value={payAmount} onChange={setPayAmount} placeholder={minorUnitsToDecimal(b.amountDue, b.currencyCode)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                    </div>
                    <Button onClick={handlePay} className="w-full bg-emerald-600 hover:bg-emerald-700">Record Payment</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {["received", "partial", "paid", "overdue"].includes(b.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSupplierCredit}
                loading={creditingSupplier}
                title="Supplier owes you money back (returned goods or an overcharge)? Record a credit from them."
              >
                <Undo2 className="mr-2 size-3.5" />Record a supplier credit
              </Button>
            )}
            {b.status !== "void" && b.status !== "paid" && (
              <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600 hover:text-red-700" title="Stop this bill from counting toward what you owe">
                <Ban className="mr-2 size-3.5" />Cancel bill
              </Button>
            )}
          </div>
        </div>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

        {/* Bill document */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Document header */}
          <div className="border-b bg-muted/30 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">From</p>
                <p className="text-sm font-semibold">{b.contact?.name || "Unknown supplier"}</p>
              </div>
              <div className="sm:text-right">
                <div className="space-y-1.5">
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Bill</span>
                    <span className="text-sm font-mono font-semibold">{b.billNumber}</span>
                  </div>
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Issued</span>
                    <span className="text-sm">{b.issueDate}</span>
                  </div>
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Due</span>
                    <span className="text-sm">{b.dueDate}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-6">Description</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-20">Qty</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28">Price</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28 sm:pr-6">Amount</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((line, i) => (
                  <tr key={line.id} className={i < b.lines.length - 1 ? "border-b border-dashed" : ""}>
                    <td className="px-4 py-3 sm:px-6">
                      <p>{line.description}</p>
                      {line.account && (
                        <p className="text-xs text-muted-foreground mt-0.5">{line.account.code} · {line.account.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{(line.quantity / 100).toFixed(0)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatMoney(line.unitPrice, b.currencyCode)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium sm:pr-6">{formatMoney(line.amount, b.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t bg-muted/10 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono tabular-nums">{formatMoney(b.subtotal, b.currencyCode)}</span>
                </div>
                {b.taxTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono tabular-nums">{formatMoney(b.taxTotal, b.currencyCode)}</span>
                  </div>
                )}
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatMoney(b.total, b.currencyCode)}</span>
                </div>
                {base && base.baseCurrency !== b.currencyCode && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>In {base.baseCurrency}</span>
                      <span className="font-mono tabular-nums">
                        {base.amounts.total == null
                          ? "—"
                          : `≈ ${formatMoney(base.amounts.total, base.baseCurrency)}`}
                      </span>
                    </div>
                    <RateNote
                      currency={b.currencyCode}
                      baseCurrency={base.baseCurrency}
                      status={base.status}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Payment summary + Notes */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Status</p>
              <span className="text-xs font-mono text-muted-foreground">{b.total > 0 ? Math.round((b.amountPaid / b.total) * 100) : 0}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden mb-4">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${b.total > 0 ? Math.round((b.amountPaid / b.total) * 100) : 0}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Total</p>
                <div className="text-sm font-mono font-semibold mt-0.5">
                  <DualAmount
                    amount={b.total}
                    currency={b.currencyCode}
                    baseCurrency={base?.baseCurrency}
                    baseAmount={base?.amounts.total ?? null}
                  />
                </div>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Paid</p>
                <p className="text-sm font-mono font-semibold tabular-nums text-emerald-600 mt-0.5">{formatMoney(b.amountPaid, b.currencyCode)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Due</p>
                <div className="text-sm font-mono font-semibold text-amber-600 mt-0.5">
                  <DualAmount
                    amount={b.amountDue}
                    currency={b.currencyCode}
                    baseCurrency={base?.baseCurrency}
                    baseAmount={base?.amounts.amountDue ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Details</p>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Issued</p>
                <p className="text-sm mt-0.5">{b.issueDate}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Due</p>
                <p className="text-sm mt-0.5">{b.dueDate}</p>
              </div>
              {b.rejectionReason && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Last rejection reason</p>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap text-red-600">{b.rejectionReason}</p>
                </div>
              )}
              {b.notes ? (
                <div>
                  <p className="text-[11px] text-muted-foreground">Notes</p>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{b.notes}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No notes added.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {confirmDialog}
    </ContentReveal>
  );
}
