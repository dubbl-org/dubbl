"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2, Target, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());
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

  function updateMonthValue(index: number, month: MonthKey, value: string) {
    const cents = Math.round(parseFloat(value || "0") * 100);
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [month]: cents };
      return copy;
    });
    // Clear annual amount so it recalculates from months
    setAnnualAmounts((prev) => {
      const copy = { ...prev };
      delete copy[index];
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
  }

  function toggleExpand(index: number) {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
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
      setExpandedLines(new Set());
      const [budgetRes, reportRes] = await Promise.all([
        fetch(`/api/v1/budgets/${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()),
        fetch(`/api/v1/reports/budget-vs-actual?budgetId=${id}`, { headers: { "x-organization-id": orgId } }).then((r) => r.json()).catch(() => null),
      ]);
      if (budgetRes.budget) {
        setBudget(budgetRes.budget);
        setLines(
          budgetRes.budget.lines.map((l: BudgetLineData) => ({
            id: l.id, accountId: l.accountId,
            jan: l.jan, feb: l.feb, mar: l.mar, apr: l.apr,
            may: l.may, jun: l.jun, jul: l.jul, aug: l.aug,
            sep: l.sep, oct: l.oct, nov: l.nov, dec: l.dec,
          }))
        );
      }
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
            <Target className="size-5 text-purple-700 dark:text-purple-300" />
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
              {budget.startDate} · {budget.endDate} · {budget.lines.length} line{budget.lines.length !== 1 ? "s" : ""}
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
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setExpandedLines(new Set()); }}>Cancel</Button>
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

          <div className="space-y-4">
            {lines.map((line, i) => {
              const total = lineTotal(line);
              const expanded = expandedLines.has(i);
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
                      value={annualAmounts[i] ?? (total / 100).toFixed(2)}
                      onChange={(v) => handleAnnualChange(i, v)}
                      placeholder="0.00"
                      className="flex-1"
                    />
                    {total > 0 && (
                      <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                        {formatMoney(Math.floor(total / 12))}/mo
                      </span>
                    )}
                  </div>
                  {total > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(i)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    >
                      {expanded ? "Hide monthly breakdown" : "Customize monthly amounts"}
                    </button>
                  )}
                  {expanded && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {MONTHS.map((m, mi) => (
                        <div key={m} className="space-y-1">
                          <label className="text-[10px] text-muted-foreground pl-0.5">{MONTH_LABELS[mi]}</label>
                          <CurrencyInput
                            size="sm"
                            value={(line[m] / 100).toFixed(2)}
                            onChange={(v) => updateMonthValue(i, m, v)}
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
              <div className="rounded-xl border border-dashed py-8 text-center">
                <p className="text-sm text-muted-foreground">No budget lines. Add one to get started.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* View mode */
        <div className="space-y-6">
          {comparisons.length > 0 ? (
            <div className="space-y-3">
              {comparisons.map((c) => {
                const pct = c.budgeted === 0 ? 0 : Math.round((c.actual / c.budgeted) * 100);
                const over = c.actual > c.budgeted;
                const budgetLine = budget.lines.find((l) => l.accountId === c.accountId);
                return (
                  <ViewLineCard
                    key={c.accountId}
                    accountName={c.accountName}
                    accountCode={c.accountCode}
                    budgeted={c.budgeted}
                    actual={c.actual}
                    variance={c.variance}
                    pct={pct}
                    over={over}
                    budgetLine={budgetLine}
                  />
                );
              })}
            </div>
          ) : budget.lines.length > 0 ? (
            <div className="space-y-3">
              {budget.lines.map((line) => (
                <ViewLineCard
                  key={line.id}
                  accountName={line.account?.name || line.accountId}
                  accountCode={line.account?.code || ""}
                  budgeted={line.total}
                  actual={0}
                  variance={line.total}
                  pct={0}
                  over={false}
                  budgetLine={line}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No budget lines configured.</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditing(true)}>Add lines</Button>
            </div>
          )}

          {/* Monthly totals summary */}
          {budget.lines.length > 0 && (
            <>
              <div className="h-px bg-border" />
              <div>
                <p className="text-sm font-medium mb-3">Monthly Plan</p>
                <div className="grid grid-cols-6 sm:grid-cols-12 gap-x-4 gap-y-1 text-xs">
                  {MONTHS.map((m, mi) => {
                    const monthTotal = budget.lines.reduce((s, l) => s + l[m], 0);
                    return (
                      <div key={m} className="text-center py-1.5">
                        <p className="text-[10px] text-muted-foreground">{MONTH_LABELS[mi]}</p>
                        <p className="font-mono text-xs font-semibold tabular-nums mt-0.5">{formatMoney(monthTotal)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Grand total */}
          {grandTotal > 0 && (
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-sm font-medium">Grand Total</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
            </div>
          )}
        </div>
      )}
      {confirmDialog}
    </ContentReveal>
  );
}

function ViewLineCard({
  accountName,
  accountCode,
  budgeted,
  actual,
  variance,
  pct,
  over,
  budgetLine,
}: {
  accountName: string;
  accountCode: string;
  budgeted: number;
  actual: number;
  variance: number;
  pct: number;
  over: boolean;
  budgetLine?: BudgetLineData;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border px-4 py-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{accountName}</p>
            {accountCode && <span className="text-xs text-muted-foreground font-mono">{accountCode}</span>}
          </div>
        </div>
        <div className="text-right shrink-0 ml-4">
          <p className="text-sm font-mono font-semibold tabular-nums">
            {actual > 0 ? (
              <>{formatMoney(actual)} <span className="text-muted-foreground font-normal">/ {formatMoney(budgeted)}</span></>
            ) : (
              formatMoney(budgeted)
            )}
          </p>
          {actual > 0 && (
            <p className={cn(
              "text-xs font-mono tabular-nums",
              over ? "text-red-600" : "text-emerald-600"
            )}>
              {over ? "Over by " : "Under by "}{formatMoney(Math.abs(variance))}
            </p>
          )}
        </div>
      </div>
      {actual > 0 && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          {actual > 0 && <span>{pct}% utilized</span>}
          {actual > 0 && <span className="font-mono tabular-nums">{formatMoney(budgeted - actual)} remaining</span>}
          {actual === 0 && <span>No spending recorded yet</span>}
        </div>
        {budgetLine && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Months
          </button>
        )}
      </div>
      {expanded && budgetLine && (
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-x-4 gap-y-1 pt-1 text-[11px]">
          {MONTHS.map((m, mi) => (
            <div key={m} className="flex items-center justify-between sm:flex-col sm:items-center">
              <span className="text-muted-foreground">{MONTH_LABELS[mi]}</span>
              <span className="font-mono tabular-nums">{formatMoney(budgetLine[m])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
