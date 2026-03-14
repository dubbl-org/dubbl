"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, DollarSign, Ban, Copy, Clock, Mail, Banknote, Download, AlertTriangle, X, Pencil, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import Link from "next/link";

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  reference: string | null;
  notes: string | null;
  contactId: string;
  contact: { name: string; email: string | null } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    account: { code: string; name: string; id: string } | null;
  }[];
}

const statusConfig: Record<string, { class: string; bg: string }> = {
  draft: { class: "", bg: "bg-gray-500" },
  sent: {
    class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
    bg: "bg-blue-500",
  },
  partial: {
    class: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bg: "bg-amber-500",
  },
  paid: {
    class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    bg: "bg-emerald-500",
  },
  overdue: {
    class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    bg: "bg-red-500",
  },
  void: {
    class: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
    bg: "bg-gray-400",
  },
};

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

interface PaymentRecord {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getOverdueInfo(dueDate: string, status: string) {
  if (["paid", "void", "draft"].includes(status)) return null;
  const days = Math.floor((Date.now() - new Date(dueDate).getTime()) / 86400000);
  if (days > 0) return { label: `${days}d overdue`, class: "text-red-600 dark:text-red-400" };
  if (days === 0) return { label: "Due today", class: "text-amber-600 dark:text-amber-400" };
  if (Math.abs(days) <= 7) return { label: `Due in ${Math.abs(days)}d`, class: "text-muted-foreground" };
  return null;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payOpen, setPayOpen] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [complianceWarnings, setComplianceWarnings] = useState<{ field: string; message: string; severity: "error" | "warning" }[]>([]);
  const [complianceDismissed, setComplianceDismissed] = useState(false);
  const [snapshotSheetOpen, setSnapshotSheetOpen] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderTaxId, setSenderTaxId] = useState("");
  const [senderReg, setSenderReg] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientTaxNumber, setRecipientTaxNumber] = useState("");
  const [senderSnapshot, setSenderSnapshot] = useState<Record<string, string | null> | null>(null);
  const [recipientSnapshot, setRecipientSnapshot] = useState<Record<string, string | null> | null>(null);

  useEntityTitle(inv?.invoiceNumber);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/invoices/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.invoice) setInv(data.invoice);
        if (data.payments) setPayments(data.payments);
      })
      .finally(() => setLoading(false));

    fetch(`/api/v1/invoices/${id}/compliance`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.warnings) setComplianceWarnings(data.warnings);
      })
      .catch(() => {});

    fetch(`/api/v1/invoices/${id}/snapshot`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.sender) setSenderSnapshot(data.sender);
        if (data.recipient) setRecipientSnapshot(data.recipient);
      })
      .catch(() => {});
  }, [id, orgId]);

  function openSnapshotEdit() {
    setSenderName(senderSnapshot?.name || "");
    setSenderAddress(senderSnapshot?.address || "");
    setSenderEmail(senderSnapshot?.email || "");
    setSenderPhone(senderSnapshot?.phone || "");
    setSenderTaxId(senderSnapshot?.taxId || "");
    setSenderReg(senderSnapshot?.registrationNumber || "");
    setRecipientName(recipientSnapshot?.name || inv?.contact?.name || "");
    setRecipientAddress(recipientSnapshot?.address || "");
    setRecipientEmail(recipientSnapshot?.email || inv?.contact?.email || "");
    setRecipientTaxNumber(recipientSnapshot?.taxNumber || "");
    setSnapshotSheetOpen(true);
  }

  async function handleSaveSnapshot() {
    if (!orgId) return;
    setSnapshotSaving(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/snapshot`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          sender: {
            name: senderName,
            address: senderAddress || null,
            email: senderEmail || null,
            phone: senderPhone || null,
            taxId: senderTaxId || null,
            registrationNumber: senderReg || null,
          },
          recipient: {
            name: recipientName,
            email: recipientEmail || null,
            address: recipientAddress || null,
            taxNumber: recipientTaxNumber || null,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSenderSnapshot(data.sender);
        setRecipientSnapshot(data.recipient);
        setSnapshotSheetOpen(false);
        toast.success("Invoice details updated");
      } else {
        toast.error("Failed to update details");
      }
    } finally {
      setSnapshotSaving(false);
    }
  }

  async function handleDownloadPdf() {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/invoices/${id}/pdf?format=pdf`, {
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) {
        toast.error("Failed to download PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${inv?.invoiceNumber || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download PDF");
    }
  }

  async function handleSend() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/invoices/${id}/send`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setInv((prev) => prev ? { ...prev, ...data.invoice } : prev);
      toast.success("Invoice sent");
    } else {
      toast.error("Failed to send invoice");
    }
  }

  async function handlePay() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(payAmount) * 100);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    setPayLoading(true);
    try {
      const res = await fetch(`/api/v1/invoices/${id}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ amount, date: payDate, method: payMethod }),
      });

      if (res.ok) {
        const data = await res.json();
        setInv((prev) => prev ? { ...prev, ...data.invoice } : prev);
        if (data.payment) {
          setPayments((prev) => [...prev, data.payment]);
        }
        setPayOpen(false);
        setPayAmount("");
        toast.success("Payment recorded");
      } else {
        toast.error("Failed to record payment");
      }
    } finally {
      setPayLoading(false);
    }
  }

  async function handleVoid() {
    if (!orgId) return;
    await confirm({
      title: "Void this invoice?",
      description: "This will mark the invoice as void. This action cannot be undone.",
      confirmLabel: "Void Invoice",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/invoices/${id}/void`, {
          method: "POST",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          const data = await res.json();
          setInv((prev) => prev ? { ...prev, ...data.invoice } : prev);
          toast.success("Invoice voided");
        }
      },
    });
  }

  async function handleDuplicate() {
    if (!orgId || !inv) return;
    setDuplicating(true);
    try {
      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId: inv.contactId,
          issueDate: new Date().toISOString().split("T")[0],
          dueDate: (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; })(),
          reference: inv.reference || null,
          notes: inv.notes || null,
          lines: inv.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity / 100,
            unitPrice: l.unitPrice / 100,
            accountId: l.account?.id || null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Invoice duplicated");
        router.push(`/sales/${data.invoice.id}`);
      }
    } catch {
      toast.error("Failed to duplicate invoice");
    } finally {
      setDuplicating(false);
    }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!inv) return <div className="space-y-6"><PageHeader title="Invoice not found" /></div>;

  const overdueInfo = getOverdueInfo(inv.dueDate, inv.status);
  const paidPercent = inv.total > 0
    ? Math.min(100, Math.round((inv.amountPaid / inv.total) * 100))
    : inv.amountPaid > 0 ? 100 : 0;
  const sc = statusConfig[inv.status] || statusConfig.draft;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/sales"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">{inv.invoiceNumber}</h1>
                <Badge variant="outline" className={sc.class}>{inv.status}</Badge>
                {overdueInfo && (
                  <span className={`text-xs font-medium ${overdueInfo.class}`}>{overdueInfo.label}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {inv.contact?.name || "Unknown contact"}
                {inv.contact?.email && <span> · {inv.contact.email}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {inv.status === "draft" && (
              <Button size="sm" onClick={handleSend} className="bg-emerald-600 hover:bg-emerald-700">
                <Send className="mr-2 size-4" />Send
              </Button>
            )}
            {["sent", "partial", "overdue"].includes(inv.status) && (
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                    <DollarSign className="mr-2 size-4" />Record Payment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Amount</Label>
                      <CurrencyInput
                        prefix="$"
                        value={payAmount}
                        onChange={setPayAmount}
                        placeholder={centsToDecimal(inv.amountDue)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <DatePicker value={payDate} onChange={setPayDate} placeholder="Payment date" />
                    </div>
                    <div className="space-y-2">
                      <Label>Method</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handlePay} loading={payLoading} className="w-full bg-emerald-600 hover:bg-emerald-700">
                      Record Payment
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
              <Download className="mr-2 size-4" />Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleDuplicate} loading={duplicating}>
              <Copy className="mr-2 size-4" />Duplicate
            </Button>
            {inv.status !== "void" && inv.status !== "paid" && (
              <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600">
                <Ban className="mr-2 size-4" />Void
              </Button>
            )}
          </div>
        </div>

        {/* Compliance warnings */}
        {complianceWarnings.length > 0 && !complianceDismissed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Invoice Compliance</p>
                  <ul className="mt-1.5 space-y-1">
                    {complianceWarnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <span className={`inline-block size-1.5 rounded-full ${w.severity === "error" ? "bg-red-500" : "bg-amber-500"}`} />
                        {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button onClick={() => setComplianceDismissed(true)} className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300">
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {/* Invoice document */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Document header */}
          <div className="border-b bg-muted/30 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Left: Bill to */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Bill to</p>
                <p className="text-sm font-semibold">{inv.contact?.name || "Unknown"}</p>
                {inv.contact?.email && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Mail className="size-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{inv.contact.email}</span>
                  </div>
                )}
              </div>
              {/* Right: Invoice meta */}
              <div className="sm:text-right">
                <div className="space-y-1.5">
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Invoice</span>
                    <span className="text-sm font-mono font-semibold">{inv.invoiceNumber}</span>
                  </div>
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Issued</span>
                    <span className="text-sm">{formatDate(inv.issueDate)}</span>
                  </div>
                  <div className="flex sm:justify-end items-center gap-3">
                    <span className="text-xs text-muted-foreground">Due</span>
                    <span className="text-sm">{formatDate(inv.dueDate)}</span>
                    {overdueInfo && (
                      <span className={`text-[11px] font-medium ${overdueInfo.class}`}>{overdueInfo.label}</span>
                    )}
                  </div>
                  {inv.reference && (
                    <div className="flex sm:justify-end items-center gap-3">
                      <span className="text-xs text-muted-foreground">Ref</span>
                      <span className="text-sm">{inv.reference}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-20">Qty</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28">Price</th>
                  <th className="px-6 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((line, i) => (
                  <tr key={line.id} className={i < inv.lines.length - 1 ? "border-b border-dashed" : ""}>
                    <td className="px-6 py-3">
                      <p>{line.description}</p>
                      {line.account && (
                        <p className="text-xs text-muted-foreground mt-0.5">{line.account.code} · {line.account.name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{(line.quantity / 100).toFixed(0)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">{formatMoney(line.unitPrice)}</td>
                    <td className="px-6 py-3 text-right font-mono tabular-nums font-medium">{formatMoney(line.amount)}</td>
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
                  <span className="font-mono tabular-nums">{formatMoney(inv.subtotal)}</span>
                </div>
                {inv.taxTotal > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-mono tabular-nums">{formatMoney(inv.taxTotal)}</span>
                  </div>
                )}
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{formatMoney(inv.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment summary + Notes row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Payment progress */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment Status</p>
              <span className="text-xs font-mono text-muted-foreground">{paidPercent}%</span>
            </div>
            {/* Progress bar */}
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden mb-4">
              <div
                className={`h-full rounded-full transition-all ${sc.bg}`}
                style={{ width: `${paidPercent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Total</p>
                <p className="text-sm font-mono font-semibold tabular-nums mt-0.5">{formatMoney(inv.total)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Paid</p>
                <p className="text-sm font-mono font-semibold tabular-nums text-emerald-600 mt-0.5">{formatMoney(inv.amountPaid)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Due</p>
                <p className="text-sm font-mono font-semibold tabular-nums text-amber-600 mt-0.5">{formatMoney(inv.amountDue)}</p>
              </div>
            </div>
          </div>

          {/* Notes / Reference */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Details</p>
            <div className="space-y-3">
              {inv.reference && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Reference</p>
                  <p className="text-sm mt-0.5">{inv.reference}</p>
                </div>
              )}
              {inv.notes ? (
                <div>
                  <p className="text-[11px] text-muted-foreground">Notes</p>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{inv.notes}</p>
                </div>
              ) : !inv.reference ? (
                <p className="text-sm text-muted-foreground">No notes or reference added.</p>
              ) : null}
              <div>
                <p className="text-[11px] text-muted-foreground">Dates</p>
                <p className="text-sm mt-0.5">
                  {formatDate(inv.issueDate)} · {formatDate(inv.dueDate)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Document Details (snapshot) */}
        {inv.status !== "draft" && (
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document Details</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={openSnapshotEdit}>
                <Pencil className="size-3" />
                Edit
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">From</p>
                <p className="text-sm font-medium">{senderSnapshot?.name || "-"}</p>
                {senderSnapshot?.address && <p className="text-xs text-muted-foreground">{senderSnapshot.address}</p>}
                {senderSnapshot?.email && <p className="text-xs text-muted-foreground">{senderSnapshot.email}</p>}
                {senderSnapshot?.phone && <p className="text-xs text-muted-foreground">{senderSnapshot.phone}</p>}
                {senderSnapshot?.taxId && <p className="text-xs text-muted-foreground">Tax ID: {senderSnapshot.taxId}</p>}
                {senderSnapshot?.registrationNumber && <p className="text-xs text-muted-foreground">Reg: {senderSnapshot.registrationNumber}</p>}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1">Bill to</p>
                <p className="text-sm font-medium">{recipientSnapshot?.name || inv.contact?.name || "-"}</p>
                {(recipientSnapshot?.address) && <p className="text-xs text-muted-foreground">{recipientSnapshot.address}</p>}
                {(recipientSnapshot?.email || inv.contact?.email) && <p className="text-xs text-muted-foreground">{recipientSnapshot?.email || inv.contact?.email}</p>}
                {recipientSnapshot?.taxNumber && <p className="text-xs text-muted-foreground">Tax: {recipientSnapshot.taxNumber}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Snapshot Edit Sheet */}
        <Sheet open={snapshotSheetOpen} onOpenChange={setSnapshotSheetOpen}>
          <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Edit Document Details</SheetTitle>
            </SheetHeader>
            <div className="flex-1 space-y-4 px-4 pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 pt-2">From (Sender)</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Textarea value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} rows={2} className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax ID / VAT</Label>
                <Input value={senderTaxId} onChange={(e) => setSenderTaxId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Registration Number</Label>
                <Input value={senderReg} onChange={(e) => setSenderReg(e.target.value)} />
              </div>

              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 pt-2">Bill to (Recipient)</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Address</Label>
                <Textarea value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} rows={2} className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tax Number</Label>
                <Input value={recipientTaxNumber} onChange={(e) => setRecipientTaxNumber(e.target.value)} />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline" onClick={() => setSnapshotSheetOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSaveSnapshot}
                disabled={snapshotSaving || !senderName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {snapshotSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Save
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
              <Clock className="size-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment History</p>
            </div>
            <div className="divide-y">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 shrink-0">
                      <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium">{p.paymentNumber}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{methodLabels[p.method] || p.method}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(p.date)}</p>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-semibold text-emerald-600 shrink-0">{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}
