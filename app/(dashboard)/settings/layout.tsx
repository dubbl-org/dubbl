"use client";

import { Settings, Users, CreditCard, Key, ScrollText, Target, Bell, GitBranch, Tags, Shield, ShieldCheck, Mail } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/settings", label: "General", icon: Settings, exact: true },
  { href: "/settings/members", label: "Members", icon: Users },
  { href: "/settings/roles", label: "Roles", icon: ShieldCheck },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/pipelines", label: "Pipelines", icon: Target },
  { href: "/settings/api-keys", label: "API Keys", icon: Key },
  { href: "/settings/email", label: "Email", icon: Mail },
  { href: "/settings/reminders", label: "Reminders", icon: Bell },
  { href: "/settings/cost-centers", label: "Cost Centers", icon: GitBranch },
  { href: "/settings/tags", label: "Tags", icon: Tags },
  { href: "/settings/advisors", label: "Advisors", icon: Shield },
  { href: "/settings/audit-log", label: "Audit Log", icon: ScrollText },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
