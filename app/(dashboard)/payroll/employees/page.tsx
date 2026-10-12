"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay, parseDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

/**
 * One row of GET /api/v1/payroll/employees. The API also returns
 * `bankAccountNumber`; it is deliberately left out so it never reaches the
 * table, the preview or the CSV export.
 */
interface Employee {
  id: string;
  name: string;
  email: string | null;
  employeeNumber: string;
  position: string | null;
  department: string | null;
  compensationType: "salary" | "hourly" | "milestone" | "commission";
  /** Annual, in cents. */
  salary: number;
  hourlyRate: number | null;
  payFrequency: "weekly" | "biweekly" | "monthly";
  /** Basis points: 2000 = 20%. */
  taxRate: number;
  startDate: string;
  endDate: string | null;
  terminationDate: string | null;
  ptoBalanceHours: number;
  currency: string | null;
  isActive: boolean;
  createdAt: string;
  member: { user: { name: string | null; email: string } | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Active", color: "#10B981", hint: "On the team and included in pay runs" },
  { value: "leaving", label: "Leaving", color: "#F59E0B", hint: "Still active, with a last day coming up" },
  { value: "inactive", label: "Inactive", color: "#D4D4D8", hint: "No longer paid: they left or were paused" },
];

const PAY_TYPES: Record<Employee["compensationType"], string> = {
  salary: "Salary",
  hourly: "Hourly",
  milestone: "Milestone",
  commission: "Commission",
};

const FREQUENCIES: Record<Employee["payFrequency"], { label: string; perYear: number }> = {
  weekly: { label: "Weekly", perYear: 52 },
  biweekly: { label: "Every 2 weeks", perYear: 26 },
  monthly: { label: "Monthly", perYear: 12 },
};

const lastDay = (e: Employee) => e.terminationDate || e.endDate;

function statusOf(e: Employee) {
  if (!e.isActive) return "inactive";
  const d = daysUntil(lastDay(e));
  return d != null && d >= 0 ? "leaving" : "active";
}

/** What one payday costs before tax, using the same split as the pay run. */
const perPayday = (e: Employee) => Math.round(e.salary / (FREQUENCIES[e.payFrequency]?.perYear ?? 12));

function tenure(e: Employee) {
  const start = parseDay(e.startDate);
  if (!start) return null;
  const end = parseDay(lastDay(e)) ?? new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  if (months < 0) return "Starts soon";
  if (months < 1) return "New";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y}y`, m && `${m}m`].filter(Boolean).join(" ");
}

function tenureMonths(e: Employee) {
  const start = parseDay(e.startDate);
  if (!start) return null;
  const end = parseDay(lastDay(e)) ?? new Date();
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
}

export default function EmployeesPage() {
  const { open: openDrawer } = useCreateDrawer();
  const [version, setVersion] = useState(0);
  useDocumentTitle("Payroll · Employees");

  // Other screens can ask this list to reload
  useEffect(() => {
    const handler = () => setVersion((v) => v + 1);
    window.addEventListener("refetch-employees", handler);
    return () => window.removeEventListener("refetch-employees", handler);
  }, []);

  const config = useMemo<ExplorerConfig<Employee>>(
    () => ({
      id: "payroll-employees",
      chart: false,
      endpoint: "/api/v1/payroll/employees",
      noun: { one: "Employee", many: "Employees" },
      getId: (e) => e.id,
      href: (e) => `/payroll/employees/${e.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (e) => e.startDate, label: "Start date" },
      party: { get: (e) => e.department, label: "Department", many: "Departments" },
      amount: (e) => e.salary,
      amountLabel: "Yearly pay",
      currency: (e) => e.currency,
      search: (e) => [e.name, e.employeeNumber, e.position, e.department, e.email],
      defaultSort: { key: "name", dir: "asc" },
      facets: [
        { key: "payType", label: "Pay type", value: (e) => PAY_TYPES[e.compensationType] ?? e.compensationType },
        { key: "frequency", label: "Paid", value: (e) => FREQUENCIES[e.payFrequency]?.label ?? e.payFrequency },
        { key: "role", label: "Role", value: (e) => e.position },
        { key: "currency", label: "Currency", value: (e) => e.currency },
      ],
      columns: [
        { key: "name", label: "Name", value: (e) => e.name, render: (e) => <PartyCell name={e.name} sub={e.email || e.position} /> },
        { key: "number", label: "Number", className: "w-28", value: (e) => e.employeeNumber, render: (e) => <NumberCell value={e.employeeNumber} /> },
        { key: "role", label: "Role", className: "w-44", value: (e) => e.position, render: (e) => <MutedCell value={e.position} /> },
        { key: "department", label: "Department", className: "w-36", value: (e) => e.department, render: (e) => <MutedCell value={e.department} /> },
        { key: "payType", label: "Pay type", className: "w-28", value: (e) => PAY_TYPES[e.compensationType] ?? e.compensationType },
        { key: "frequency", label: "Paid", className: "w-32", value: (e) => FREQUENCIES[e.payFrequency]?.label ?? e.payFrequency },
        { key: "start", label: "Started", className: "w-32", value: (e) => e.startDate, render: (e) => <DateCell value={e.startDate} /> },
        { key: "tenure", label: "With you", className: "w-24", hint: "How long they've worked here", value: tenureMonths, render: (e) => <MutedCell value={tenure(e)} />, csv: tenure },
        { key: "status", label: "Status", className: "w-28", value: statusOf, render: (e) => <StatusPill value={statusOf(e)} options={STATUSES} /> },
        {
          key: "payday",
          label: "Each payday",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Their yearly pay split across paydays, before tax and deductions",
          value: perPayday,
          render: (e) => <MoneyCell cents={perPayday(e)} currency={e.currency} />,
        },
        { key: "salary", label: "Yearly pay", align: "right", className: "w-32", money: true, hint: "Annual salary before tax", value: (e) => e.salary, render: (e) => <MoneyCell cents={e.salary} currency={e.currency} className="font-medium" /> },
        {
          key: "hourly",
          label: "Hourly rate",
          align: "right",
          className: "w-28",
          hidden: true,
          value: (e) => e.hourlyRate,
          render: (e) => (e.hourlyRate != null ? <MoneyCell cents={e.hourlyRate} currency={e.currency} /> : <span className="text-muted-foreground/50">—</span>),
          csv: (e) => (e.hourlyRate != null ? (e.hourlyRate / 100).toFixed(2) : ""),
        },
        { key: "tax", label: "Tax withheld", align: "right", className: "w-28", hidden: true, hint: "The flat rate held back from each payday for income tax", value: (e) => e.taxRate / 100, render: (e) => <span className="tabular-nums">{+(e.taxRate / 100).toFixed(2)}%</span> },
        { key: "pto", label: "Time off left", align: "right", className: "w-28", hidden: true, hint: "Paid time off they still have, in hours", value: (e) => e.ptoBalanceHours, render: (e) => <span className="tabular-nums">{+e.ptoBalanceHours.toFixed(1)}h</span> },
        { key: "lastDay", label: "Last day", className: "w-32", hidden: true, value: lastDay, render: (e) => <DateCell value={lastDay(e)} /> },
        { key: "email", label: "Email", hidden: true, value: (e) => e.email, render: (e) => <MutedCell value={e.email} /> },
        { key: "login", label: "Team login", hidden: true, hint: "The dubbl account linked to this employee, if any", value: (e) => e.member?.user?.email, render: (e) => <MutedCell value={e.member?.user?.email} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (e) => e.currency },
        { key: "created", label: "Added", className: "w-32", hidden: true, value: (e) => e.createdAt, render: (e) => <DateCell value={e.createdAt} /> },
      ],
      metrics: (rows) => {
        const active = rows.filter((e) => e.isActive);
        const inactive = rows.length - active.length;
        const yearly = active.reduce((s, e) => s + e.salary, 0);
        const salaried = active.filter((e) => e.salary > 0);
        const avg = salaried.length ? Math.round(salaried.reduce((s, e) => s + e.salary, 0) / salaried.length) : 0;
        const depts = new Map<string, number>();
        for (const e of active) if (e.department) depts.set(e.department, (depts.get(e.department) ?? 0) + 1);
        const biggest = [...depts.entries()].sort((a, b) => b[1] - a[1])[0];
        const leaving = active.filter((e) => statusOf(e) === "leaving");
        const thisYear = new Date().getFullYear();
        const hired = rows.filter((e) => parseDay(e.startDate)?.getFullYear() === thisYear).length;
        return [
          { key: "headcount", label: "Headcount", color: "#10B981", status: "active", value: active.length.toString(), note: inactive ? `${inactive} inactive` : "Everyone is active", hint: "People currently on the team and included in pay runs." },
          { key: "cost", label: "Monthly payroll cost", color: "#0EA5E9", value: formatMoney(Math.round(yearly / 12)), note: `${formatMoney(yearly)} a year`, hint: "What your active team earns before tax, spread evenly over the year. Employer taxes and benefits aren't included." },
          { key: "avg", label: "Average salary", color: "#8B5CF6", value: salaried.length ? formatMoney(avg) : "—", note: salaried.length ? `Across ${salaried.length} paid a salary` : "No salaries yet", hint: "The typical yearly pay of active employees who have a salary set." },
          { key: "depts", label: "Departments", color: "#14B8A6", value: depts.size.toString(), note: biggest ? `Largest: ${biggest[0]} (${biggest[1]})` : "None set yet", hint: "How many departments your active team is spread across." },
          { key: "leaving", label: "Leaving soon", color: "#F59E0B", status: "leaving", value: leaving.length.toString(), note: leaving.length ? `Next: ${formatDay(leaving.map(lastDay).sort()[0])}` : "Nobody is leaving", hint: "Active employees with a last working day coming up. Plan their final pay." },
          { key: "hired", label: "Joined this year", color: "#EC4899", value: hired.toString(), note: `Since Jan 1, ${thisYear}`, hint: "Employees whose start date is this calendar year." },
        ];
      },
      preview: (e) => {
        const cur = e.currency || "USD";
        const freq = FREQUENCIES[e.payFrequency];
        return (
          <DocumentPreview
            number={e.employeeNumber}
            status={statusOf(e)}
            statusOptions={STATUSES}
            party={e.name}
            partySub={[e.position, e.department].filter(Boolean).join(" · ") || e.email}
            amount={e.salary}
            amountLabel="a year"
            currency={cur}
            facts={[
              { label: "Pay type", value: PAY_TYPES[e.compensationType] ?? e.compensationType },
              { label: "Paid", value: freq?.label ?? e.payFrequency },
              { label: "Each payday", value: formatMoney(perPayday(e), cur) },
              { label: "Hourly rate", value: e.hourlyRate != null ? formatMoney(e.hourlyRate, cur) : "—" },
              { label: "Tax withheld", value: `${+(e.taxRate / 100).toFixed(2)}%` },
              { label: "Time off left", value: `${+e.ptoBalanceHours.toFixed(1)} hours` },
              { label: "Started", value: formatDay(e.startDate) },
              { label: "With you", value: tenure(e) ?? "—" },
              { label: "Last day", value: lastDay(e) ? formatDay(lastDay(e)) : "—" },
              { label: "Department", value: e.department || "—" },
              { label: "Email", value: e.email || "—" },
              { label: "Team login", value: e.member?.user?.email || "Not linked" },
            ]}
          />
        );
      },
      empty: <EmployeesEmpty onCreate={() => openDrawer("employee")} />,
    }),
    [openDrawer]
  );

  return <Explorer key={version} config={config} />;
}

function EmployeesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal className="space-y-6">
      {/* Visual empty state */}
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-brand-200 dark:border-brand-900/50">
        <div className="relative flex flex-col items-center py-16 px-6">
          {/* Floating avatar placeholders */}
          <div className="relative h-24 w-64 mb-6">
            {[
              { left: "10%", top: "0%", size: 44, delay: 0.2, initials: "JD" },
              { left: "38%", top: "5%", size: 52, delay: 0.1, initials: "?" },
              { left: "68%", top: "2%", size: 40, delay: 0.3, initials: "AK" },
            ].map((avatar, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, delay: avatar.delay, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "absolute flex items-center justify-center rounded-full font-semibold",
                  i === 1
                    ? "bg-brand-100 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 ring-4 ring-brand-100/50 dark:ring-brand-900/30 text-base"
                    : "bg-muted text-muted-foreground/40 text-xs ring-2 ring-muted/50"
                )}
                style={{ left: avatar.left, top: avatar.top, width: avatar.size, height: avatar.size }}
              >
                {avatar.initials}
              </motion.div>
            ))}
            {/* Connecting dotted lines */}
            <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.15 }}>
              <line x1="25%" y1="50%" x2="50%" y2="50%" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
              <line x1="50%" y1="50%" x2="78%" y2="50%" stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
            </svg>
          </div>

          <motion.h3 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }} className="text-lg font-semibold">
            Build your team
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="mt-2 max-w-sm text-sm text-muted-foreground text-center leading-relaxed"
          >
            Add employees with their compensation details, pay frequency, and tax information to start managing payroll.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.5 }} className="mt-6">
            <Button size="lg" onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shadow-md shadow-brand-600/20">
              <Plus className="mr-2 size-4" />
              Add Employee
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Ghost list rows */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10"
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ opacity: 1 - i * 0.2 }}>
            <div className="size-9 rounded-full bg-muted/40" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 rounded bg-muted/40" />
              <div className="h-3 w-20 rounded bg-muted/30" />
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-3.5 w-16 rounded bg-muted/30" />
              <div className="h-5 w-14 rounded-full bg-muted/25" />
            </div>
          </div>
        ))}
      </motion.div>
    </ContentReveal>
  );
}
