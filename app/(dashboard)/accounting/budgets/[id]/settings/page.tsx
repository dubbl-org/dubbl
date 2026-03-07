"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useBudgetContext } from "../layout";
import type { BudgetLineData, BudgetPeriodData } from "../layout";
import { generatePeriods, distributeAmount } from "@/lib/budget-periods";
import type { PeriodType } from "@/lib/budget-periods";

const PERIOD_TYPE_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

interface PeriodInput {
  label: string;
  startDate: string;
  endDate: string;
  amount: number;
  sortOrder: number;
}

interface LineInput {
  id?: string;
  accountId: string;
  total: number;
  periods: PeriodInput[];
}

function buildLineFromBudgetLine(l: BudgetLineData): LineInput {
  return {
    id: l.id,
    accountId: l.accountId,
    total: l.total,
    periods: (l.periods || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => ({
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
        amount: p.amount,
        sortOrder: p.sortOrder,
      })),
  };
}

function emptyLine(periodType: PeriodType, startDate: string, endDate: string): LineInput {
  const periods = generatePeriods(periodType, startDate, endDate).map((p) => ({
    ...p,
    amount: 0,
  }));
  return { accountId: "", total: 0, periods };
}

export default function BudgetSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { budget, accounts, refetch } = useBudgetContext();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [name, setName] = useState(budget.name);
  const [startDate, setStartDate] = useState(budget.startDate);
  const [endDate, setEndDate] = useState(budget.endDate);
  const [periodType, setPeriodType] = useState<PeriodType>(budget.periodType);
  const [lines, setLines] = useState<LineInput[]>(
    budget.lines.map(buildLineFromBudgetLine)
  );
  const [annualAmounts, setAnnualAmounts] = useState<Record<number, string>>({});
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  function handlePeriodTypeChange(newType: PeriodType) {
    setPeriodType(newType);
    // Regenerate periods for all lines
    setLines((prev) =>
      prev.map((line) => {
        const newPeriods = generatePeriods(newType, startDate, endDate);
        const amounts = distributeAmount(line.total, newPeriods.length);
        return {
          ...line,
          periods: newPeriods.map((p, i) => ({ ...p, amount: amounts[i] })),
        };
      })
    );
  }

  function handleDateChange(field: "start" | "end", value: string) {
    const newStart = field === "start" ? value : startDate;
    const newEnd = field === "end" ? value : endDate;
    if (field === "start") setStartDate(value);
    else setEndDate(value);

    // Regenerate periods
    setLines((prev) =>
      prev.map((line) => {
        const newPeriods = generatePeriods(periodType, newStart, newEnd);
        const amounts = distributeAmount(line.total, newPeriods.length);
        return {
          ...line,
          periods: newPeriods.map((p, i) => ({ ...p, amount: amounts[i] })),
        };
      })
    );
  }

  function handleAnnualChange(index: number, value: string) {
    setAnnualAmounts((prev) => ({ ...prev, [index]: value }));
    const cents = Math.round(parseFloat(value || "0") * 100);
    if (cents >= 0) {
      setLines((prev) => {
        const copy = [...prev];
        const line = copy[index];
        const amounts = distributeAmount(cents, line.periods.length);
        copy[index] = {
          ...line,
          total: cents,
          periods: line.periods.map((p, i) => ({ ...p, amount: amounts[i] })),
        };
        return copy;
      });
    }
  }

  function updatePeriodAmount(lineIndex: number, periodIndex: number, value: string) {
    const cents = Math.round(parseFloat(value || "0") * 100);
    setLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[lineIndex] };
      const periods = [...line.periods];
      periods[periodIndex] = { ...periods[periodIndex], amount: cents };
      line.periods = periods;
      line.total = periods.reduce((s, p) => s + p.amount, 0);
      copy[lineIndex] = line;
      return copy;
    });
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[lineIndex];
      return copy;
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
    if (expandedLine === index) setExpandedLine(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length === 0) {
      toast.error("Add at least one budget line with an account.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/budgets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          periodType,
          lines: validLines.map((l) => ({
            accountId: l.accountId,
            total: l.total,
            periods: l.periods,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Budget updated");
      window.dispatchEvent(new Event("budgets-changed"));
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update budget");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!orgId) return;
    const willDeactivate = budget.isActive;
    await confirm({
      title: willDeactivate ? "Deactivate this budget?" : "Reactivate this budget?",
      description: willDeactivate
        ? "Inactive budgets won't appear in reports or dashboards."
        : "This budget will appear in reports again.",
      confirmLabel: willDeactivate ? "Deactivate" : "Reactivate",
      destructive: willDeactivate,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/budgets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-organization-id": orgId },
          body: JSON.stringify({ isActive: !willDeactivate }),
        });
        if (res.ok) {
          toast.success(willDeactivate ? "Budget deactivated" : "Budget reactivated");
          window.dispatchEvent(new Event("budgets-changed"));
          refetch();
        } else {
          toast.error("Failed to update budget");
        }
      },
    });
  }

  async function handleDelete() {
    if (!orgId) return;
    await confirm({
      title: "Delete this budget?",
      description: "This action cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/budgets/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        toast.success("Budget deleted");
        window.dispatchEvent(new Event("budgets-changed"));
        router.push("/accounting/budgets");
      },
    });
  }

  return (
    <>
      <form onSubmit={handleSave} className="space-y-10">
        {/* General */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">General</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Budget name, date range, and period type.</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Budget Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => handleDateChange("start", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => handleDateChange("end", e.target.value)} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period Type</Label>
              <Select value={periodType} onValueChange={(v) => handlePeriodTypeChange(v as PeriodType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Budget Lines */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium">Budget Lines</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Annual amounts per account, distributed across periods.</p>
          </div>
          <div className="min-w-0 space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine(periodType, startDate, endDate)])}>
                <Plus className="mr-2 size-3.5" />Add Line
              </Button>
            </div>

            {lines.map((line, i) => {
              const isExpanded = expandedLine === i;
              return (
                <div key={i} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select
                        value={line.accountId || undefined}
                        onValueChange={(val) => {
                          setLines((prev) => {
                            const copy = [...prev];
                            copy[i] = { ...copy[i], accountId: val };
                            return copy;
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600 shrink-0 p-1">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground shrink-0 w-16">Annual</Label>
                    <CurrencyInput
                      prefix="$"
                      value={annualAmounts[i] ?? (line.total / 100).toFixed(2)}
                      onChange={(v) => handleAnnualChange(i, v)}
                      placeholder="0.00"
                      className="flex-1"
                    />
                    {line.total > 0 && line.periods.length > 0 && (
                      <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                        {formatMoney(Math.floor(line.total / line.periods.length))}/period
                      </span>
                    )}
                  </div>
                  {line.total > 0 && line.periods.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpandedLine(isExpanded ? null : i)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    >
                      {isExpanded ? "Hide period breakdown" : `Customize period amounts (${line.periods.length} periods)`}
                    </button>
                  )}
                  {isExpanded && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {line.periods.map((p, pi) => (
                        <div key={pi} className="space-y-1">
                          <label className="text-[10px] text-muted-foreground pl-0.5">{p.label}</label>
                          <CurrencyInput
                            size="sm"
                            value={(p.amount / 100).toFixed(2)}
                            onChange={(v) => updatePeriodAmount(i, pi, v)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {i < lines.length - 1 && <div className="h-px bg-border" />}
                </div>
              );
            })}

            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No budget lines. Add one to get started.</p>
            )}
          </div>
        </div>

        <div className="h-px bg-border" />

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="mr-2 size-3.5" />Save changes
          </Button>
        </div>

        <div className="h-px bg-border" />

        {/* Danger zone */}
        <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
          <div className="shrink-0">
            <p className="text-sm font-medium text-red-600">Danger zone</p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Irreversible actions.</p>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {budget.isActive ? "Deactivate budget" : "Reactivate budget"}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {budget.isActive
                    ? "Hide from reports and dashboards."
                    : "Make this budget active again."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={handleToggleActive}
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950"
              >
                {budget.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete budget</p>
                <p className="text-[12px] text-muted-foreground">Permanently delete this budget and all its lines.</p>
              </div>
              <Button variant="destructive" size="sm" type="button" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      </form>

      {confirmDialog}
    </>
  );
}
