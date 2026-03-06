"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, Ban, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import Link from "next/link";

interface CreditNoteDetail {
  id: string;
  creditNoteNumber: string;
  issueDate: string;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  contactId: string | null;
  invoiceId: string | null;
  contact: { name: string; email: string | null } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    account: { code: string; name: string } | null;
    taxRate: number | null;
  }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  sent: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  contact: { name: string } | null;
}

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [cn, setCn] = useState<CreditNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(cn?.creditNoteNumber);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/credit-notes/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.creditNote) setCn(data.creditNote);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  // Fetch outstanding invoices for apply dialog
  useEffect(() => {
    if (!orgId || !applyOpen) return;
    fetch(`/api/v1/invoices?limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setInvoices(
            data.data.filter((inv: InvoiceOption & { status: string }) =>
              ["sent", "partial", "overdue"].includes(inv.status) && inv.amountDue > 0
            )
          );
        }
      });
  }, [orgId, applyOpen]);

  async function handleSend() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/credit-notes/${id}/send`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      const data = await res.json();
      setCn((prev) => prev ? { ...prev, ...data.creditNote } : prev);
      toast.success("Credit note sent");
    } else {
      toast.error("Failed to send credit note");
    }
  }

  async function handleApply() {
    if (!orgId || !applyInvoiceId) return;
    const amount = Math.round(parseFloat(applyAmount) * 100);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setApplyLoading(true);
    try {
      const res = await fetch(`/api/v1/credit-notes/${id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ invoiceId: applyInvoiceId, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setCn((prev) => prev ? { ...prev, ...data.creditNote } : prev);
        setApplyOpen(false);
        setApplyInvoiceId("");
        setApplyAmount("");
        toast.success("Credit note applied to invoice");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to apply credit note");
      }
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleVoid() {
    if (!orgId) return;
    await confirm({
      title: "Void this credit note?",
      description: "This will mark the credit note as void. This action cannot be undone.",
      confirmLabel: "Void Credit Note",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/credit-notes/${id}/void`, {
          method: "POST",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          const data = await res.json();
          setCn((prev) => prev ? { ...prev, ...data.creditNote } : prev);
          toast.success("Credit note voided");
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!cn) return <div className="space-y-6"><PageHeader title="Credit note not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={cn.creditNoteNumber} description={`To: ${cn.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/credit-notes"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {cn.status === "draft" && (
          <Button size="sm" onClick={handleSend} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="mr-2 size-4" />Send
          </Button>
        )}
        {cn.status === "sent" && cn.amountRemaining > 0 && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <FileText className="mr-2 size-4" />Apply to Invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply Credit Note</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Invoice</Label>
                  <Select value={applyInvoiceId} onValueChange={setApplyInvoiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an invoice..." />
                    </SelectTrigger>
                    <SelectContent>
                      {invoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} · {inv.contact?.name || "Unknown"} · Due: {formatMoney(inv.amountDue)}
                        </SelectItem>
                      ))}
                      {invoices.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No outstanding invoices
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={applyAmount}
                    onChange={(e) => setApplyAmount(e.target.value)}
                    placeholder={centsToDecimal(cn.amountRemaining)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Remaining credit: {formatMoney(cn.amountRemaining)}
                  </p>
                </div>
                <Button
                  onClick={handleApply}
                  loading={applyLoading}
                  disabled={!applyInvoiceId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Apply Credit
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {cn.status !== "void" && (
          <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600">
            <Ban className="mr-2 size-4" />Void
          </Button>
        )}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[cn.status] || ""}>
          {cn.status}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Issued {cn.issueDate}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatMoney(cn.total)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Applied</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(cn.amountApplied)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="text-xl font-bold font-mono text-amber-600">{formatMoney(cn.amountRemaining)}</p>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {cn.lines.map((line) => (
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
          <span className="text-sm font-medium">Subtotal: {formatMoney(cn.subtotal)}</span>
          {cn.taxTotal > 0 && (
            <span className="ml-4 text-sm">Tax: {formatMoney(cn.taxTotal)}</span>
          )}
          <span className="ml-4 text-sm font-bold">Total: {formatMoney(cn.total)}</span>
        </div>
      </div>

      {cn.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{cn.notes}</p>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
