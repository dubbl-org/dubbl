"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, Check, X, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface QuoteDetail {
  id: string; quoteNumber: string; issueDate: string; expiryDate: string; status: string;
  subtotal: number; taxTotal: number; total: number; notes: string | null;
  contact: { name: string } | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number; account: { code: string; name: string } | null }[];
}

const statusColors: Record<string, string> = {
  draft: "", sent: "border-blue-200 bg-blue-50 text-blue-700", accepted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declined: "border-red-200 bg-red-50 text-red-700", expired: "border-gray-200 bg-gray-50 text-gray-700", converted: "border-purple-200 bg-purple-50 text-purple-700",
};

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [q, setQ] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/quotes/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.quote) setQ(data.quote); }).finally(() => setLoading(false));
  }, [id, orgId]);

  async function action(path: string) {
    if (!orgId) return;
    const res = await fetch(`/api/v1/quotes/${id}/${path}`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setQ((prev) => prev ? { ...prev, ...(data.quote || {}) } : prev); toast.success("Done"); }
    else toast.error("Failed");
  }

  async function handleConvert() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/quotes/${id}/convert`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); toast.success("Converted to invoice"); router.push(`/invoices/${data.invoice.id}`); }
    else toast.error("Failed to convert");
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!q) return <div className="space-y-6"><PageHeader title="Quote not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={q.quoteNumber} description={`To: ${q.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild><Link href="/quotes"><ArrowLeft className="mr-2 size-4" />Back</Link></Button>
        {q.status === "draft" && <Button size="sm" onClick={() => action("send")} className="bg-emerald-600 hover:bg-emerald-700"><Send className="mr-2 size-4" />Send</Button>}
        {q.status === "sent" && <>
          <Button size="sm" onClick={() => action("accept")} className="bg-emerald-600 hover:bg-emerald-700"><Check className="mr-2 size-4" />Accept</Button>
          <Button size="sm" variant="outline" onClick={() => action("decline")} className="text-red-600"><X className="mr-2 size-4" />Decline</Button>
        </>}
        {q.status === "accepted" && <Button size="sm" onClick={handleConvert} className="bg-emerald-600 hover:bg-emerald-700"><FileText className="mr-2 size-4" />Convert to Invoice</Button>}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[q.status] || ""}>{q.status}</Badge>
        <span className="text-sm text-muted-foreground">Issued {q.issueDate} · Expires {q.expiryDate}</span>
      </div>

      <div className="rounded-lg border p-4"><p className="text-xl font-bold font-mono">{formatMoney(q.total)}</p></div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Amount</span>
        </div>
        {q.lines.map((line) => (
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
