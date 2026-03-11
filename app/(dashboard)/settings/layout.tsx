"use client";

import { Settings, Users, CreditCard, Key, Percent, Coins, ScrollText, Target, Bell, GitBranch, Calendar } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/settings", label: "General", icon: Settings, exact: true },
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/pipelines", label: "Pipelines", icon: Target },
  { href: "/settings/api-keys", label: "API Keys", icon: Key },
  { href: "/settings/tax-rates", label: "Tax Rates", icon: Percent },
  { href: "/settings/currencies", label: "Currencies", icon: Coins },
  { href: "/settings/reminders", label: "Reminders", icon: Bell },
  { href: "/settings/cost-centers", label: "Cost Centers", icon: GitBranch },
  { href: "/settings/tax-periods", label: "Tax Periods", icon: Calendar },
  { href: "/settings/audit-log", label: "Audit Log", icon: ScrollText },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
