"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Pencil, DollarSign, Ban, Undo2, ThumbsUp, X, GitCompareArrows, FileBarChart, PackageCheck } from "lucide-react";
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
import { useApi, useApiCache } from "@/lib/query/use-api";
import { ApprovalPanel } from "@/components/dashboard/approval-panel";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { formatMoney, minorUnitsToDecimal } from "@/lib/money";
import { DualAmount } from "@/components/ui/dual-amount";
import { RateNote, type RateInfo } from "@/components/ui/rate-note";
import { ReceiptAttachments } from "@/components/dashboard/receipt-attachments";
import { TagPicker } from "@/components/dashboard/tag-picker";
import { BankAccountSelect } from "@/components/dashboard/bank-account-select";
import { EditBillSheet, type EditableBill } from "./edit-bill-sheet";
import Link from "next/link";

interface BillDetail {
  id: string; billNumber: string; issueDate: string; dueDate: string; status: string;
  subtotal: number; taxTotal: number; total: number; amountPaid: number; amountDue: number;
  currencyCode: string;
  contactId: string;
  notes: string | null; contact: { name: string } | null;
  rejectionReason: string | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number; goodsReceiptLineId: string | null; account: { code: string; name: string } | null; accountId?: string | null; taxRateId?: string | null; discountPercent?: number }[];
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
  paid: { class: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300" },
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
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { open: openDrawer } = useCreateDrawer();
  const url = `/api/v1/bills/${id}`;
  const cache = useApiCache();
  const { data, loading } = useApi<{ bill?: BillDetail; base?: BaseAmounts }>(url);
  const b = data?.bill ?? null;
  const base = data?.base ?? null;
  const setB = (fn: (prev: BillDetail) => BillDetail) =>
    cache.update<{ bill?: BillDetail; base?: BaseAmounts }>(url, (d) => (d.bill ? { ...d, bill: fn(d.bill) } : d));
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payOpen, setPayOpen] = useState(false);
  const [payBankAccountId, setPayBankAccountId] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Purchases · Bill Details");
  useEntityTitle(b?.billNumber);

  async function handleReceive() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/bills/${id}/receive`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setB((prev) => ({ ...prev, ...data.bill })); toast.success("Bill added to your books"); }
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
        const data = await res.json().catch(() => ({}));
        // With an approval workflow, a middle step only passes it on.
        toast.success(
          data.finalized === false
            ? "Approved. It's now with the next approver."
            : "Bill approved and added to your books"
        );
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Couldn't approve this bill");
      }
    } finally {
      setApproving(false);
    }
  }

  // Send a draft bill for approval. When an approval workflow matches it, its
  // approvers act in order; otherwise anyone who can approve bills can.
  async function handleSubmitForApproval() {
    if (!orgId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/bills/${id}/submit-for-approval`, { method: "POST", headers: { "x-organization-id": orgId } });
      if (res.ok) {
        toast.success("Sent for approval");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(typeof data.error === "string" ? data.error : "Couldn't send this bill for approval");
      }
    } finally {
      setSubmitting(false);
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
      body: JSON.stringify({ amount, date: payDate, bankAccountId: payBankAccountId || null }),
    });
    if (res.ok) { const data = await res.json(); setB((prev) => ({ ...prev, ...data.bill })); setPayOpen(false); toast.success("Payment recorded"); }
    else {
      const data = await res.json().catch(() => ({}));
      toast.error(typeof data.error === "string" ? data.error : "Couldn't record this payment");
    }
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
    if (res.ok) { const data = await res.json(); setB((prev) => ({ ...prev, ...data.bill })); toast.success("Bill cancelled"); }
  }

  // Record a supplier credit (a "debit note") — money the supplier owes you back,
  // e.g. for returned goods or an overcharge. Opens the new supplier credit form
  // pre-filled from this bill (supplier, currency, number, and each line with
  // its account and tax rate) so you only change what's being credited.
  function handleSupplierCredit() {
    if (!b) return;
    openDrawer("debitNote", {
      debitNote: {
        billId: b.id,
        contactId: b.contactId,
        currencyCode: b.currencyCode,
        reference: b.billNumber,
        lines: b.lines.map((l) => {
          const qty = l.quantity / 100;
          // Supplier credit lines have no discount, so carry a discounted bill
          // line over at its discounted price per unit.
          const unit = l.discountPercent && qty ? Math.round(l.amount / qty) : l.unitPrice;
          return {
            description: l.description,
            quantity: String(qty),
            unitPrice: minorUnitsToDecimal(unit, b.currencyCode),
            accountId: l.accountId ?? "",
            taxRateId: l.taxRateId ?? "",
          };
        }),
      },
    });
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
              <TagPicker entityType="bill" entityId={b.id} className="mt-1.5" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              title="See every bill, payment and credit for this supplier on one running statement"
            >
              <Link href={`/contacts/${b.contactId}/statement`}>
                <FileBarChart className="mr-2 size-3.5" />Supplier statement
              </Link>
            </Button>
            {b.status === "pending_approval" && (
              <>
                <Button
                  size="sm"
                  onClick={handleApprove}
                  loading={approving}
                  className="bg-brand-600 hover:bg-brand-700"
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
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} title="Change the supplier, dates or lines before you add this bill to your books">
                <Pencil className="mr-2 size-3.5" />Edit
              </Button>
            )}
            {b.status === "draft" && (
              <Button variant="outline" size="sm" onClick={handleSubmitForApproval} loading={submitting} title="Send this bill to be approved before it's added to your books">
                <ThumbsUp className="mr-2 size-3.5" />Submit for approval
              </Button>
            )}
            {b.status === "draft" && (
              <Button size="sm" onClick={handleReceive} className="bg-brand-600 hover:bg-brand-700" title="Approve this bill and add it to your books so it counts toward what you owe">
                <Check className="mr-2 size-3.5" />Add to my books
              </Button>
            )}
            {["received", "partial", "overdue"].includes(b.status) && (
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-brand-600 hover:bg-brand-700">
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
                    <BankAccountSelect value={payBankAccountId} onChange={setPayBankAccountId} />
                    <Button onClick={handlePay} className="w-full bg-brand-600 hover:bg-brand-700">Record Payment</Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {["received", "partial", "paid", "overdue"].includes(b.status) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSupplierCredit}
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

        {/* Approval workflow progress: who has approved and whose turn it is */}
        {(b.status === "draft" || b.status === "pending_approval") && (
          <ApprovalPanel entityType="bill" entityId={id} mode="progress" />
        )}

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
                className="h-full rounded-full bg-brand-500 transition-all"
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
                <p className="text-sm font-mono font-semibold tabular-nums text-brand-600 mt-0.5">{formatMoney(b.amountPaid, b.currencyCode)}</p>
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

        {/* Order match — which bill lines are tied back to a goods receipt
            (what actually arrived). This is the audit trail that the bill
            matches the order/delivery. */}
        {b.lines.some((l) => l.goodsReceiptLineId) ? (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <GitCompareArrows className="size-4 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order match</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              These bill lines are linked to a goods receipt, so what you were billed is checked against what actually arrived. Any price or quantity difference is recorded against the order when this bill is added to your books.
            </p>
            <div className="space-y-1.5">
              {b.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm truncate">{line.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {(line.quantity / 100).toFixed(0)} × {formatMoney(line.unitPrice, b.currencyCode)}
                    </p>
                  </div>
                  {line.goodsReceiptLineId ? (
                    <Badge variant="outline" className="shrink-0 border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                      <PackageCheck className="mr-1 size-3" />Matched to delivery
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">
                      Not on an order
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Supplier document trail — attach the supplier's PDF/receipt to this bill. */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Supplier documents</p>
          <ReceiptAttachments
            orgId={orgId}
            entityType="bill"
            entityId={b.id}
            label="Supplier invoices & receipts"
            hint="The supplier's PDF, receipts, delivery notes"
          />
        </div>
      </div>
      {confirmDialog}
      {b.status === "draft" && (
        <EditBillSheet
          bill={b as unknown as EditableBill}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => cache.invalidate("/api/v1/bills")}
        />
      )}
    </ContentReveal>
  );
}
