"use client";

import { LayoutDashboard, Users, FileText } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/payroll", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/payroll/employees", label: "Employees", icon: Users },
  { href: "/payroll/runs", label: "Runs", icon: FileText },
];

export default function PayrollLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
