"use client";

import { useState, useEffect } from "react";
import { Plus, Scale, Percent, ShoppingCart, Package, Pencil, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
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
  const activeCount = rates.filter((r) => r.isActive).length;

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
    <div className="space-y-6">
      <PageHeader
        title="Tax Rates"
        description="Define tax rates to apply on invoices and bills."
      >
        <CreateTaxRateDialog open={open} setOpen={setOpen} onCreated={fetchRates} orgId={orgId} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Rates"
          value={String(rates.length)}
          icon={Scale}
          changeType="neutral"
        />
        <StatCard
          title="Sales Rates"
          value={String(salesCount)}
          icon={ShoppingCart}
          change={salesCount > 0 ? `${salesCount} rate${salesCount !== 1 ? "s" : ""} for invoices` : undefined}
          changeType="neutral"
        />
        <StatCard
          title="Purchase Rates"
          value={String(purchaseCount)}
          icon={Package}
          change={purchaseCount > 0 ? `${purchaseCount} rate${purchaseCount !== 1 ? "s" : ""} for bills` : undefined}
          changeType="neutral"
        />
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : rates.length === 0 ? (
        <EmptyState icon={Scale} title="No tax rates" description="Add tax rates to apply taxes on invoices and bills." />
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {rates.map((rate, i) => (
            <div
              key={rate.id}
              className={cn(
                "flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/30",
                i < rates.length - 1 && "border-b"
              )}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
                  <Percent className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{rate.name}</p>
                    {rate.isDefault && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px]" variant="outline">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{rate.type}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right mr-1">
                  <p className="font-mono text-sm font-semibold tabular-nums">
                    {(rate.rate / 100).toFixed(2)}%
                  </p>
                </div>

                <Badge variant="outline" className={cn(
                  "capitalize text-[10px] min-w-[58px] justify-center",
                  rate.type === "sales" && "border-blue-200 text-blue-700 bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:bg-blue-950/40",
                  rate.type === "purchase" && "border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-800 dark:text-orange-400 dark:bg-orange-950/40",
                  rate.type === "both" && "border-violet-200 text-violet-700 bg-violet-50 dark:border-violet-800 dark:text-violet-400 dark:bg-violet-950/40"
                )}>
                  {rate.type}
                </Badge>

                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(rate)}>
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            </div>
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
    </div>
  );
}
