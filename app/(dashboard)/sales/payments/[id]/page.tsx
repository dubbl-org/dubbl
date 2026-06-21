"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Banknote, FileText, Wallet } from "lucide-react";
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

interface Allocation {
  documentType: string;
  documentId: string;
  amount: number;
}

interface PaymentDetail {
  id: string;
  paymentNumber: string;
  type: string;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  currencyCode: string;
  contactId: string;
  contact: { name: string; email: string | null } | null;
  bankAccount: { name: string } | null;
  allocations: Allocation[];
}

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  status: string;
  currencyCode: string;
  contactId: string;
  contact: { name: string } | null;
}

const methodLabels: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pmt, setPmt] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Maps invoice id -> invoice number so allocations can show which invoice
  // they settled (the payment only stores the document id + amount).
  const [invoiceLookup, setInvoiceLookup] = useState<Record<string, InvoiceOption>>({});

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [openInvoices, setOpenInvoices] = useState<InvoiceOption[]>([]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(pmt ? `Payment ${pmt.paymentNumber}` : undefined);

  const loadPayment = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/payments/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.payment) setPmt(data.payment);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    loadPayment();
  }, [loadPayment]);

  // Resolve the invoice numbers behind this payment's existing allocations.
  useEffect(() => {
    if (!orgId || !pmt) return;
    const invoiceIds = pmt.allocations
      .filter((a) => a.documentType === "invoice" && !invoiceLookup[a.documentId])
      .map((a) => a.documentId);
    if (invoiceIds.length === 0) return;
    fetch(`/api/v1/invoices?limit=200`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          const map: Record<string, InvoiceOption> = {};
          for (const inv of data.data as InvoiceOption[]) map[inv.id] = inv;
          setInvoiceLookup((prev) => ({ ...prev, ...map }));
        }
      });
  }, [orgId, pmt, invoiceLookup]);

  // Load this customer's open invoices (same currency) for the allocate dialog.
  useEffect(() => {
    if (!orgId || !applyOpen || !pmt) return;
    fetch(`/api/v1/invoices?limit=200&contactId=${pmt.contactId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setOpenInvoices(
            (data.data as InvoiceOption[]).filter(
              (inv) =>
                ["sent", "partial", "overdue"].includes(inv.status) &&
                inv.amountDue > 0 &&
                inv.currencyCode === pmt.currencyCode
            )
          );
        }
      });
  }, [orgId, applyOpen, pmt]);

  async function handleAllocate() {
    if (!orgId || !applyInvoiceId || !pmt) return;
    const amount = decimalToMinorUnits(applyAmount, pmt.currencyCode);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const target = openInvoices.find((i) => i.id === applyInvoiceId);
    if (target && amount > target.amountDue) {
      toast.error("That's more than this invoice still needs");
      return;
    }
    setApplyLoading(true);
    try {
      const res = await fetch(`/api/v1/invoices/${applyInvoiceId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          amount,
          date: pmt.date,
          method: pmt.method,
          reference: pmt.reference || null,
        }),
      });
      if (res.ok) {
        setApplyOpen(false);
        setApplyInvoiceId("");
        setApplyAmount("");
        toast.success("Leftover put toward the invoice");
        loadPayment();
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't allocate the leftover");
      }
    } finally {
      setApplyLoading(false);
    }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!pmt) return <div className="space-y-6"><PageHeader title="Payment not found" /></div>;

  const allocatedTotal = pmt.allocations.reduce((sum, a) => sum + a.amount, 0);
  const unallocated = pmt.amount - allocatedTotal;
  const cur = pmt.currencyCode;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Payment ${pmt.paymentNumber}`}
        description={`From: ${pmt.contact?.name || "Unknown"}`}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/payments"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {unallocated > 0 && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                title="Put the leftover money from this payment toward an open invoice"
                onClick={() => setApplyAmount(minorUnitsToDecimal(unallocated, cur))}
              >
                <FileText className="mr-2 size-4" />Put leftover toward an invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Put the leftover toward an open invoice</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Invoice</Label>
                  <Select value={applyInvoiceId} onValueChange={setApplyInvoiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an invoice..." />
                    </SelectTrigger>
                    <SelectContent>
                      {openInvoices.map((inv) => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} · still needs {formatMoney(inv.amountDue, inv.currencyCode)}
                        </SelectItem>
                      ))}
                      {openInvoices.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No open invoices for this customer in {cur}
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
                    placeholder={minorUnitsToDecimal(unallocated, cur)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leftover from this payment: {formatMoney(unallocated, cur)}
                  </p>
                </div>
                <Button
                  onClick={handleAllocate}
                  loading={applyLoading}
                  disabled={!applyInvoiceId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Put toward the invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline">{methodLabels[pmt.method] || pmt.method}</Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">Received {pmt.date}</span>
        {pmt.reference && (
          <span className="text-xs sm:text-sm text-muted-foreground">Ref: {pmt.reference}</span>
        )}
        {pmt.bankAccount && (
          <span className="text-xs sm:text-sm text-muted-foreground">Into: {pmt.bankAccount.name}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Banknote className="size-3.5 text-emerald-600" />
            <p className="text-xs text-muted-foreground">Payment amount</p>
          </div>
          <p className="text-xl font-bold font-mono mt-1">{formatMoney(pmt.amount, cur)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Put toward invoices</p>
          <p className="text-xl font-bold font-mono text-emerald-600 mt-1">{formatMoney(allocatedTotal, cur)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Wallet className="size-3.5 text-amber-600" />
            <p className="text-xs text-muted-foreground">Not yet used</p>
          </div>
          <p className="text-xl font-bold font-mono text-amber-600 mt-1">{formatMoney(unallocated, cur)}</p>
        </div>
      </div>

      {unallocated > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {formatMoney(unallocated, cur)} of this payment hasn&apos;t been put toward any invoice yet.
          Use &ldquo;Put leftover toward an invoice&rdquo; above to apply it to an open invoice for this customer.
        </div>
      )}

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Invoices this payment covers</h2>
        </div>
        {pmt.allocations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            This payment isn&apos;t linked to any invoice yet.
          </div>
        ) : (
          <ul className="divide-y">
            {pmt.allocations.map((a, idx) => {
              const inv = a.documentType === "invoice" ? invoiceLookup[a.documentId] : undefined;
              return (
                <li key={`${a.documentId}-${idx}`} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="size-3.5 text-muted-foreground" />
                    {inv ? (
                      <Link
                        href={`/sales/invoices/${a.documentId}`}
                        className="font-medium hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="font-medium capitalize">{a.documentType}</span>
                    )}
                    {inv?.contact?.name && (
                      <span className="text-muted-foreground">· {inv.contact.name}</span>
                    )}
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium text-emerald-600">
                    {formatMoney(a.amount, cur)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pmt.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{pmt.notes}</p>
        </div>
      )}
    </div>
  );
}
