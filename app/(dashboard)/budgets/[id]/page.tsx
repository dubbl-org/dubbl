"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { BudgetProgressBar } from "@/components/dashboard/budget-progress-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

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

export default function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [lines, setLines] = useState<LineInput[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    Promise.all([
      fetch(`/api/v1/budgets/${id}`, {
        headers: { "x-organization-id": orgId },
      }).then((r) => r.json()),
      fetch("/api/v1/accounts?limit=500", {
        headers: { "x-organization-id": orgId },
      }).then((r) => r.json()),
    ])
      .then(([budgetData, accountsData]) => {
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
        setAccounts(accountsData.data || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function updateLine(index: number, field: string, value: string | number) {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function updateMonthCents(index: number, month: string, value: string) {
    const cents = Math.round(parseFloat(value || "0") * 100);
    updateLine(index, month, cents);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError("");
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length === 0) {
      setError("At least one budget line with an account is required.");
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
          isActive,
          lines: validLines,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to update budget");
        return;
      }

      setEditing(false);
      // Reload
      const budgetRes = await fetch(`/api/v1/budgets/${id}`, {
        headers: { "x-organization-id": orgId },
      });
      const budgetData = await budgetRes.json();
      if (budgetData.budget) {
        setBudget(budgetData.budget);
      }
    } catch {
      setError("Failed to update budget");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this budget?")) return;
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    await fetch(`/api/v1/budgets/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    router.push("/budgets");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading..." />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="space-y-6">
        <PageHeader title="Budget not found" />
        <Button variant="outline" onClick={() => router.push("/budgets")}>
          <ArrowLeft className="mr-2 size-4" />Back to Budgets
        </Button>
      </div>
    );
  }

  const grandTotal = budget.lines.reduce((s, l) => s + l.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={editing ? "Edit Budget" : budget.name}
        description={editing ? "Modify budget allocations." : `${budget.startDate} to ${budget.endDate}`}
      >
        <div className="flex items-center gap-2">
          {!editing && (
            <>
              <Badge variant="outline" className={budget.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>
                {budget.isActive ? "Active" : "Inactive"}
              </Badge>
              <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={handleDelete}>Delete</Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="mr-2 size-4" />{saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {editing ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Budget Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Budget Lines</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus className="mr-2 size-4" />Add Line
            </Button>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-medium w-48">Account</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium w-20">{m}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium w-24">Total</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-2">
                      <select
                        className="h-8 w-full rounded border bg-background px-2 text-sm"
                        value={line.accountId}
                        onChange={(e) => updateLine(i, "accountId", e.target.value)}
                      >
                        <option value="">Select account...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                    </td>
                    {MONTHS.map((m) => (
                      <td key={m} className="px-1 py-2">
                        <input
                          type="number"
                          step="0.01"
                          className="h-8 w-full rounded border bg-background px-2 text-right text-sm font-mono tabular-nums"
                          value={(line[m] / 100).toFixed(2)}
                          onChange={(e) => updateMonthCents(i, m, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-medium">
                      ${(lineTotal(line) / 100).toFixed(2)}
                    </td>
                    <td className="px-2 py-2">
                      <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground mb-1">Total Budget</p>
            <p className="text-2xl font-bold font-mono tabular-nums">{formatMoney(grandTotal)}</p>
          </div>

          {budget.lines.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {budget.lines.map((line) => (
                <div key={line.id} className="rounded-lg border bg-card p-4">
                  <BudgetProgressBar
                    budgeted={line.total}
                    actual={0}
                    label={line.account ? `${line.account.code} - ${line.account.name}` : line.accountId}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  {MONTH_LABELS.map((m) => (
                    <th key={m} className="px-2 py-2 text-right font-medium w-20">{m}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium w-24">Total</th>
                </tr>
              </thead>
              <tbody>
                {budget.lines.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="px-3 py-2 font-medium">
                      {line.account ? `${line.account.code} - ${line.account.name}` : line.accountId}
                    </td>
                    {MONTHS.map((m) => (
                      <td key={m} className="px-2 py-2 text-right font-mono tabular-nums">
                        {formatMoney(line[m as MonthKey])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                      {formatMoney(line.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50">
                  <td className="px-3 py-2 font-semibold">Total</td>
                  {MONTHS.map((m) => {
                    const monthTotal = budget.lines.reduce((s, l) => s + l[m as MonthKey], 0);
                    return (
                      <td key={m} className="px-2 py-2 text-right font-mono tabular-nums font-semibold">
                        {formatMoney(monthTotal)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-mono tabular-nums font-bold">
                    {formatMoney(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
