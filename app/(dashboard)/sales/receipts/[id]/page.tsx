"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Banknote, Landmark } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import Link from "next/link";

interface SalesReceiptDetail {
  id: string;
  receiptNumber: string;
  date: string;
  status: string;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  currencyCode: string;
  contact: { name: string; email: string | null } | null;
  bankAccount: { accountName: string } | null;
  depositAccount: { code: string; name: string } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  paid: "paid",
  void: "cancelled",
};

export default function SalesReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sr, setSr] = useState<SalesReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(sr?.receiptNumber);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/sales-receipts/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.salesReceipt) setSr(data.salesReceipt);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!sr) return <div className="space-y-6"><PageHeader title="Cash sale not found" /></div>;

  const paidInto = sr.bankAccount?.accountName
    || (sr.depositAccount ? `${sr.depositAccount.code} · ${sr.depositAccount.name}` : null);

  return (
    <div className="space-y-6">
      <PageHeader title={sr.receiptNumber} description={`Sold to: ${sr.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/receipts"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[sr.status] || ""}>
          {statusLabels[sr.status] || sr.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {sr.date}
        </span>
        {sr.reference && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Ref: {sr.reference}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatMoney(sr.total, sr.currencyCode)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <Banknote className="size-3.5 text-emerald-600" />
            <p className="text-xs text-muted-foreground">Paid into</p>
          </div>
          <p className="text-sm font-medium mt-1 flex items-center gap-1.5">
            {paidInto ? (
              <>
                <Landmark className="size-3.5 text-muted-foreground shrink-0" />
                {paidInto}
              </>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Price</span>
          <span className="text-right">Amount</span>
        </div>
        {sr.lines.map((line) => (
          <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <p className="text-sm">{line.description}</p>
            <span className="text-right text-sm font-mono">{(line.quantity / 100).toFixed(0)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(line.unitPrice, sr.currencyCode)}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(line.amount, sr.currencyCode)}</span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right flex flex-wrap justify-end gap-x-4 gap-y-1">
          <span className="text-sm font-medium">Subtotal: {formatMoney(sr.subtotal, sr.currencyCode)}</span>
          {sr.taxTotal > 0 && (
            <span className="text-sm">Tax: {formatMoney(sr.taxTotal, sr.currencyCode)}</span>
          )}
          <span className="text-sm font-bold">Total: {formatMoney(sr.total, sr.currencyCode)}</span>
        </div>
      </div>

      {sr.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{sr.notes}</p>
        </div>
      )}
    </div>
  );
}
