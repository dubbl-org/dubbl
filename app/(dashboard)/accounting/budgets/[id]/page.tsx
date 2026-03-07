"use client";

import { useState, useEffect, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2, Target, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BudgetLineData {
  id: string;
  accountId: string;
  account: Account | null;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
  total: number;
}

interface BudgetData {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  lines: BudgetLineData[];
}

interface Comparison {
  accountId: string;
  accountName: string;
  accountCode: string;
  budgeted: number;
  actual: number;
  variance: number;
  variancePct: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
type MonthKey = typeof MONTHS[number];

interface LineInput {
  id?: string;
  accountId: string;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
}

function lineTotal(line: LineInput): number {
  return MONTHS.reduce((s, m) => s + line[m], 0);
}

function emptyLine(): LineInput {
  return { accountId: "", jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 };
}

function distributeEvenly(annualCents: number): Record<MonthKey, number> {
  const perMonth = Math.floor(annualCents / 12);
  const remainder = annualCents - perMonth * 12;
  const result = {} as Record<MonthKey, number>;
  MONTHS.forEach((m, i) => {
    result[m] = perMonth + (i < remainder ? 1 : 0);
  });
  return result;
}

export default function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [totalBudgeted, setTotalBudgeted] = useState(0);
  const [totalActual, setTotalActual] = useState(0);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineInput[]>([]);
  const [annualAmounts, setAnnualAmounts] = useState<Record<number, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;

    Promise.all([
      fetch(`/api/v1/budgets/${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
      fetch("/api/v1/accounts?limit=500", { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
      fetch(`/api/v1/reports/budget-vs-actual?budgetId=${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()).catch(() => null),
    ])
      .then(([budgetData, accountsData, reportData]) => {
        const b = budgetData.budget;
        if (b) {
          setBudget(b);
          setName(b.name);
          setStartDate(b.startDate);
          setEndDate(b.endDate);
          setIsActive(b.isActive);
          setLines(
            b.lines.map((l: BudgetLineData) => ({
              id: l.id,
              accountId: l.accountId,
              jan: l.jan, feb: l.feb, mar: l.mar, apr: l.apr,
              may: l.may, jun: l.jun, jul: l.jul, aug: l.aug,
              sep: l.sep, oct: l.oct, nov: l.nov, dec: l.dec,
            }))
          );
        }
        setAccounts(accountsData.accounts || []);
        if (reportData) {
          setComparisons(reportData.comparisons || []);
          setTotalBudgeted(reportData.totalBudgeted || 0);
          setTotalActual(reportData.totalActual || 0);
        }
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  function updateLine(index: number, field: string, value: string | number) {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function handleAnnualChange(index: number, value: string) {
    setAnnualAmounts((prev) => ({ ...prev, [index]: value }));
    const cents = Math.round(parseFloat(value || "0") * 100);
    if (cents >= 0) {
      const distributed = distributeEvenly(cents);
      setLines((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], ...distributed };
        return copy;
      });
    }
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });
  }

  async function handleSave() {
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
        body: JSON.stringify({ name, startDate, endDate, isActive, lines: validLines }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      toast.success("Budget updated");
      setEditing(false);
      // Reload
      const [budgetRes, reportRes] = await Promise.all([
        fetch(`/api/v1/budgets/${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
        fetch(`/api/v1/reports/budget-vs-actual?budgetId=${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()).catch(() => null),
      ]);
      if (budgetRes.budget) setBudget(budgetRes.budget);
      if (reportRes) {
        setComparisons(reportRes.comparisons || []);
        setTotalBudgeted(reportRes.totalBudgeted || 0);
        setTotalActual(reportRes.totalActual || 0);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update budget");
    } finally {
      setSaving(false);
    }
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
        router.push("/accounting/budgets");
      },
    });
  }

  if (loading) return <BrandLoader />;

  if (!budget) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Budget not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/accounting/budgets")}>Back to Budgets</Button>
      </div>
    );
  }

  const grandTotal = budget.lines.reduce((s, l) => s + l.total, 0);
  const totalVariance = totalBudgeted - totalActual;
  const overallPct = totalBudgeted > 0 ? Math.round((totalActual / totalBudgeted) * 100) : 0;

  return (
    <ContentReveal>
      {/* Back link */}
      <button
        onClick={() => router.push("/accounting/budgets")}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="size-3.5" />
        Back to budgets
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-500/15">
            <Target className={cn("size-5 text-purple-700 dark:text-purple-300")} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">{budget.name}</h1>
              <Badge variant="outline" className={budget.isActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "text-muted-foreground"
              }>
                {budget.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {budget.startDate} · {budget.endDate}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={handleDelete}>Delete</Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="mr-2 size-3.5" />Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-8">
        <div>
          <p className="text-[11px] text-muted-foreground">Total Budget</p>
          <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <TrendingUp className="size-3 text-blue-500" />
            Actual Spend
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-blue-600">
            {totalActual > 0 ? formatMoney(totalActual) : "-"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            {totalVariance >= 0
              ? <TrendingDown className="size-3 text-emerald-500" />
              : <TrendingUp className="size-3 text-red-500" />
            }
            Variance
          </p>
          <p className={cn(
            "mt-0.5 font-mono text-lg font-semibold tabular-nums",
            totalVariance >= 0 ? "text-emerald-600" : "text-red-600"
          )}>
            {totalBudgeted > 0 ? formatMoney(Math.abs(totalVariance)) : "-"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Utilization</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  overallPct > 100 ? "bg-red-500" : overallPct > 80 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min(overallPct, 100)}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">{overallPct}%</span>
          </div>
        </div>
      </div>

      {editing ? (
        /* Edit mode */
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Budget Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Budget Lines</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="mr-2 size-3.5" />Add Line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, i) => {
              const total = lineTotal(line);
              return (
                <div key={i} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={line.accountId}
                        onChange={(e) => updateLine(i, "accountId", e.target.value)}
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-40">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Annual amount"
                        value={annualAmounts[i] ?? (total / 100).toFixed(2)}
                        onChange={(e) => handleAnnualChange(i, e.target.value)}
                        className="font-mono text-right"
                      />
                    </div>
                    <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600 shrink-0">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Distributed evenly: {formatMoney(Math.floor(total / 12))}/mo</span>
                    <span className="font-mono font-medium text-foreground">Total: {formatMoney(total)}</span>
                  </div>
                </div>
              );
            })}
            {lines.length === 0 && (
              <div className="rounded-xl border border-dashed py-8 text-center">
                <p className="text-sm text-muted-foreground">No budget lines. Add one to get started.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* View mode */
        <div className="space-y-6">
          {/* Per-account breakdown */}
          {comparisons.length > 0 ? (
            <div className="space-y-3">
              {comparisons.map((c) => {
                const pct = c.budgeted === 0 ? 0 : Math.round((c.actual / c.budgeted) * 100);
                const over = c.actual > c.budgeted;
                return (
                  <div key={c.accountId} className="rounded-lg border p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.accountName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.accountCode}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-sm font-mono font-semibold tabular-nums">
                          {formatMoney(c.actual)} <span className="text-muted-foreground font-normal">/ {formatMoney(c.budgeted)}</span>
                        </p>
                        <p className={cn(
                          "text-xs font-mono tabular-nums",
                          over ? "text-red-600" : "text-emerald-600"
                        )}>
                          {over ? "Over by " : "Under by "}{formatMoney(Math.abs(c.variance))}
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{pct}% utilized</span>
                      <span className="font-mono tabular-nums">{formatMoney(c.budgeted - c.actual)} remaining</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : budget.lines.length > 0 ? (
            <div className="space-y-3">
              {budget.lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {line.account ? line.account.name : line.accountId}
                    </p>
                    {line.account && (
                      <p className="text-xs text-muted-foreground font-mono">{line.account.code}</p>
                    )}
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums shrink-0 ml-4">
                    {formatMoney(line.total)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No budget lines configured.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>Add lines</Button>
            </div>
          )}
        </div>
      )}
      {confirmDialog}
    </ContentReveal>
  );
}
