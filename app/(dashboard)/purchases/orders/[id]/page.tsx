"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface PODetail {
  id: string;
  poNumber: string;
  issueDate: string;
  deliveryDate: string | null;
  status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  contact: { name: string } | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    account: { code: string; name: string } | null;
  }[];
}

const statusConfig: Record<string, { class: string }> = {
  draft: { class: "" },
  sent: { class: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  partial: { class: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  received: { class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  closed: { class: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300" },
  void: { class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300" },
};

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(po?.poNumber);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/purchase-orders/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.purchaseOrder) setPo(data.purchaseOrder); })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSend() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}/send`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) {
      const data = await res.json();
      setPo((prev) => prev ? { ...prev, ...data.purchaseOrder } : prev);
      toast.success("PO sent");
    }
  }

  async function handleConvert() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}/convert`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) {
      const data = await res.json();
      toast.success("Converted to bill");
      router.push(`/purchases/${data.bill.id}`);
    } else {
      toast.error("Failed to convert");
    }
  }

  if (loading) return <BrandLoader />;

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-sm text-muted-foreground">Purchase order not found</p>
        <Button variant="ghost" size="sm" asChild className="mt-2">
          <Link href="/purchases/orders">Back to orders</Link>
        </Button>
      </div>
    );
  }

  const sc = statusConfig[po.status] || statusConfig.draft;

  return (
    <BlurReveal>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/purchases/orders"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">{po.poNumber}</h1>
                <Badge variant="outline" className={sc.class}>{po.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {po.contact?.name || "Unknown supplier"}
                {po.deliveryDate && <span> · Delivery {po.deliveryDate}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {po.status === "draft" && (
              <Button size="sm" onClick={handleSend} className="bg-emerald-600 hover:bg-emerald-700">
                <Send className="mr-2 size-3.5" />Send
              </Button>
            )}
            {["sent", "received"].includes(po.status) && (
              <Button size="sm" onClick={handleConvert} className="bg-emerald-600 hover:bg-emerald-700">
                <ShoppingCart className="mr-2 size-3.5" />Convert to Bill
              </Button>
            )}
          </div>
        </div>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-blue-500/20 via-border to-transparent" />

        {/* Info */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>Issued {po.issueDate}</span>
          {po.deliveryDate && <span>Delivery {po.deliveryDate}</span>}
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(po.total)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Items</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums">{po.lines.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Supplier</p>
            <p className="mt-1 text-xl font-bold truncate">{po.contact?.name || "-"}</p>
          </div>
        </div>

        {po.notes && (
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{po.notes}</p>
          </div>
        )}

        {/* Line items */}
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Price</span>
              <span className="text-right">Amount</span>
            </div>
            {po.lines.map((line) => (
              <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">{line.description}</p>
                  {line.account && (
                    <p className="text-xs text-muted-foreground">{line.account.code} · {line.account.name}</p>
                  )}
                </div>
                <span className="text-right text-sm font-mono tabular-nums">{(line.quantity / 100).toFixed(0)}</span>
                <span className="text-right text-sm font-mono tabular-nums">{formatMoney(line.unitPrice)}</span>
                <span className="text-right text-sm font-mono font-medium tabular-nums">{formatMoney(line.amount)}</span>
              </div>
            ))}
            {/* Total row */}
            <div className="grid min-w-[500px] grid-cols-[1fr_80px_100px_120px] gap-2 bg-muted/50 px-4 py-3">
              <span />
              <span />
              <span className="text-right text-sm font-semibold">Total</span>
              <span className="text-right text-sm font-mono font-bold tabular-nums">{formatMoney(po.total)}</span>
            </div>
          </div>
        </div>
      </div>
    </BlurReveal>
  );
}
