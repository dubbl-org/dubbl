"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Plus, Users, DollarSign, FileText, CalendarDays } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { EmptyState } from "@/components/dashboard/empty-state";
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
  const hasData = employees.length > 0 || runs.length > 0;
  const recentRuns = runs.slice(0, 5);

  if (!hasData) {
    return (
      <ContentReveal>
        <EmptyState
          icon={Users}
          title="No payroll data"
          description="Add employees to get started with payroll."
        >
          <Button
            onClick={() => openDrawer("employee")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            Add Employee
          </Button>
        </EmptyState>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      {/* Stat cards */}
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
            <span className="text-[11px] font-medium uppercase tracking-wide">Monthly Cost</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {formatMoney(Math.round(totalAnnualSalary / 12))}
          </p>
        </motion.div>

        <motion.div {...anim(0.09)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">Last Run Net</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
            {lastRun ? formatMoney(lastRun.totalNet) : "-"}
          </p>
        </motion.div>

        <motion.div {...anim(0.13)} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">YTD Paid</span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate text-emerald-600 dark:text-emerald-400">
            {formatMoney(ytdPaid)}
          </p>
        </motion.div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => openDrawer("employee")}
        >
          <Plus className="mr-1.5 size-3" />
          Add Employee
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
          onClick={() => router.push("/payroll/runs")}
        >
          <FileText className="mr-1.5 size-3" />
          New Payroll Run
        </Button>
      </div>

      {/* Recent Runs */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Recent Runs</h3>
        {recentRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
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
      </div>
    </ContentReveal>
  );
}
