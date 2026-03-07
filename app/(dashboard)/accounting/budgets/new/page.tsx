"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
type MonthKey = typeof MONTHS[number];

interface BudgetLineInput {
  accountId: string;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
}

function emptyLine(): BudgetLineInput {
  return { accountId: "", jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 };
}

function lineTotal(line: BudgetLineInput): number {
  return MONTHS.reduce((s, m) => s + line[m], 0);
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

export default function NewBudgetPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(`${new Date().getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [lines, setLines] = useState<BudgetLineInput[]>([emptyLine()]);
  const [annualAmounts, setAnnualAmounts] = useState<Record<number, string>>({});
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/accounts?limit=500", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || []);
      });
  }, []);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length === 0) {
      toast.error("Add at least one budget line with an account.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/v1/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name, startDate, endDate, lines: validLines }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Budget created");
      router.push("/accounting/budgets");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create budget");
    } finally {
      setSaving(false);
    }
  }

  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

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

      <h1 className="text-base sm:text-lg font-semibold tracking-tight mb-6">New Budget</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Budget Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY 2026 Operating Budget" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
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
                      value={annualAmounts[i] ?? (total > 0 ? (total / 100).toFixed(2) : "")}
                      onChange={(e) => handleAnnualChange(i, e.target.value)}
                      className="font-mono text-right"
                    />
                  </div>
                  <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-red-600 shrink-0">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {total > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Distributed evenly: {formatMoney(Math.floor(total / 12))}/mo</span>
                    <span className="font-mono font-medium text-foreground">Total: {formatMoney(total)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {grandTotal > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-sm font-medium">Grand Total</p>
            <p className="font-mono text-lg font-semibold tabular-nums">{formatMoney(grandTotal)}</p>
          </div>
        )}

        <div className="h-px bg-border" />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.push("/accounting/budgets")}>Cancel</Button>
          <Button type="submit" loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="mr-2 size-3.5" />Create Budget
          </Button>
        </div>
      </form>
    </ContentReveal>
  );
}
