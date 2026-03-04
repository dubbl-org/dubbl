"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { LineItemsEditor, type LineItem } from "@/components/dashboard/line-items-editor";
import Link from "next/link";

export default function NewQuotePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [expiryDate, setExpiryDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split("T")[0]; });
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "", accountId: "", taxRateId: "" }]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) { toast.error("Please select a customer"); return; }
    setSaving(true);
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          contactId, issueDate, expiryDate, reference: reference || null, notes: notes || null,
          lines: lines.map((l) => ({ description: l.description, quantity: parseFloat(l.quantity) || 1, unitPrice: parseFloat(l.unitPrice) || 0, accountId: l.accountId || null, taxRateId: l.taxRateId || null })),
        }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      const data = await res.json();
      toast.success("Quote created");
      router.push(`/sales/quotes/${data.quote.id}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New Quote" description="Create a sales quote." />
      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Customer *</Label><ContactPicker value={contactId} onChange={setContactId} type="customer" /></div>
          <div className="space-y-2"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          <div className="space-y-2"><Label>Issue Date</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Expiry Date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>Line Items</Label><LineItemsEditor lines={lines} onChange={setLines} accountTypeFilter={["revenue"]} /></div>
        <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" asChild><Link href="/sales/quotes">Cancel</Link></Button>
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? "Creating..." : "Create Quote"}</Button>
        </div>
      </form>
    </div>
  );
}
