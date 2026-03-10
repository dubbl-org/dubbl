"use client";

import { useState, useEffect } from "react";
import { Plus, Scale, Percent, ShoppingCart, Package, Pencil } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: string;
  isDefault: boolean;
  isActive: boolean;
}

function CreateTaxRateDialog({ open, setOpen, onCreated, orgId }: { open: boolean; setOpen: (v: boolean) => void; onCreated: () => void; orgId: string | null }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [type, setType] = useState("both");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name, rate: Math.round(parseFloat(rate) * 100), type }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tax rate created");
      setOpen(false);
      setName("");
      setRate("");
      onCreated();
    } catch { toast.error("Failed to create tax rate"); }
    finally { setSaving(false); }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-1.5 size-3.5" />Add Tax Rate
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>New Tax Rate</SheetTitle></SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST 10%" required /></div>
          <div className="space-y-2"><Label>Rate (%)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10.00" required /></div>
          <div className="space-y-2"><Label>Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="purchase">Purchase</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Creating..." : "Create"}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function TaxRateRow({ rate, isLast, onEdit }: { rate: TaxRate; isLast: boolean; onEdit: (rate: TaxRate) => void }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3.5 ${!isLast ? "border-b" : ""}`}>
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
          <Percent className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{rate.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{rate.type}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-mono text-sm font-medium tabular-nums">
          {(rate.rate / 100).toFixed(2)}%
        </span>

        <Badge variant="outline" className="capitalize text-[11px]">
          {rate.type}
        </Badge>

        {rate.isDefault && (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]" variant="outline">
            Default
          </Badge>
        )}

        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={() => onEdit(rate)}>
          <Pencil className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export default function TaxRatesPage() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [editName, setEditName] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editType, setEditType] = useState("both");
  const [editSaving, setEditSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  async function fetchRates() {
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } });
      const data = await res.json();
      if (data.taxRates) setRates(data.taxRates);
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRates(); }, [orgId]);

  const salesCount = rates.filter((r) => r.type === "sales" || r.type === "both").length;
  const purchaseCount = rates.filter((r) => r.type === "purchase" || r.type === "both").length;

  function openEdit(rate: TaxRate) {
    setEditing(rate);
    setEditName(rate.name);
    setEditRate((rate.rate / 100).toFixed(2));
    setEditType(rate.type);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !editing) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/v1/tax-rates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name: editName, rate: Math.round(parseFloat(editRate) * 100), type: editType }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditing(null);
      await fetchRates();
      toast.success("Tax rate updated");
    } catch { toast.error("Failed to update tax rate"); }
    finally { setEditSaving(false); }
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Scale} label="Total rates" value={rates.length} />
        <StatCard icon={ShoppingCart} label="Sales" value={salesCount} />
        <StatCard icon={Package} label="Purchase" value={purchaseCount} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Tax Rates</h2>
          <p className="text-sm text-muted-foreground">
            Define tax rates to apply on invoices and bills. Rates can be scoped to sales, purchases, or both.
          </p>
        </div>
        <CreateTaxRateDialog open={open} setOpen={setOpen} onCreated={fetchRates} orgId={orgId} />
      </div>

      {/* Tax rate list */}
      {!loading && rates.length === 0 ? (
        <EmptyState icon={Scale} title="No tax rates" description="Add tax rates to apply taxes on invoices and bills." />
      ) : loading ? (
        <div className="rounded-xl border bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-4 px-5 py-3.5 ${i < 2 ? "border-b" : ""}`}>
              <div className="size-8 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-28 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-4 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          {rates.map((rate, i) => (
            <TaxRateRow key={rate.id} rate={rate} isLast={i === rates.length - 1} onEdit={openEdit} />
          ))}
        </div>
      )}
      <Sheet open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Tax Rate</SheetTitle></SheetHeader>
          <form onSubmit={handleEdit} className="space-y-4 px-4">
            <div className="space-y-2"><Label>Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Rate (%)</Label><Input type="number" step="0.01" value={editRate} onChange={(e) => setEditRate(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Type</Label>
              <Select value={editType} onValueChange={setEditType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="purchase">Purchase</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
              </Select>
            </div>
          </form>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={editSaving} className="bg-emerald-600 hover:bg-emerald-700">{editSaving ? "Saving..." : "Save Changes"}</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
