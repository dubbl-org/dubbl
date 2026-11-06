"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, Ban, FileText } from "lucide-react";
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
import { formatMoney, centsToDecimal, decimalToMinorUnits } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useApi, useApiCache } from "@/lib/query/use-api";
import { SendDocumentDialog } from "@/components/dashboard/send-document-dialog";
import { EmailHistory } from "@/components/dashboard/email-history";
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
  currencyCode: string;
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
  applied: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  applied: "used",
  void: "cancelled",
};

interface InvoiceOption {
  id: string;
  invoiceNumber: string;
  total: number;
  amountDue: number;
  currencyCode: string;
  contactId: string;
  contact: { name: string } | null;
}

export default function CreditNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const url = `/api/v1/credit-notes/${id}`;
  const { data, loading } = useApi<{ creditNote?: CreditNoteDetail }>(url);
  const cn = data?.creditNote ?? null;
  const cache = useApiCache();
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyInvoiceId, setApplyInvoiceId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailHistoryKey, setEmailHistoryKey] = useState(0);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(cn?.creditNoteNumber);

  const { data: orgData } = useApi<{ organization?: { name?: string } }>("/api/v1/organization");
  const orgName = orgData?.organization?.name || "";

  // Outstanding invoices of the same customer and currency for the apply
  // dialog (the API rejects any other invoice).
  const { data: invoiceData } = useApi<{ data?: (InvoiceOption & { status: string })[] }>(
    applyOpen && cn?.contactId ? `/api/v1/invoices?contactId=${cn.contactId}&limit=100` : null
  );
  const invoices = useMemo<InvoiceOption[]>(
    () =>
      (invoiceData?.data ?? []).filter((inv) =>
        ["sent", "partial", "overdue"].includes(inv.status) &&
        inv.amountDue > 0 &&
        inv.contactId === cn?.contactId &&
        inv.currencyCode === cn?.currencyCode
      ),
    [invoiceData, cn?.contactId, cn?.currencyCode]
  );

  function handleSendComplete() {
    // The credit note refreshes itself once the send lands.
    setEmailHistoryKey((k) => k + 1);
  }

  async function handleApply() {
    if (!orgId || !applyInvoiceId) return;
    const amount = decimalToMinorUnits(applyAmount, cn?.currencyCode);
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
        cache.update<{ creditNote?: CreditNoteDetail }>(url, (d) => d.creditNote ? { ...d, creditNote: { ...d.creditNote, ...data.creditNote } } : d);
        setApplyOpen(false);
        setApplyInvoiceId("");
        setApplyAmount("");
        toast.success("Credit used to reduce the invoice");
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't use this credit");
      }
    } finally {
      setApplyLoading(false);
    }
  }

  async function handleVoid() {
    if (!orgId) return;
    await confirm({
      title: "Cancel this credit note?",
      description: "This stops the credit from being used against any invoice. You can't undo this.",
      confirmLabel: "Cancel credit note",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/credit-notes/${id}/void`, {
          method: "POST",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          const data = await res.json();
          cache.update<{ creditNote?: CreditNoteDetail }>(url, (d) => d.creditNote ? { ...d, creditNote: { ...d.creditNote, ...data.creditNote } } : d);
          toast.success("Credit note cancelled");
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
          <Button size="sm" onClick={() => setSendDialogOpen(true)} className="bg-brand-600 hover:bg-brand-700">
            <Send className="mr-2 size-4" />Send
          </Button>
        )}
        {cn.status === "sent" && cn.amountRemaining > 0 && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-brand-600 hover:bg-brand-700" title="Use this credit to reduce what a customer owes on an invoice">
                <FileText className="mr-2 size-4" />Use against an invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Use this credit against an invoice</DialogTitle>
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
                          {inv.invoiceNumber} · Due: {formatMoney(inv.amountDue, inv.currencyCode)}
                        </SelectItem>
                      ))}
                      {invoices.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No outstanding invoices for {cn.contact?.name || "this customer"}
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
                  className="w-full bg-brand-600 hover:bg-brand-700"
                >
                  Reduce the invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {cn.status !== "void" && (
          <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600" title="Stop this credit from being used against any invoice">
            <Ban className="mr-2 size-4" />Cancel credit note
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[cn.status] || ""}>
          {statusLabels[cn.status] || cn.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
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
          <p className="text-xl font-bold font-mono text-brand-600">{formatMoney(cn.amountApplied)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="text-xl font-bold font-mono text-amber-600">{formatMoney(cn.amountRemaining)}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {cn.lines.map((line) => (
          <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
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
        <div className="border-t bg-muted/30 px-4 py-2 text-right flex flex-wrap justify-end gap-x-4 gap-y-1">
          <span className="text-sm font-medium">Subtotal: {formatMoney(cn.subtotal)}</span>
          {cn.taxTotal > 0 && (
            <span className="text-sm">Tax: {formatMoney(cn.taxTotal)}</span>
          )}
          <span className="text-sm font-bold">Total: {formatMoney(cn.total)}</span>
        </div>
      </div>

      {cn.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{cn.notes}</p>
        </div>
      )}

      <EmailHistory key={emailHistoryKey} documentType="credit_note" documentId={id} />

      <SendDocumentDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        documentType="credit_note"
        documentId={id}
        documentNumber={cn.creditNoteNumber}
        contactEmail={cn.contact?.email}
        contactName={cn.contact?.name}
        organizationName={orgName}
        amountDue={cn.total}
        issueDate={cn.issueDate}
        sendApiUrl={`/api/v1/credit-notes/${id}/send`}
        onSent={handleSendComplete}
      />

      {confirmDialog}
    </div>
  );
}
