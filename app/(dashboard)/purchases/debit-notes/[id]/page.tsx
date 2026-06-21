"use client";

import { useState, useEffect } from "react";
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
import { formatMoney, decimalToMinorUnits, minorUnitsToDecimal } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { SendDocumentDialog } from "@/components/dashboard/send-document-dialog";
import { EmailHistory } from "@/components/dashboard/email-history";
import Link from "next/link";

interface DebitNoteDetail {
  id: string;
  debitNoteNumber: string;
  issueDate: string;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  currencyCode: string;
  contactId: string | null;
  billId: string | null;
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

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  applied: "used",
  void: "cancelled",
};

interface BillOption {
  id: string;
  billNumber: string;
  total: number;
  amountDue: number;
  contact: { name: string } | null;
}

export default function DebitNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [dn, setDn] = useState<DebitNoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyBillId, setApplyBillId] = useState("");
  const [applyAmount, setApplyAmount] = useState("");
  const [bills, setBills] = useState<BillOption[]>([]);

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailHistoryKey, setEmailHistoryKey] = useState(0);
  const [orgName, setOrgName] = useState("");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(dn?.debitNoteNumber);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/debit-notes/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.debitNote) setDn(data.debitNote);
      })
      .finally(() => setLoading(false));
    fetch("/api/v1/organization", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.organization?.name) setOrgName(data.organization.name); }).catch(() => {});
  }, [id, orgId]);

  // Fetch outstanding bills for the same supplier for the apply dialog
  useEffect(() => {
    if (!orgId || !applyOpen) return;
    fetch(`/api/v1/bills?limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setBills(
            data.data.filter((b: BillOption & { status: string; contactId: string | null }) =>
              ["pending_approval", "received", "partial", "overdue"].includes(b.status) &&
              b.amountDue > 0 &&
              (!dn?.contactId || b.contactId === dn.contactId)
            )
          );
        }
      });
  }, [orgId, applyOpen, dn?.contactId]);

  function handleSendComplete() {
    if (!orgId) return;
    fetch(`/api/v1/debit-notes/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.debitNote) setDn(data.debitNote); });
    setEmailHistoryKey((k) => k + 1);
  }

  async function handleApply() {
    if (!orgId || !applyBillId) return;
    const amount = decimalToMinorUnits(parseFloat(applyAmount) || 0, dn?.currencyCode || "USD");
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setApplyLoading(true);
    try {
      const res = await fetch(`/api/v1/debit-notes/${id}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ billId: applyBillId, amount }),
      });
      if (res.ok) {
        const data = await res.json();
        setDn((prev) => prev ? { ...prev, ...data.debitNote } : prev);
        setApplyOpen(false);
        setApplyBillId("");
        setApplyAmount("");
        toast.success("Credit used to reduce the bill");
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
      title: "Cancel this supplier credit?",
      description: "This stops the credit from being used against any bill. You can't undo this.",
      confirmLabel: "Cancel supplier credit",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/debit-notes/${id}/void`, {
          method: "POST",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          const data = await res.json();
          setDn((prev) => prev ? { ...prev, ...data.debitNote } : prev);
          toast.success("Supplier credit cancelled");
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!dn) return <div className="space-y-6"><PageHeader title="Supplier credit not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={dn.debitNoteNumber} description={`From: ${dn.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/purchases/debit-notes"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {dn.status === "draft" && (
          <Button size="sm" onClick={() => setSendDialogOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Send className="mr-2 size-4" />Send
          </Button>
        )}
        {(dn.status === "sent" || dn.status === "applied") && dn.amountRemaining > 0 && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" title="Use this credit to reduce what you owe on a bill">
                <FileText className="mr-2 size-4" />Use against a bill
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Use this credit against a bill</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Bill</Label>
                  <Select value={applyBillId} onValueChange={setApplyBillId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a bill..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bills.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.billNumber} · {b.contact?.name || "Unknown"} · Due: {formatMoney(b.amountDue, dn.currencyCode)}
                        </SelectItem>
                      ))}
                      {bills.length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No outstanding bills for this supplier
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
                    placeholder={minorUnitsToDecimal(dn.amountRemaining, dn.currencyCode)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Remaining credit: {formatMoney(dn.amountRemaining, dn.currencyCode)}
                  </p>
                </div>
                <Button
                  onClick={handleApply}
                  loading={applyLoading}
                  disabled={!applyBillId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  Reduce the bill
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {dn.status !== "void" && (
          <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600" title="Stop this credit from being used against any bill">
            <Ban className="mr-2 size-4" />Cancel supplier credit
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[dn.status] || ""}>
          {statusLabels[dn.status] || dn.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Issued {dn.issueDate}
        </span>
        {dn.reference && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Ref: {dn.reference}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatMoney(dn.total, dn.currencyCode)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Used</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(dn.amountApplied, dn.currencyCode)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <p className="text-xl font-bold font-mono text-amber-600">{formatMoney(dn.amountRemaining, dn.currencyCode)}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {dn.lines.map((line) => (
          <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <div>
              <p className="text-sm">{line.description}</p>
              {line.account && (
                <p className="text-xs text-muted-foreground">{line.account.code} &middot; {line.account.name}</p>
              )}
            </div>
            <span className="text-right text-sm font-mono">{(line.quantity / 100).toFixed(2)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(line.unitPrice, dn.currencyCode)}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(line.amount, dn.currencyCode)}</span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right flex flex-wrap justify-end gap-x-4 gap-y-1">
          <span className="text-sm font-medium">Subtotal: {formatMoney(dn.subtotal, dn.currencyCode)}</span>
          {dn.taxTotal > 0 && (
            <span className="text-sm">Tax: {formatMoney(dn.taxTotal, dn.currencyCode)}</span>
          )}
          <span className="text-sm font-bold">Total: {formatMoney(dn.total, dn.currencyCode)}</span>
        </div>
      </div>

      {dn.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{dn.notes}</p>
        </div>
      )}

      <EmailHistory key={emailHistoryKey} documentType="debit_note" documentId={id} />

      <SendDocumentDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        documentType="debit_note"
        documentId={id}
        documentNumber={dn.debitNoteNumber}
        contactEmail={dn.contact?.email}
        contactName={dn.contact?.name}
        organizationName={orgName}
        amountDue={dn.total}
        issueDate={dn.issueDate}
        sendApiUrl={`/api/v1/debit-notes/${id}/send`}
        onSent={handleSendComplete}
      />

      {confirmDialog}
    </div>
  );
}
