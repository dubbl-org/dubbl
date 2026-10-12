"use client";

import {
  LayoutDashboard,
  Users,
  FileText,
  Clock,
  Briefcase,
  BarChart3,
  DollarSign,
  Settings,
  Landmark,
  FileBadge,
  UserCircle,
} from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/payroll", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/payroll/employees", label: "Employees", icon: Users, group: "People" },
  { href: "/payroll/contractors", label: "Contractors", icon: Briefcase, group: "People", title: "Freelancers you pay without running payroll" },
  { href: "/payroll/compensation", label: "Compensation", icon: DollarSign, group: "People", title: "Salaries, pay bands and pay reviews" },
  { href: "/payroll/runs", label: "Pay runs", icon: FileText, group: "Pay", title: "Work out and pay wages for a pay period" },
  { href: "/payroll/time-leave", label: "Time & leave", icon: Clock, group: "Pay", title: "Timesheets, time off requests and leave balances" },
  { href: "/payroll/tax-liabilities", label: "Tax liabilities", icon: Landmark, group: "Compliance", title: "Payroll taxes you owe, and recording payments to the agencies" },
  { href: "/payroll/tax-forms", label: "Tax forms", icon: FileBadge, group: "Compliance", title: "Year-end forms such as W-2s and 1099s" },
  { href: "/payroll/analytics", label: "Reports & forecast", icon: BarChart3, group: "Insights", title: "Payroll reports, a 12-month cost forecast and what-if scenarios" },
  { href: "/payroll/self-service", label: "Employee self-service", icon: UserCircle, group: "Setup", title: "What an employee sees: their own payslips, leave and timesheets" },
  { href: "/payroll/settings", label: "Settings", icon: Settings, group: "Setup" },
];

export default function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
