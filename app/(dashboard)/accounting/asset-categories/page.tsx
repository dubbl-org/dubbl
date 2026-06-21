"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Layers, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { formatMoney, parseMoney } from "@/lib/money";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

// ── Types ──────────────────────────────────────────────────────────────────
interface AssetCategory {
  id: string;
  name: string;
  defaultDepreciationMethod: string;
  defaultConvention: string;
  defaultUsefulLifeMonths: number | null;
  defaultResidualValue: number; // cents
  defaultDepreciationRateBp: number | null;
  assetAccountId: string | null;
  depreciationAccountId: string | null;
  accumulatedDepAccountId: string | null;
  cwipAccountId: string | null;
  isActive: boolean;
}

// ── Plain-language option labels (end users aren't accountants) ──────────────
const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "straight_line", label: "Even amount each period (straight line)" },
  { value: "declining_balance", label: "Faster early on (declining balance)" },
  { value: "units_of_production", label: "Based on usage (units of production)" },
  { value: "sum_of_years_digits", label: "Front-loaded (sum of years' digits)" },
];

const CONVENTION_OPTIONS: { value: string; label: string }[] = [
  { value: "full_month", label: "Start of the purchase month" },
  { value: "mid_month", label: "Middle of the purchase month" },
  { value: "half_year", label: "Half a year in the first year" },
  { value: "mid_quarter", label: "Middle of the purchase quarter" },
  { value: "pro_rata_days", label: "Day-by-day from purchase" },
  { value: "full_at_purchase", label: "All from the purchase date" },
];

function methodShort(value: string): string {
  switch (value) {
    case "straight_line":
      return "Straight line";
    case "declining_balance":
      return "Declining balance";
    case "units_of_production":
      return "Units of production";
    case "sum_of_years_digits":
      return "Sum of years' digits";
    default:
      return value;
  }
}

// ── Form state ───────────────────────────────────────────────────────────────
interface FormState {
  name: string;
  defaultDepreciationMethod: string;
  defaultConvention: string;
  usefulLifeMonths: string; // raw input
  residualValue: string; // raw input (major units)
  depreciationRatePct: string; // raw input (percent)
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepAccountId: string;
  cwipAccountId: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  defaultDepreciationMethod: "straight_line",
  defaultConvention: "full_month",
  usefulLifeMonths: "",
  residualValue: "",
  depreciationRatePct: "",
  assetAccountId: "",
  depreciationAccountId: "",
  accumulatedDepAccountId: "",
  cwipAccountId: "",
  isActive: true,
};

function categoryToForm(c: AssetCategory): FormState {
  return {
    name: c.name,
    defaultDepreciationMethod: c.defaultDepreciationMethod,
    defaultConvention: c.defaultConvention,
    usefulLifeMonths:
      c.defaultUsefulLifeMonths != null ? String(c.defaultUsefulLifeMonths) : "",
    residualValue: c.defaultResidualValue ? String(c.defaultResidualValue / 100) : "",
    depreciationRatePct:
      c.defaultDepreciationRateBp != null
        ? String(c.defaultDepreciationRateBp / 100)
        : "",
    assetAccountId: c.assetAccountId || "",
    depreciationAccountId: c.depreciationAccountId || "",
    accumulatedDepAccountId: c.accumulatedDepAccountId || "",
    cwipAccountId: c.cwipAccountId || "",
    isActive: c.isActive,
  };
}

