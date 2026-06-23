"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { formatMoney, minorUnitsToDecimal, decimalToMinorUnits } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import Link from "next/link";

interface CustomerCreditDetail {
  id: string;
  date: string;
  status: string;
  originalAmount: number;
  amountRemaining: number;
  sourceType: string;
  currencyCode: string;
  notes: string | null;
  contactId: string | null;
  contact: { name: string; email: string | null } | null;
}

const statusColors: Record<string, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  refunded: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  open: "available",
  applied: "used",
  refunded: "refunded",
  void: "cancelled",
};

// Plain-language labels for how the money arrived.
const sourceLabels: Record<string, string> = {
  prepayment: "Paid in advance",
  overpayment: "Overpaid",
  credit_note: "Credit note",
};

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  status: string;
  currencyCode: string;
  contact: { name: string } | null;
}

export default function CustomerPrepaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [cc, setCc] = useState<CustomerCreditDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(cc?.contact?.name);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/customer-credits/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.customerCredit) setCc(data.customerCredit);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  // Fetch outstanding invoices (same customer + currency) for the apply dialog.
  useEffect(() => {
    if (!orgId || !applyOpen || !cc) return;
    fetch(`/api/v1/invoices?limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setInvoices(
            (data.data as InvoiceOption[]).filter(
              (inv) =>
                ["sent", "partial", "overdue"].includes(inv.status) &&
                inv.amountDue > 0 &&
                inv.currencyCode === cc.currencyCode
            )
          );
        }
      });
  }, [orgId, applyOpen, cc]);

  async function handleApply() {
    if (!orgId || !applyInvoiceId || !cc) return;
    const amount = decimalToMinorUnits(applyAmount, cc.currencyCode);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setApplyLoading(true);
    try {
      const res = await fetch(`/api/v1/customer-credits/${id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ invoiceId: applyInvoiceId, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setCc((prev) => prev ? { ...prev, ...data.customerCredit } : prev);
        setApplyOpen(false);
        setApplyInvoiceId("");
        setApplyAmount("");
        toast.success("Credit put towards the invoice");
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't use this credit");
      }
    } finally {
      setApplyLoading(false);
    }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!cc) return <div className="space-y-6"><PageHeader title="Prepayment not found" /></div>;

  const amountApplied = cc.originalAmount - cc.amountRemaining;

  return (
    <div className="space-y-6">
      <PageHeader title="Prepayment" description={`From: ${cc.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/customer-prepayments"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {cc.status === "open" && cc.amountRemaining > 0 && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" title="Put this credit towards what a customer owes on an invoice">
                <FileText className="mr-2 size-4" />Apply to an invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply this credit to an invoice</DialogTitle>
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
                          {inv.invoiceNumber} · {inv.contact?.name || "Unknown"} · Due: {formatMoney(inv.amountDue, inv.currencyCode)}
                        </SelectItem>
                      ))}
                      {invoices.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No outstanding invoices in {cc.currencyCode}
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <CurrencyInput
                    prefix="$"
                    value={applyAmount}
                    onChange={setApplyAmount}
                    placeholder={minorUnitsToDecimal(cc.amountRemaining, cc.currencyCode)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Available credit: {formatMoney(cc.amountRemaining, cc.currencyCode)}
                  </p>
                </div>
                <Button
                  onClick={handleApply}
                  loading={applyLoading}
                  disabled={!applyInvoiceId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Put towards the invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[cc.status] || ""}>
          {statusLabels[cc.status] || cc.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {sourceLabels[cc.sourceType] || cc.sourceType}
        </span>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Received {cc.date}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Original</p>
          <p className="text-xl font-bold font-mono">{formatMoney(cc.originalAmount, cc.currencyCode)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Used so far</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(amountApplied, cc.currencyCode)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-3.5 text-amber-600" />
            <p className="text-xs text-muted-foreground">Available to use</p>
          </div>
          <p className="text-xl font-bold font-mono text-amber-600 mt-1">{formatMoney(cc.amountRemaining, cc.currencyCode)}</p>
        </div>
      </div>

      {cc.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{cc.notes}</p>
        </div>
      )}
    </div>
  );
}
