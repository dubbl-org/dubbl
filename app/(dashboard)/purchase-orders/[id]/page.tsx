"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface PODetail {
  id: string; poNumber: string; issueDate: string; deliveryDate: string | null; status: string;
  subtotal: number; total: number; notes: string | null;
  contact: { name: string } | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number; account: { code: string; name: string } | null }[];
}

const statusColors: Record<string, string> = {
  draft: "", sent: "border-blue-200 bg-blue-50 text-blue-700", received: "border-emerald-200 bg-emerald-50 text-emerald-700",
  closed: "border-gray-200 bg-gray-50 text-gray-700", void: "border-red-200 bg-red-50 text-red-700",
};

export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PODetail | null>(null);
  const [loading, setLoading] = useState(true);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/purchase-orders/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.purchaseOrder) setPo(data.purchaseOrder); }).finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSend() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}/send`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setPo((prev) => prev ? { ...prev, ...data.purchaseOrder } : prev); toast.success("PO sent"); }
  }

  async function handleConvert() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/purchase-orders/${id}/convert`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); toast.success("Converted to bill"); router.push(`/bills/${data.bill.id}`); }
    else toast.error("Failed to convert");
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!po) return <div className="space-y-6"><PageHeader title="PO not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={po.poNumber} description={`From: ${po.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild><Link href="/purchase-orders"><ArrowLeft className="mr-2 size-4" />Back</Link></Button>
        {po.status === "draft" && <Button size="sm" onClick={handleSend} className="bg-emerald-600 hover:bg-emerald-700"><Send className="mr-2 size-4" />Send</Button>}
        {["sent", "received"].includes(po.status) && <Button size="sm" onClick={handleConvert} className="bg-emerald-600 hover:bg-emerald-700"><ShoppingCart className="mr-2 size-4" />Convert to Bill</Button>}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[po.status] || ""}>{po.status}</Badge>
        <span className="text-sm text-muted-foreground">Issued {po.issueDate}{po.deliveryDate ? ` · Delivery ${po.deliveryDate}` : ""}</span>
      </div>

      <div className="rounded-lg border p-4"><p className="text-xl font-bold font-mono">{formatMoney(po.total)}</p></div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Amount</span>
        </div>
        {po.lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <div><p className="text-sm">{line.description}</p>{line.account && <p className="text-xs text-muted-foreground">{line.account.code} &middot; {line.account.name}</p>}</div>
            <span className="text-right text-sm font-mono">{(line.quantity / 100).toFixed(0)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(line.unitPrice)}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(line.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
