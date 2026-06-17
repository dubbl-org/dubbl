"use client";

import { useState, useEffect } from "react";
import { Plus, Scale, Percent, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
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

interface TaxComponent {
  id?: string;
  name: string;
  rate: number;
  accountId?: string | null;
}

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  type: string;
  kind: string;
  recoverablePercent: number;
  isDefault: boolean;
  isActive: boolean;
  components?: TaxComponent[];
}

// Plain-language labels — the user is not an accountant. Each maps to the
// taxRateKindEnum value persisted on the server.
const KIND_OPTIONS: { value: string; label: string; help: string }[] = [
  { value: "standard", label: "Standard (fully reclaimable)", help: "Normal VAT/GST you can claim back in full." },
  { value: "partial_block", label: "Partly reclaimable", help: "You can only claim back part of the tax (set the % below)." },
  { value: "blocked", label: "Not reclaimable", help: "Tax cannot be claimed back — it's absorbed into the cost." },
  { value: "reverse_charge", label: "Reverse charge", help: "You account for both sides of the tax yourself (cross-border / domestic reverse charge)." },
  { value: "exempt", label: "Exempt", help: "Exempt supply — no tax charged and none reclaimable." },
  { value: "no_vat", label: "No tax", help: "Outside the scope of VAT/GST." },
  { value: "sales_tax_us", label: "US sales tax", help: "US sales/use tax — charged on sales, not reclaimable on purchases." },
];

// recoverablePercent only matters for these kinds; for everything else it is
// implied (100% standard, 0% blocked/exempt, etc.).
const RECOVERABLE_KINDS = new Set(["standard", "partial_block"]);

const TYPE_COLORS = {
  sales: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-400",
    bar: "bg-blue-500",
    icon: "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400",
  },
  purchase: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-200 dark:border-orange-800",
    text: "text-orange-700 dark:text-orange-400",
    bar: "bg-orange-500",
    icon: "bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400",
  },
  both: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    bar: "bg-emerald-500",
    icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
  },
} as const;

