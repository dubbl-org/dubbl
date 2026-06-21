"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Truck, PackageCheck, BookOpen, ReceiptText, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { toast } from "sonner";
import Link from "next/link";

interface GoodsReceiptDetail {
  id: string;
  receiptNumber: string;
  date: string;
  status: string;
  notes: string | null;
  purchaseOrderId: string | null;
  contact: { name: string } | null;
  purchaseOrder: { id: string; poNumber: string } | null;
  lines: {
    id: string;
    description: string;
    quantityReceived: number;
    unitCost: number;
    journalEntryId: string | null;
    inventoryItem: { name: string; sku: string | null } | null;
    warehouse: { name: string } | null;
  }[];
}

const statusColors: Record<string, string> = {
  draft: "",
  received: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  billed: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  draft: "draft",
  received: "received",
  billed: "billed",
  void: "cancelled",
};

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [gr, setGr] = useState<GoodsReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  async function handleCreateBill() {
    if (!orgId) return;
    setBilling(true);
    try {
      const res = await fetch(`/api/v1/goods-receipts/${id}/create-bill`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not create a bill from this goods receipt");
        return;
      }
      toast.success("Draft bill created");
      router.push(`/purchases/${data.bill.id}`);
    } catch {
      toast.error("Could not create a bill from this goods receipt");
    } finally {
      setBilling(false);
    }
  }

  useEntityTitle(gr?.receiptNumber);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/goods-receipts/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.goodsReceipt) setGr(data.goodsReceipt);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!gr) return <div className="space-y-6"><PageHeader title="Goods receipt not found" /></div>;

  // Total value received: sum of (qty received / 100) * unit cost per line.
  const totalValue = Math.round(
    gr.lines.reduce((sum, l) => sum + (l.quantityReceived / 100) * l.unitCost, 0)
  );
  // First line carrying a journal entry — the GRNI posting for this receipt.
  const journalEntryId = gr.lines.find((l) => l.journalEntryId)?.journalEntryId ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={gr.receiptNumber} description={`From: ${gr.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/purchases/goods-receipts"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {gr.purchaseOrder && (
          <Button variant="outline" size="sm" asChild title="Open the purchase order these goods were received against">
            <Link href={`/purchases/orders/${gr.purchaseOrder.id}`}>
              <Truck className="mr-2 size-4" />View order {gr.purchaseOrder.poNumber}
            </Link>
          </Button>
        )}
        {gr.status === "received" && (
          <Button
            size="sm"
            onClick={handleCreateBill}
            disabled={billing}
            title="Create a draft supplier bill for the items received here, ready to review and pay"
          >
            {billing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <ReceiptText className="mr-2 size-4" />
            )}
            Create a bill from this
          </Button>
        )}
        {journalEntryId && (
          <Button variant="outline" size="sm" asChild title="See the bookkeeping entry created when these goods were received">
            <Link href={`/accounting/${journalEntryId}`}>
              <BookOpen className="mr-2 size-4" />View bookkeeping entry
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[gr.status] || ""}>
          {statusLabels[gr.status] || gr.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Received {gr.date}
        </span>
        {gr.purchaseOrder && (
          <Link
            href={`/purchases/orders/${gr.purchaseOrder.id}`}
            className="text-xs sm:text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Order {gr.purchaseOrder.poNumber}
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Value received</p>
          <p className="text-xl font-bold font-mono">{formatMoney(totalValue)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <PackageCheck className="size-3.5 text-emerald-600" />
            <p className="text-xs text-muted-foreground">Items received</p>
          </div>
          <p className="text-sm font-medium mt-1">
            {gr.lines.length} item{gr.lines.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[1fr_140px_80px_110px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Item</span>
          <span>Location</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit cost</span>
          <span className="text-right">Value</span>
        </div>
        {gr.lines.map((line) => (
          <div key={line.id} className="grid min-w-[640px] grid-cols-[1fr_140px_80px_110px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <div>
              <p className="text-sm">{line.inventoryItem?.name || line.description}</p>
              {line.inventoryItem?.sku && (
                <p className="text-xs text-muted-foreground">{line.inventoryItem.sku}</p>
              )}
            </div>
            <span className="text-sm text-muted-foreground truncate">{line.warehouse?.name || "-"}</span>
            <span className="text-right text-sm font-mono">{(line.quantityReceived / 100).toFixed(0)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(line.unitCost)}</span>
            <span className="text-right text-sm font-mono font-medium">
              {formatMoney(Math.round((line.quantityReceived / 100) * line.unitCost))}
            </span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right">
          <span className="text-sm font-bold">Total value: {formatMoney(totalValue)}</span>
        </div>
      </div>

      {gr.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{gr.notes}</p>
        </div>
      )}
    </div>
  );
}
