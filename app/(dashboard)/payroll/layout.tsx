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
} from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/payroll", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/payroll/employees", label: "Employees", icon: Users },
  { href: "/payroll/runs", label: "Runs", icon: FileText },
  { href: "/payroll/time-leave", label: "Time & Leave", icon: Clock },
  { href: "/payroll/contractors", label: "Contractors", icon: Briefcase },
  { href: "/payroll/compensation", label: "Compensation", icon: DollarSign },
  { href: "/payroll/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/payroll/settings", label: "Settings", icon: Settings },
];

export default function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
