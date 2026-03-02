"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BudgetLineInput {
  accountId: string;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function emptyLine(): BudgetLineInput {
  return { accountId: "", jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 };
}

function lineTotal(line: BudgetLineInput): number {
  return MONTHS.reduce((s, m) => s + line[m], 0);
}

export default function NewBudgetPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [lines, setLines] = useState<BudgetLineInput[]>([emptyLine()]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/accounts?limit=500", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.data || []);
      });
  }, []);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length === 0) {
      setError("Add at least one budget line with an account.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          lines: validLines,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create budget");
        return;
      }

      router.push("/budgets");
    } catch {
      setError("Failed to create budget");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New Budget" description="Create a new budget with monthly allocations." />

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="name">Budget Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY 2026 Operating Budget" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-4">
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

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/budgets")}>Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="mr-2 size-4" />{saving ? "Saving..." : "Create Budget"}
          </Button>
        </div>
      </form>
    </div>
  );
}
