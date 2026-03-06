"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, DollarSign, Ban } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatMoney, centsToDecimal } from "@/lib/money";
import Link from "next/link";

interface BillDetail {
  id: string; billNumber: string; issueDate: string; dueDate: string; status: string;
  subtotal: number; taxTotal: number; total: number; amountPaid: number; amountDue: number;
  notes: string | null; contact: { name: string } | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; amount: number; account: { code: string; name: string } | null }[];
}

const statusColors: Record<string, string> = {
  draft: "", received: "border-blue-200 bg-blue-50 text-blue-700", partial: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700", overdue: "border-red-200 bg-red-50 text-red-700", void: "border-gray-200 bg-gray-50 text-gray-700",
};

export default function BillDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<BillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payOpen, setPayOpen] = useState(false);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/bills/${id}`, { headers: { "x-organization-id": orgId } })
      .then((r) => r.json()).then((data) => { if (data.bill) setB(data.bill); }).finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleReceive() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/bills/${id}/receive`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); toast.success("Bill received"); }
    else toast.error("Failed");
  }

  async function handlePay() {
    if (!orgId) return;
    const amount = Math.round(parseFloat(payAmount) * 100);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    const res = await fetch(`/api/v1/bills/${id}/pay`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ amount, date: payDate }),
    });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); setPayOpen(false); toast.success("Payment recorded"); }
    else toast.error("Failed");
  }

  async function handleVoid() {
    if (!orgId || !confirm("Void this bill?")) return;
    const res = await fetch(`/api/v1/bills/${id}/void`, { method: "POST", headers: { "x-organization-id": orgId } });
    if (res.ok) { const data = await res.json(); setB((prev) => prev ? { ...prev, ...data.bill } : prev); toast.success("Bill voided"); }
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!b) return <div className="space-y-6"><PageHeader title="Bill not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={b.billNumber} description={`From: ${b.contact?.name || "Unknown"}`}>
        <Button variant="outline" size="sm" asChild><Link href="/purchases"><ArrowLeft className="mr-2 size-4" />Back</Link></Button>
        {b.status === "draft" && <Button size="sm" onClick={handleReceive} className="bg-emerald-600 hover:bg-emerald-700"><Check className="mr-2 size-4" />Mark Received</Button>}
        {["received", "partial", "overdue"].includes(b.status) && (
          <Dialog open={payOpen} onOpenChange={setPayOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><DollarSign className="mr-2 size-4" />Record Payment</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={centsToDecimal(b.amountDue)} /></div>
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                <Button onClick={handlePay} className="w-full bg-emerald-600 hover:bg-emerald-700">Record Payment</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {b.status !== "void" && b.status !== "paid" && <Button variant="outline" size="sm" onClick={handleVoid} className="text-red-600"><Ban className="mr-2 size-4" />Void</Button>}
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[b.status] || ""}>{b.status}</Badge>
        <span className="text-sm text-muted-foreground">Issued {b.issueDate} · Due {b.dueDate}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold font-mono">{formatMoney(b.total)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Paid</p><p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(b.amountPaid)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Due</p><p className="text-xl font-bold font-mono text-amber-600">{formatMoney(b.amountDue)}</p></div>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_80px_100px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span><span className="text-right">Qty</span><span className="text-right">Price</span><span className="text-right">Amount</span>
        </div>
        {b.lines.map((line) => (
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
