"use client";

import { ArrowLeftRight, BookOpen, Landmark, Building2, PiggyBank, HandCoins, Scale, CalendarRange, Repeat, Layers, CalendarClock, Boxes, CalendarCheck2 } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/accounting", label: "Transactions", icon: ArrowLeftRight, exact: true },
  { href: "/accounting/accounts", label: "Accounts", icon: BookOpen, title: "Your chart of accounts" },
  { href: "/accounting/banking", label: "Bank accounts", icon: Landmark, group: "Banking", title: "Bank feeds, imports and reconciliation" },
  { href: "/accounting/banking/scheduled", label: "Scheduled payments", icon: CalendarClock, group: "Banking", title: "Bill payments set to go out on a future date" },
  { href: "/accounting/banking/batches", label: "Payment batches", icon: Boxes, group: "Banking", title: "Pay several supplier bills in one go" },
  { href: "/accounting/fixed-assets", label: "Fixed assets", icon: Building2, group: "Assets and loans", title: "Equipment and property you depreciate over time" },
  { href: "/accounting/asset-categories", label: "Asset categories", icon: Layers, group: "Assets and loans", title: "Reusable depreciation templates for fixed assets" },
  { href: "/accounting/loans", label: "Loans", icon: HandCoins, group: "Assets and loans", title: "Track loans and post their repayments on schedule" },
  { href: "/accounting/budgets", label: "Budgets", icon: PiggyBank, group: "Planning", title: "Plan income and spending, then compare to what really happened" },
  { href: "/accounting/accruals", label: "Accruals", icon: CalendarRange, group: "Adjustments", title: "Spread a cost or income evenly over several months" },
  { href: "/accounting/recurring-journals", label: "Recurring journals", icon: Repeat, group: "Adjustments", title: "Manual journal entries that post automatically on a schedule" },
  { href: "/accounting/fiscal-years", label: "Financial years", icon: CalendarCheck2, group: "Year end & setup", title: "Your accounting years, and closing them at year end" },
  { href: "/accounting/opening-balances", label: "Opening balances", icon: Scale, group: "Year end & setup", title: "Your account starting balances from when you began using the app" },
];

export default function AccountingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