// Compound-tax editor: lets the user split a rate into named sub-components
// (e.g. GST + PST), each with its own % and optional ledger account.
function ComponentsEditor({ components, setComponents }: { components: TaxComponent[]; setComponents: (c: TaxComponent[]) => void }) {
  function update(i: number, patch: Partial<TaxComponent>) {
    setComponents(components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    setComponents(components.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Compound parts (optional)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setComponents([...components, { name: "", rate: 0, accountId: null }])}
        >
          <Plus className="mr-1 size-3" />Add part
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Split this tax into separate parts (for example GST and PST) when each part needs its own rate or ledger account.
      </p>
      {components.length > 0 && (
        <div className="space-y-3 rounded-md border p-3">
          {components.map((c, i) => (
            <div key={i} className="space-y-2 rounded-md bg-muted/30 p-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Part name</Label>
                  <Input value={c.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="e.g. PST" />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={c.rate === 0 ? "" : (c.rate / 100).toString()}
                    onChange={(e) => update(i, { rate: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
                    placeholder="0.00"
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-9 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Posts to account (optional)</Label>
                <AccountPicker value={c.accountId ?? ""} onChange={(id) => update(i, { accountId: id || null })} placeholder="Default tax account" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared editable fields for both the create and edit sheets.
function TaxRateFormFields({
  name, setName, rate, setRate, type, setType, kind, setKind,
  recoverable, setRecoverable, components, setComponents,
}: {
  name: string; setName: (v: string) => void;
  rate: string; setRate: (v: string) => void;
  type: string; setType: (v: string) => void;
  kind: string; setKind: (v: string) => void;
  recoverable: string; setRecoverable: (v: string) => void;
  components: TaxComponent[]; setComponents: (c: TaxComponent[]) => void;
}) {
  const kindHelp = KIND_OPTIONS.find((k) => k.value === kind)?.help;
  return (
    <>
      <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GST 10%" required /></div>
      <div className="space-y-2"><Label>Rate (%)</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="10.00" required /></div>
      <div className="space-y-2"><Label>Applies to</Label>
        <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="purchase">Purchase</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Tax treatment</Label>
        <Select value={kind} onValueChange={setKind}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
          </SelectContent>
        </Select>
        {kindHelp && <p className="text-xs text-muted-foreground">{kindHelp}</p>}
      </div>
      {RECOVERABLE_KINDS.has(kind) && (
        <div className="space-y-2">
          <Label>Reclaimable amount (%)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={recoverable}
            onChange={(e) => setRecoverable(e.target.value)}
            placeholder="100"
          />
          <p className="text-xs text-muted-foreground">How much of the tax on purchases you can claim back. 100 = all of it, 50 = half.</p>
        </div>
      )}
      <ComponentsEditor components={components} setComponents={setComponents} />
    </>
  );
}

// Build the request body shared by create/edit. recoverablePercent defaults to
// 100% (standard) or 0% (everything else) when the field is hidden.
function buildPayload(opts: {
  name: string; rate: string; type: string; kind: string; recoverable: string; components: TaxComponent[];
}) {
  const recoverablePercent = RECOVERABLE_KINDS.has(opts.kind)
    ? Math.max(0, Math.min(10000, Math.round((parseFloat(opts.recoverable) || 0) * 100)))
    : opts.kind === "standard"
      ? 10000
      : 0;
  return {
    name: opts.name,
    rate: Math.round(parseFloat(opts.rate) * 100),
    type: opts.type,
    kind: opts.kind,
    recoverablePercent,
    components: opts.components
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name.trim(), rate: c.rate, accountId: c.accountId || null })),
  };
}

function CreateTaxRateDialog({ open, setOpen, onCreated, orgId }: { open: boolean; setOpen: (v: boolean) => void; onCreated: () => void; orgId: string | null }) {
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [type, setType] = useState("both");
  const [kind, setKind] = useState("standard");
  const [recoverable, setRecoverable] = useState("100");
  const [components, setComponents] = useState<TaxComponent[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(buildPayload({ name, rate, type, kind, recoverable, components })),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tax rate created");
      setOpen(false);
      setName("");
      setRate("");
      setType("both");
      setKind("standard");
      setRecoverable("100");
      setComponents([]);
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
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle>New Tax Rate</SheetTitle></SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4 pb-6">
          <TaxRateFormFields
            name={name} setName={setName}
            rate={rate} setRate={setRate}
            type={type} setType={setType}
            kind={kind} setKind={setKind}
            recoverable={recoverable} setRecoverable={setRecoverable}
            components={components} setComponents={setComponents}
          />
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
  const [editKind, setEditKind] = useState("standard");
  const [editRecoverable, setEditRecoverable] = useState("100");
  const [editComponents, setEditComponents] = useState<TaxComponent[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  useDocumentTitle("Tax · Tax Rates");

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
  const maxRate = Math.max(...rates.map((r) => r.rate), 1);

  function openEdit(rate: TaxRate) {
    setEditing(rate);
    setEditName(rate.name);
    setEditRate((rate.rate / 100).toFixed(2));
    setEditType(rate.type);
    setEditKind(rate.kind || "standard");
    setEditRecoverable(((rate.recoverablePercent ?? 10000) / 100).toString());
    setEditComponents(
      (rate.components ?? []).map((c) => ({ id: c.id, name: c.name, rate: c.rate, accountId: c.accountId ?? null }))
    );
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !editing) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/v1/tax-rates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(buildPayload({ name: editName, rate: editRate, type: editType, kind: editKind, recoverable: editRecoverable, components: editComponents })),
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

      {/* Summary KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Rates</p>
            <Scale className="size-4 text-muted-foreground/50" />
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">{rates.length}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-950/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-blue-700/70 dark:text-blue-400/70">Sales Rates</p>
            <div className="size-4 rounded bg-blue-500/20 flex items-center justify-center">
              <div className="size-1.5 rounded-full bg-blue-500" />
            </div>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-300">{salesCount}</p>
          <p className="text-[11px] text-blue-600/60 dark:text-blue-400/60 mt-0.5">Applied on invoices</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-950/20 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-orange-700/70 dark:text-orange-400/70">Purchase Rates</p>
            <div className="size-4 rounded bg-orange-500/20 flex items-center justify-center">
              <div className="size-1.5 rounded-full bg-orange-500" />
            </div>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-orange-700 dark:text-orange-300">{purchaseCount}</p>
          <p className="text-[11px] text-orange-600/60 dark:text-orange-400/60 mt-0.5">Applied on bills</p>
        </div>
      </div>

      {/* Rate list */}
      {loading ? (
        <BrandLoader className="h-48" />
      ) : rates.length === 0 ? (
        <EmptyState icon={Scale} title="No tax rates" description="Add tax rates to apply taxes on invoices and bills." />
      ) : (
        <div className="space-y-2.5">
          {rates.map((rate) => {
            const colors = TYPE_COLORS[rate.type as keyof typeof TYPE_COLORS] || TYPE_COLORS.both;
            const barPct = (rate.rate / maxRate) * 100;
            return (
              <div
                key={rate.id}
                className="group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/20"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("flex size-10 items-center justify-center rounded-xl", colors.icon)}>
                      <Percent className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{rate.name}</p>
                        {rate.isDefault && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px]" variant="outline">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{rate.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn("font-mono text-lg font-bold tabular-nums", colors.text)}>
                        {(rate.rate / 100).toFixed(2)}%
                      </p>
                    </div>
                    <Badge variant="outline" className={cn(
                      "capitalize text-[10px] min-w-[58px] justify-center",
                      colors.bg, colors.border, colors.text
                    )}>
                      {rate.type}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => openEdit(rate)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", colors.bar)}
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Tax Rate</SheetTitle></SheetHeader>
          <form onSubmit={handleEdit} className="space-y-4 px-4">
            <TaxRateFormFields
              name={editName} setName={setEditName}
              rate={editRate} setRate={setEditRate}
              type={editType} setType={setEditType}
              kind={editKind} setKind={setEditKind}
              recoverable={editRecoverable} setRecoverable={setEditRecoverable}
              components={editComponents} setComponents={setEditComponents}
            />
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
