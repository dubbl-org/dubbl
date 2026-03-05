"use client";

import { ArrowLeftRight, BookOpen, Landmark, Building2, PiggyBank } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting", label: "Transactions", icon: ArrowLeftRight, exact: true },
  { href: "/accounting/accounts", label: "Accounts", icon: BookOpen },
  { href: "/accounting/banking", label: "Banking", icon: Landmark },
  { href: "/accounting/fixed-assets", label: "Fixed Assets", icon: Building2 },
  { href: "/accounting/budgets", label: "Budgets", icon: PiggyBank },
];

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
