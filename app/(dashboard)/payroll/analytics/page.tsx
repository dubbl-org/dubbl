"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  BarChart3,
  FileText,
  DollarSign,
  TrendingUp,
  Download,
  LineChart,
  Users,
  Calculator,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/* ---------- types ---------- */

interface Summary {
  totalRuns: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  activeEmployees: number;
  avgCostPerRun: number;
}

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

/* ---------- helpers ---------- */

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

const REPORT_TYPES = [
  { type: "summary", label: "Summary", description: "Overview of payroll totals and averages", icon: BarChart3 },
  { type: "tax-liability", label: "Tax Liability", description: "Tax breakdown by employee", icon: FileText },
  { type: "labor-cost", label: "Labor Cost", description: "Cost breakdown by department", icon: DollarSign },
  { type: "yoy", label: "Year over Year", description: "Monthly payroll trends", icon: TrendingUp },
];

const GHOST_ROWS = Array.from({ length: 6 }, (_, i) => i);

/* ---------- component ---------- */

export default function AnalyticsPage() {
  const router = useRouter();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [projection, setProjection] = useState<Projection[]>([]);
  const [loading, setLoading] = useState(true);

  const [whatIf, setWhatIf] = useState<WhatIfResult | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  // What-if form state
  const [salaryAdj, setSalaryAdj] = useState("0");
  const [newHires, setNewHires] = useState("0");
  const [avgHireSalary, setAvgHireSalary] = useState("60000");
  const [terminations, setTerminations] = useState("0");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/reports/summary", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/forecasting/projection?months=12", { headers }).then((r) => r.json()),
    ])
      .then(([summaryRes, projRes]) => {
        if (summaryRes.summary) setSummary(summaryRes.summary);
        if (projRes.data) setProjection(projRes.data);
      })
      .catch(() => toast.error("Failed to load analytics data"))
      .finally(() => setLoading(false));
  }, [orgId]);

  const handleExport = useCallback(() => {
    if (!orgId) return;
    window.open(`/api/v1/payroll/reports/export?x-organization-id=${orgId}`, "_blank");
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
      } else {
        toast.error("Scenario calculation failed");
      }
    } catch {
      toast.error("Scenario calculation failed");
    } finally {
      setWhatIfLoading(false);
    }
  }

  useTopbarAction(
    useMemo(
      () => (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleExport}>
          <Download className="size-3" /> Export CSV
        </Button>
      ),
      [handleExport]
    )
  );

  if (loading) return <BrandLoader />;

  const hasData = summary && summary.totalRuns > 0;

  return (
    <ContentReveal className="space-y-8">
      {/* Empty state */}
      {!hasData && (
        <>
          <motion.div
            {...anim(0.1)}
            className="relative overflow-hidden rounded-2xl border-2 border-dashed"
          >
            <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
              {/* Animated icons */}
              <div className="relative mb-6">
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-4 ring-muted/50"
                >
                  <BarChart3 className="size-8 text-foreground" />
                </motion.div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
                >
                  <TrendingUp className="size-4 text-blue-600 dark:text-blue-400" />
                </motion.div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.6 }}
                  className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
                >
                  <DollarSign className="size-3.5 text-amber-600 dark:text-amber-400" />
                </motion.div>
              </div>

              <motion.h3 {...anim(0.4)} className="text-lg font-semibold">
                No analytics data yet
              </motion.h3>
              <motion.p
                {...anim(0.45)}
                className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed"
              >
                Run your first payroll to unlock reports, forecasts, and cost insights across your organization.
              </motion.p>

              <motion.div {...anim(0.55)} className="mt-8">
                <Button
                  onClick={() => router.push("/payroll/runs")}
                  size="lg"
                  className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Go to Payroll Runs
                </Button>
              </motion.div>
            </div>
          </motion.div>

          {/* Report type preview cards */}
          <motion.div {...anim(0.5)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REPORT_TYPES.map((report, i) => (
              <div
                key={report.type}
                className="flex items-start gap-4 rounded-xl border border-dashed border-muted-foreground/15 bg-card/30 p-4"
                style={{ opacity: 0.7 - i * 0.1 }}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                  <report.icon className="size-5 text-muted-foreground/50" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 rounded bg-muted/40" />
                  <div className="h-3 w-40 rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </motion.div>

          {/* Ghost forecast rows */}
          <motion.div {...anim(0.6)} className="space-y-2">
            <div className="h-3.5 w-20 rounded bg-muted/40 mb-3" />
            <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
              {GHOST_ROWS.slice(0, 4).map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-4 py-3"
                  style={{ opacity: 1 - i * 0.2 }}
                >
                  <div className="h-3 w-20 rounded bg-muted/40" />
                  <div className="ml-auto h-3 w-16 rounded bg-muted/30" />
                  <div className="h-3 w-16 rounded bg-muted/30" />
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}

      {/* Summary stat cards */}
      {hasData && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Runs</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{summary.totalRuns}</p>
          </motion.div>
          <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Gross</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{formatMoney(summary.totalGross)}</p>
          </motion.div>
          <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Net</p>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(summary.totalNet)}
            </p>
          </motion.div>
          <motion.div {...anim(0.15)} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Active Employees</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                <Users className="mr-0.5 size-2.5" />
                Live
              </Badge>
            </div>
            <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{summary.activeEmployees}</p>
          </motion.div>
        </div>
      )}

      {/* Section 1: Reports */}
      {hasData && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Reports</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REPORT_TYPES.map((report, i) => (
              <motion.button
                key={report.type}
                {...anim(0.2 + i * 0.05)}
                onClick={() => router.push(`/payroll/reports/${report.type}`)}
                className="flex items-start gap-4 rounded-xl border bg-card p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <report.icon className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{report.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: 12-Month Forecast */}
      {hasData && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Forecast</h2>

          {projection.length > 0 ? (
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
          ) : (
            <div className="rounded-xl border border-dashed bg-card/50 p-6 text-center">
              <p className="text-xs text-muted-foreground">No forecast data available yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Section 3: What-If Analysis */}
      {hasData && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">What-If Analysis</h2>
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Salary Adjustment (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={salaryAdj}
                  onChange={(e) => setSalaryAdj(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">New Hires</Label>
                <Input
                  type="number"
                  value={newHires}
                  onChange={(e) => setNewHires(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Avg New Hire Salary ($)</Label>
                <Input
                  type="number"
                  value={avgHireSalary}
                  onChange={(e) => setAvgHireSalary(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Terminations</Label>
                <Input
                  type="number"
                  value={terminations}
                  onChange={(e) => setTerminations(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <Button size="sm" onClick={handleWhatIf} disabled={whatIfLoading}>
              <Calculator className="mr-1.5 size-3" />
              {whatIfLoading ? "Calculating..." : "Run Scenario"}
            </Button>
          </div>

          {whatIf && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current Monthly</p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums">{formatMoney(whatIf.current.monthlyGross)}</p>
                <p className="text-xs text-muted-foreground">{whatIf.current.headcount} employees</p>
              </motion.div>
              <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Projected Monthly</p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatMoney(whatIf.projected.monthlyGross)}
                </p>
                <p className="text-xs text-muted-foreground">{whatIf.projected.headcount} employees</p>
              </motion.div>
              <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Difference</p>
                <p
                  className={cn(
                    "mt-1 text-xl font-bold font-mono tabular-nums",
                    whatIf.difference.monthlyGross >= 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {whatIf.difference.monthlyGross >= 0 ? "+" : ""}
                  {formatMoney(whatIf.difference.monthlyGross)}
                </p>
                <p className="text-xs text-muted-foreground">per month</p>
              </motion.div>
            </div>
          )}
        </div>
      )}
    </ContentReveal>
  );
}