export default function AssetCategoriesPage() {
  useDocumentTitle("Accounting · Asset Categories");

  const orgId =
    typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refetching, setRefetching] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!orgId) return;
    setRefetching(true);
    fetch(`/api/v1/asset-categories?limit=200`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setCategories(data.data || []);
      })
      .finally(() => {
        setInitialLoad(false);
        setRefetching(false);
      });
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((c: AssetCategory) => {
    setEditingId(c.id);
    setForm(categoryToForm(c));
    setError(null);
    setDialogOpen(true);
  }, []);

  const isDeclining = form.defaultDepreciationMethod === "declining_balance";

  const handleSave = useCallback(async () => {
    if (!orgId) return;
    if (!form.name.trim()) {
      setError("Please give this template a name.");
      return;
    }
    setSaving(true);
    setError(null);

    const usefulLife = form.usefulLifeMonths.trim()
      ? parseInt(form.usefulLifeMonths, 10)
      : null;
    const ratePct = form.depreciationRatePct.trim()
      ? parseFloat(form.depreciationRatePct)
      : null;

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      defaultDepreciationMethod: form.defaultDepreciationMethod,
      defaultConvention: form.defaultConvention,
      defaultUsefulLifeMonths:
        usefulLife != null && !Number.isNaN(usefulLife) ? usefulLife : null,
      defaultResidualValue: form.residualValue.trim()
        ? parseMoney(form.residualValue)
        : 0,
      defaultDepreciationRateBp:
        ratePct != null && !Number.isNaN(ratePct)
          ? Math.round(ratePct * 100)
          : null,
      assetAccountId: form.assetAccountId || null,
      depreciationAccountId: form.depreciationAccountId || null,
      accumulatedDepAccountId: form.accumulatedDepAccountId || null,
      cwipAccountId: form.cwipAccountId || null,
      isActive: form.isActive,
    };

    const url = editingId
      ? `/api/v1/asset-categories/${editingId}`
      : `/api/v1/asset-categories`;
    const method = editingId ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Could not save the template. Please try again.");
        return;
      }
      setDialogOpen(false);
      load();
    } catch {
      setError("Could not save the template. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [orgId, form, editingId, load]);

  const columns: Column<AssetCategory>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <span className="text-sm font-medium">{r.name}</span>
      ),
    },
    {
      key: "method",
      header: "How it loses value",
      render: (r) => (
        <span className="text-sm">{methodShort(r.defaultDepreciationMethod)}</span>
      ),
    },
    {
      key: "life",
      header: "Lifespan",
      className: "w-32",
      render: (r) => (
        <span className="text-sm">
          {r.defaultUsefulLifeMonths != null
            ? `${r.defaultUsefulLifeMonths} mo`
            : "—"}
        </span>
      ),
    },
    {
      key: "residual",
      header: "Leftover value",
      className: "w-32 text-right",
      render: (r) => (
        <span className="font-mono text-sm tabular-nums">
          {r.defaultResidualValue ? formatMoney(r.defaultResidualValue) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-24",
      render: (r) =>
        r.isActive ? (
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          >
            active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            inactive
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-16 text-right",
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            openEdit(r);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
      ),
    },
  ];

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Asset Categories</h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg">
            Reusable templates for how your equipment, vehicles, and other assets
            lose value over time. Pick one when you add an asset to fill in the
            defaults automatically.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
        >
          <Plus className="mr-2 size-4" />
          New Category
        </Button>
      </div>

      <div className="h-px bg-border" />

      {refetching ? (
        <BrandLoader className="h-48" />
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Layers className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No categories yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Create a template once and reuse it every time you add a similar
              asset.
            </p>
          </div>
          <Button onClick={openCreate} variant="outline" size="sm">
            <Plus className="mr-2 size-4" />
            New Category
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={categories}
          loading={false}
          emptyMessage="No categories yet."
          onRowClick={(r) => openEdit(r)}
        />
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit category" : "New category"}
            </DialogTitle>
            <DialogDescription>
              Set the defaults that will be applied to every asset using this
              template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ac-name">Name</Label>
              <Input
                id="ac-name"
                placeholder="e.g. Computers & laptops"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Method + convention */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>How it loses value</Label>
                <Select
                  value={form.defaultDepreciationMethod}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, defaultDepreciationMethod: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>When it starts counting</Label>
                <Select
                  value={form.defaultConvention}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, defaultConvention: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONVENTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Life + residual + rate */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ac-life">Lifespan (months)</Label>
                <Input
                  id="ac-life"
                  type="number"
                  min={1}
                  placeholder="e.g. 36"
                  value={form.usefulLifeMonths}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  How long you expect the asset to be useful.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ac-residual">Leftover value</Label>
                <Input
                  id="ac-residual"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={form.residualValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, residualValue: e.target.value }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  What it&apos;s worth at the end of its life.
                </p>
              </div>
            </div>

            {isDeclining && (
              <div className="space-y-1.5">
                <Label htmlFor="ac-rate">Yearly rate (%)</Label>
                <Input
                  id="ac-rate"
                  type="number"
                  min={0}
                  max={1000}
                  step="0.01"
                  placeholder="e.g. 20"
                  value={form.depreciationRatePct}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, depreciationRatePct: e.target.value }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Percentage of the remaining value written off each year.
                </p>
              </div>
            )}

            {/* Account pickers */}
            <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Where it&apos;s tracked in your books
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Asset account</Label>
                  <AccountPicker
                    value={form.assetAccountId}
                    onChange={(id) =>
                      setForm((f) => ({ ...f, assetAccountId: id }))
                    }
                    typeFilter={["asset"]}
                    placeholder="Select account..."
                    allowCreate
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Depreciation expense account</Label>
                  <AccountPicker
                    value={form.depreciationAccountId}
                    onChange={(id) =>
                      setForm((f) => ({ ...f, depreciationAccountId: id }))
                    }
                    typeFilter={["expense"]}
                    placeholder="Select account..."
                    allowCreate
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Accumulated depreciation account</Label>
                  <AccountPicker
                    value={form.accumulatedDepAccountId}
                    onChange={(id) =>
                      setForm((f) => ({ ...f, accumulatedDepAccountId: id }))
                    }
                    typeFilter={["asset"]}
                    placeholder="Select account..."
                    allowCreate
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Work-in-progress account</Label>
                  <AccountPicker
                    value={form.cwipAccountId}
                    onChange={(id) =>
                      setForm((f) => ({ ...f, cwipAccountId: id }))
                    }
                    typeFilter={["asset"]}
                    placeholder="Select account..."
                    allowCreate
                  />
                  <p className="text-[11px] text-muted-foreground">
                    For assets still being built or installed.
                  </p>
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="ac-active">Available for new assets</Label>
                <p className="text-[11px] text-muted-foreground">
                  Turn off to hide this template without deleting it.
                </p>
              </div>
              <Switch
                id="ac-active"
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v }))
                }
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editingId ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
