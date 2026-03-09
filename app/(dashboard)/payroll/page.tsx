"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Plus, Users, DollarSign, FileText, CalendarDays, BarChart3, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";

interface Employee {
  id: string;
  name: string;
  employeeNumber: string;
  position: string | null;
  salary: number;
  payFrequency: string;
  isActive: boolean;
}

interface PayrollRun {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
}

const statusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function PayrollPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    let done = 0;
    const check = () => { done++; if (done >= 2) setLoading(false); };

    fetch("/api/v1/payroll/employees", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.data) setEmployees(data.data); })
      .finally(check);

    fetch("/api/v1/payroll/runs", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.data) setRuns(data.data); })
      .finally(check);
  }, []);

  if (loading) return <BrandLoader />;

  const activeEmployees = employees.filter((e) => e.isActive);
  const totalAnnualSalary = activeEmployees.reduce((sum, e) => sum + e.salary, 0);
  const completedRuns = runs.filter((r) => r.status === "completed");
  const lastRun = runs.length > 0 ? runs[0] : null;
  const ytdPaid = completedRuns.reduce((sum, r) => sum + r.totalNet, 0);
  const draftRuns = runs.filter((r) => r.status === "draft");
  const hasData = employees.length > 0 || runs.length > 0;
  const recentRuns = runs.slice(0, 5);

  if (!hasData) {
    return (
      <ContentReveal className="space-y-6">
        {/* Ghost stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, label: "Active Employees" },
            { icon: DollarSign, label: "Monthly Cost" },
            { icon: FileText, label: "Last Run Net" },
            { icon: CalendarDays, label: "YTD Paid" },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              {...anim(i * 0.05)}
              className="rounded-xl border border-dashed border-muted-foreground/20 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground/40">
                <card.icon className="size-4" />
                <span className="text-[11px] font-medium uppercase tracking-wide">{card.label}</span>
              </div>
              <div className="mt-3 h-7 w-20 rounded-md bg-muted/50" />
            </motion.div>
          ))}
        </div>

        {/* Main hero empty state */}
        <motion.div
          {...anim(0.2)}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed"
        >
          <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
            {/* Animated circles */}
            <div className="relative mb-6">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex size-16 items-center justify-center rounded-2xl bg-muted ring-4 ring-muted/50"
              >
                <DollarSign className="size-8 text-foreground" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="absolute -top-2 -right-3 flex size-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950/60 ring-2 ring-blue-100/50 dark:ring-blue-900/30"
              >
                <Users className="size-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="absolute -bottom-1 -left-3 flex size-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/60 ring-2 ring-amber-100/50 dark:ring-amber-900/30"
              >
                <CalendarDays className="size-3.5 text-amber-600 dark:text-amber-400" />
              </motion.div>
            </div>

            <motion.h3
              {...anim(0.4)}
              className="text-lg font-semibold"
            >
              Set up your payroll
            </motion.h3>
            <motion.p
              {...anim(0.45)}
              className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed"
            >
              Add employees with their salary details, then create payroll runs to process payments. Track costs, deductions, and net payouts all in one place.
            </motion.p>

            {/* Steps */}
            <motion.div
              {...anim(0.5)}
              className="mt-8 flex flex-col sm:flex-row items-center gap-3 sm:gap-6"
            >
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm">
                <div className="flex size-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-xs font-bold text-emerald-700 dark:text-emerald-300">1</div>
                <span className="text-sm font-medium">Add employees</span>
              </div>
              <div className="hidden sm:block h-px w-6 bg-muted-foreground/20" />
              <div className="sm:hidden w-px h-4 bg-muted-foreground/20" />
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm opacity-60">
                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">2</div>
                <span className="text-sm font-medium text-muted-foreground">Run payroll</span>
              </div>
              <div className="hidden sm:block h-px w-6 bg-muted-foreground/20" />
              <div className="sm:hidden w-px h-4 bg-muted-foreground/20" />
              <div className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-2.5 shadow-sm opacity-40">
                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">3</div>
                <span className="text-sm font-medium text-muted-foreground">Track payments</span>
              </div>
            </motion.div>

            <motion.div {...anim(0.55)} className="mt-8">
              <Button
                onClick={() => openDrawer("employee")}
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                Add Your First Employee
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Ghost recent runs section */}
        <motion.div {...anim(0.6)} className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground/50">Recent Runs</h3>
          <div className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
                <div className="size-9 rounded-lg bg-muted/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 rounded bg-muted/40" />
                  <div className="h-3 w-16 rounded bg-muted/30" />
                </div>
                <div className="hidden sm:block h-3.5 w-20 rounded bg-muted/30" />
              </div>
            ))}
          </div>
        </motion.div>
      </ContentReveal>
    );
  }

  const breakdownRun = completedRuns.length > 0 ? completedRuns[0] : lastRun;
  const breakdownTotal = breakdownRun ? breakdownRun.totalGross : 0;
  const grossPct = breakdownTotal > 0 ? 100 : 0;
  const deductionsPct = breakdownTotal > 0 ? (breakdownRun!.totalDeductions / breakdownTotal) * 100 : 0;
  const netPct = breakdownTotal > 0 ? (breakdownRun!.totalNet / breakdownTotal) * 100 : 0;

  return (
    <ContentReveal className="space-y-6">
      <motion.div {...anim(0)}>
        <PageHeader title="Overview" />
      </motion.div>

      {/* Stat cards - 4 columns */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Active Employees</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {activeEmployees.length}
          </p>
        </motion.div>

        <motion.div {...anim(0.05)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <DollarSign className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Monthly Payroll Cost</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {formatMoney(Math.round(totalAnnualSalary / 12))}
          </p>
        </motion.div>

        <motion.div {...anim(0.1)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">YTD Paid</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">
            {formatMoney(ytdPaid)}
          </p>
        </motion.div>

        <motion.div {...anim(0.15)} className={`rounded-xl border bg-card p-4 ${draftRuns.length > 0 ? "border-amber-300/50 dark:border-amber-700/50" : ""}`}>
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Draft Runs</span>
          </div>
          <p className={`mt-2 text-2xl font-bold font-mono tabular-nums truncate ${draftRuns.length > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>
            {draftRuns.length}
          </p>
        </motion.div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left column - Recent Runs (~60%) */}
        <motion.div {...anim(0.2)} className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Runs</h3>
            {runs.length > 0 && (
              <button
                onClick={() => router.push("/payroll/runs")}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
                <ArrowRight className="size-3" />
              </button>
            )}
          </div>
          {recentRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border bg-card py-12 text-center">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                <FileText className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No runs yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a payroll run to pay your employees
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {recentRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => router.push(`/payroll/runs/${run.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {run.payPeriodStart} to {run.payPeriodEnd}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className={statusColors[run.status] || ""}>
                          {run.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Gross / Net</p>
                    <p className="text-sm font-mono tabular-nums">
                      {formatMoney(run.totalGross)} / {formatMoney(run.totalNet)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right column (~40%) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payroll Breakdown */}
          <motion.div {...anim(0.25)} className="space-y-3">
            <h3 className="text-sm font-semibold">Payroll Breakdown</h3>
            <div className="rounded-xl border bg-card p-4 space-y-4">
              {breakdownRun ? (
                <>
                  {/* Stacked horizontal bar */}
                  <div className="h-3 w-full rounded-full overflow-hidden bg-muted flex">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${netPct}%` }}
                      transition={{ duration: 0.6, delay: 0.35 }}
                      className="h-full bg-emerald-500 dark:bg-emerald-400"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${deductionsPct}%` }}
                      transition={{ duration: 0.6, delay: 0.45 }}
                      className="h-full bg-amber-500 dark:bg-amber-400"
                    />
                  </div>

                  {/* Legend */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                        <span className="text-muted-foreground">Net Pay</span>
                      </div>
                      <span className="font-mono tabular-nums font-medium">
                        {formatMoney(breakdownRun.totalNet)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                        <span className="text-muted-foreground">Deductions</span>
                      </div>
                      <span className="font-mono tabular-nums font-medium">
                        {formatMoney(breakdownRun.totalDeductions)}
                      </span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground font-medium">Total Gross</span>
                      <span className="font-mono tabular-nums font-semibold">
                        {formatMoney(breakdownRun.totalGross)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-6 text-center">
                  <BarChart3 className="size-5 text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Run your first payroll to see a breakdown
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div {...anim(0.3)} className="space-y-3">
            <h3 className="text-sm font-semibold">Quick Actions</h3>
            <div className="rounded-xl border bg-card p-4 flex flex-col gap-2">
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                onClick={() => router.push("/payroll/runs")}
              >
                <Plus className="mr-2 size-4" />
                New Run
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => openDrawer("employee")}
              >
                <Users className="mr-2 size-4" />
                Add Employee
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </ContentReveal>
  );
}
