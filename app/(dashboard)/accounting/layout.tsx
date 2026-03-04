"use client";

import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting", label: "Transactions", exact: true },
  { href: "/accounting/accounts", label: "Accounts" },
  { href: "/accounting/banking", label: "Banking" },
  { href: "/accounting/fixed-assets", label: "Fixed Assets" },
  { href: "/accounting/budgets", label: "Budgets" },
];

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
