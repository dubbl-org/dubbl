"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users, DollarSign, FileText } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";

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

const runStatusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

const employeeColumns: Column<Employee>[] = [
  {
    key: "number",
    header: "Employee #",
    className: "w-28",
    render: (r) => (
      <span className="font-mono text-sm">{r.employeeNumber}</span>
    ),
  },
  {
    key: "name",
    header: "Name",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.name}</p>
        {r.position && (
          <p className="text-xs text-muted-foreground">{r.position}</p>
        )}
      </div>
    ),
  },
  {
    key: "salary",
    header: "Annual Salary",
    className: "w-32 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.salary)}
      </span>
    ),
  },
  {
    key: "frequency",
    header: "Frequency",
    className: "w-24",
    render: (r) => (
      <span className="text-sm capitalize">{r.payFrequency}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-20",
    render: (r) => (
      <span
        className={`text-xs ${r.isActive ? "text-emerald-600" : "text-muted-foreground"}`}
      >
        {r.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

const runColumns: Column<PayrollRun>[] = [
  {
    key: "period",
    header: "Pay Period",
    render: (r) => (
      <span className="text-sm">
        {r.payPeriodStart} to {r.payPeriodEnd}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={runStatusColors[r.status] || ""}>
        {r.status}
      </Badge>
    ),
  },
  {
    key: "gross",
    header: "Gross",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.totalGross)}
      </span>
    ),
  },
  {
    key: "deductions",
    header: "Deductions",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.totalDeductions)}
      </span>
    ),
  },
  {
    key: "net",
    header: "Net Pay",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums font-medium">
        {formatMoney(r.totalNet)}
      </span>
    ),
  },
];

export default function PayrollPage() {
  const router = useRouter();
  const [tab, setTab] = useState("runs");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/payroll/employees", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setEmployees(data.data);
      })
      .finally(() => setLoadingEmployees(false));

    fetch("/api/v1/payroll/runs", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setRuns(data.data);
      })
      .finally(() => setLoadingRuns(false));
  }, []);

  const activeEmployees = employees.filter((e) => e.isActive);
  const totalAnnualSalary = activeEmployees.reduce(
    (sum, e) => sum + e.salary,
    0
  );
  const lastRun = runs.length > 0 ? runs[0] : null;

  const hasData = employees.length > 0 || runs.length > 0;

  if (!loadingEmployees && !loadingRuns && !hasData) {
    return (
      <div className="space-y-10">
        <Section title="Payroll" description="Add employees to get started with payroll.">
          <EmptyState
            icon={Users}
            title="No payroll data"
            description="Add employees to get started with payroll."
          >
            <Button
              onClick={() => router.push("/payroll/employees/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Employee
            </Button>
          </EmptyState>
        </Section>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Section title="Overview" description="A summary of your payroll, active employees, and recent pay runs.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Active Employees"
              value={activeEmployees.length.toString()}
              icon={Users}
            />
            <StatCard
              title="Annual Payroll"
              value={formatMoney(totalAnnualSalary)}
              icon={DollarSign}
            />
            <StatCard
              title="Last Run Net"
              value={lastRun ? formatMoney(lastRun.totalNet) : "$0.00"}
              icon={FileText}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/payroll/employees/new")}
            >
              <Plus className="mr-2 size-4" />
              Add Employee
            </Button>
            <Button
              size="sm"
              onClick={() => router.push("/payroll/runs")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <FileText className="mr-2 size-4" />
              Payroll Runs
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Payroll" description="View and manage employees and recent pay runs.">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="runs">Recent Runs</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="mt-4">
            <DataTable
              columns={runColumns}
              data={runs}
              loading={loadingRuns}
              emptyMessage="No payroll runs yet."
              onRowClick={(r) => router.push(`/payroll/runs/${r.id}`)}
            />
          </TabsContent>
          <TabsContent value="employees" className="mt-4">
            <DataTable
              columns={employeeColumns}
              data={employees}
              loading={loadingEmployees}
              emptyMessage="No employees added."
              onRowClick={(r) => router.push(`/payroll/employees/${r.id}`)}
            />
          </TabsContent>
        </Tabs>
      </Section>
    </div>
  );
}
