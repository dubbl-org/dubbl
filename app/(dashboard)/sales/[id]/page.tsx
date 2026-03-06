"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, DollarSign, Ban, Copy, Clock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
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

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

interface PaymentRecord {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
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
  }, [id, orgId]);

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

  return (
    <div className="space-y-6">
      <PageHeader title={inv.invoiceNumber} description={`To: ${inv.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
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
                  <Input
                    type="number"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder={centsToDecimal(inv.amountDue)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
        <Button variant="outline" size="sm" onClick={handleDuplicate} loading={duplicating}>
          <Copy className="mr-2 size-4" />Duplicate
        </Button>
        {inv.status !== "void" && inv.status !== "paid" && (
          <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600">
            <Ban className="mr-2 size-4" />Void
          </Button>
        )}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[inv.status] || ""}>
          {inv.status}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Issued {inv.issueDate} · Due {inv.dueDate}
        </span>
        {(() => {
          if (["paid", "void", "draft"].includes(inv.status)) return null;
          const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
          if (days > 0) return <span className="text-xs font-medium text-red-600">{days}d overdue</span>;
          if (days === 0) return <span className="text-xs font-medium text-amber-600">Due today</span>;
          if (Math.abs(days) <= 7) return <span className="text-xs text-muted-foreground">Due in {Math.abs(days)}d</span>;
          return null;
        })()}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatMoney(inv.total)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(inv.amountPaid)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Due</p>
          <p className="text-xl font-bold font-mono text-amber-600">{formatMoney(inv.amountDue)}</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {inv.lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <div>
              <p className="text-sm">{line.description}</p>
              {line.account && (
                <p className="text-xs text-muted-foreground">{line.account.code} &middot; {line.account.name}</p>
              )}
            </div>
            <span className="text-right text-sm font-mono">{(line.quantity / 100).toFixed(0)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(line.unitPrice)}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(line.amount)}</span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right">
          <span className="text-sm font-medium">Subtotal: {formatMoney(inv.subtotal)}</span>
          {inv.taxTotal > 0 && (
            <span className="ml-4 text-sm">Tax: {formatMoney(inv.taxTotal)}</span>
          )}
          <span className="ml-4 text-sm font-bold">Total: {formatMoney(inv.total)}</span>
        </div>
      </div>

      {inv.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{inv.notes}</p>
        </div>
      )}

      {/* Payment History */}
      {payments.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
            <Clock className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">Payment History</p>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between border-b px-4 py-2.5 last:border-0">
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-muted-foreground">{p.paymentNumber}</span>
                <span className="text-sm text-muted-foreground">{p.date}</span>
                <span className="text-xs text-muted-foreground capitalize">{p.method.replace("_", " ")}</span>
              </div>
              <span className="text-sm font-mono font-medium text-emerald-600">{formatMoney(p.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
