"use client";

import { useState, useEffect } from "react";
import { Plus, Scale } from "lucide-react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { BlurReveal } from "@/components/ui/blur-reveal";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: string;
  isDefault: boolean;
  isActive: boolean;
}

const columns: Column<TaxRate>[] = [
  { key: "name", header: "Name", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
  {
    key: "rate", header: "Rate", className: "w-24",
    render: (r) => <span className="font-mono text-sm">{(r.rate / 100).toFixed(2)}%</span>,
  },
  {
    key: "type", header: "Type", className: "w-24",
    render: (r) => <Badge variant="outline">{r.type}</Badge>,
  },
  {
    key: "default", header: "Default", className: "w-20",
    render: (r) => r.isDefault ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">Default</Badge> : null,
  },
];

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-1.5 size-3.5" />Add Tax Rate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Tax Rate</DialogTitle></DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST 10%" required /></div>
          <div className="space-y-2"><Label>Rate (%)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10.00" required /></div>
          <div className="space-y-2"><Label>Type</Label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="purchase">Purchase</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Creating..." : "Create"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TaxRatesPage() {
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  function fetchRates() {
    if (!orgId) return;
    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setRates(data.taxRates); })
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchRates(); }, [orgId]);

  const salesCount = rates.filter((r) => r.type === "sales" || r.type === "both").length;
  const purchaseCount = rates.filter((r) => r.type === "purchase" || r.type === "both").length;

  return (
    <BlurReveal className="space-y-10">
      {/* Tax rates section */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Tax rates</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Define tax rates to apply on invoices and bills. Rates can be scoped to sales, purchases, or both.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {rates.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[12px] text-muted-foreground">
                <span>{rates.length} rate{rates.length !== 1 ? "s" : ""}</span>
                <span className="text-border">|</span>
                <span>{salesCount} sales</span>
                <span className="text-border">|</span>
                <span>{purchaseCount} purchase</span>
              </div>
            ) : (
              <div />
            )}
            <CreateTaxRateDialog open={open} setOpen={setOpen} onCreated={fetchRates} orgId={orgId} />
          </div>

          {!loading && rates.length === 0 ? (
            <EmptyState icon={Scale} title="No tax rates" description="Add tax rates to apply taxes on invoices and bills." />
          ) : (
            <DataTable columns={columns} data={rates} loading={loading} emptyMessage="No tax rates found." />
          )}
        </div>
      </section>
    </BlurReveal>
  );
}
