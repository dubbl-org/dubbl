"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";

interface Projection {
  month: string;
  gross: number;
  tax: number;
  net: number;
  headcount: number;
}

interface WhatIfResult {
  current: { monthlyGross: number; projectedTotal: number; headcount: number };
  projected: { monthlyGross: number; projectedTotal: number; headcount: number };
  difference: { monthlyGross: number; projectedTotal: number };
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function ForecastingPage() {
  const [projection, setProjection] = useState<Projection[]>([]);
  const [loading, setLoading] = useState(true);
  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // What-if form
  const [salaryAdj, setSalaryAdj] = useState("0");
  const [newHires, setNewHires] = useState("0");
  const [avgHireSalary, setAvgHireSalary] = useState("60000");
  const [terminations, setTerminations] = useState("0");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch("/api/v1/payroll/forecasting/projection?months=12", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.data) setProjection(data.data); })
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleWhatIf() {
    if (!orgId) return;
    setWhatIfLoading(true);
    try {
      const res = await fetch("/api/v1/payroll/forecasting/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          salaryAdjustmentPercent: parseFloat(salaryAdj),
          newHires: parseInt(newHires),
          avgNewHireSalary: Math.round(parseFloat(avgHireSalary) * 100),
          terminations: parseInt(terminations),
          months: 12,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setWhatIf(data);
      }
    } finally {
      setWhatIfLoading(false);
    }
  }

  if (loading) return <BrandLoader />;

  const totalGross = projection.reduce((s, p) => s + p.gross, 0);
  const totalNet = projection.reduce((s, p) => s + p.net, 0);

  return (
    <ContentReveal className="space-y-6">
      <PageHeader title="Forecasting" description="Project future payroll costs and run what-if scenarios." />

      {/* Projection summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">12-Month Gross</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{formatMoney(totalGross)}</p>
        </motion.div>
        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">12-Month Net</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(totalNet)}</p>
        </motion.div>
        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Headcount</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{projection[0]?.headcount || 0}</p>
        </motion.div>
      </div>

      {/* Monthly projection table */}
      {projection.length > 0 && (
        <div className="rounded-xl border bg-card divide-y">
          <div className="px-4 py-2.5 flex items-center justify-between bg-muted/50 rounded-t-xl">
            <span className="text-xs font-medium text-muted-foreground">Month</span>
            <div className="flex gap-6">
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Gross</span>
              <span className="text-xs font-medium text-muted-foreground w-24 text-right">Net</span>
            </div>
          </div>
          {projection.map((p) => (
            <div key={p.month} className="px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-mono">{p.month}</span>
              <div className="flex gap-6">
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(p.gross)}</span>
                <span className="text-sm font-mono tabular-nums w-24 text-right">{formatMoney(p.net)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* What-if analysis */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">What-If Analysis</h3>
        <div className="rounded-lg border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Salary Adjustment (%)</Label>
              <Input type="number" step="0.1" value={salaryAdj} onChange={(e) => setSalaryAdj(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New Hires</Label>
              <Input type="number" value={newHires} onChange={(e) => setNewHires(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Avg New Hire Salary</Label>
              <CurrencyInput prefix="$" size="sm" value={avgHireSalary} onChange={setAvgHireSalary} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terminations</Label>
              <Input type="number" value={terminations} onChange={(e) => setTerminations(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <Button size="sm" onClick={handleWhatIf} disabled={whatIfLoading}>
            {whatIfLoading ? "Calculating..." : "Run Scenario"}
          </Button>
        </div>

        {whatIf && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current Monthly</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(whatIf.current.monthlyGross)}</p>
              <p className="text-xs text-muted-foreground">{whatIf.current.headcount} employees</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Projected Monthly</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(whatIf.projected.monthlyGross)}</p>
              <p className="text-xs text-muted-foreground">{whatIf.projected.headcount} employees</p>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Difference</p>
              <p className={`mt-1 text-xl font-bold font-mono tabular-nums ${whatIf.difference.monthlyGross >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {whatIf.difference.monthlyGross >= 0 ? "+" : ""}{formatMoney(whatIf.difference.monthlyGross)}
              </p>
              <p className="text-xs text-muted-foreground">per month</p>
            </div>
          </div>
        )}
      </div>
    </ContentReveal>
  );
}
