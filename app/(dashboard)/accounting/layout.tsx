"use client";

import { ArrowLeftRight, BookOpen, Landmark, Building2, PiggyBank, HandCoins, Scale, CalendarRange, Repeat, Layers } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting", label: "Transactions", icon: ArrowLeftRight, exact: true },
  { href: "/accounting/accounts", label: "Accounts", icon: BookOpen },
  { href: "/accounting/banking", label: "Banking", icon: Landmark },
  { href: "/accounting/loans", label: "Loans", icon: HandCoins, title: "Track loans and post their repayments on schedule" },
  { href: "/accounting/fixed-assets", label: "Fixed Assets", icon: Building2 },
  { href: "/accounting/asset-categories", label: "Asset Categories", icon: Layers, title: "Reusable depreciation templates for fixed assets" },
  { href: "/accounting/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/accounting/opening-balances", label: "Opening Balances", icon: Scale, title: "Your account starting balances from when you began using the app" },
  { href: "/accounting/accruals", label: "Accruals", icon: CalendarRange, title: "Spread a cost or income evenly over several months" },
  { href: "/accounting/recurring-journals", label: "Recurring Journals", icon: Repeat, title: "Manual journal entries that post automatically on a schedule" },
];

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
