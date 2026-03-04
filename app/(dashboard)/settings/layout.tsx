"use client";

import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/settings", label: "General", exact: true },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/api-keys", label: "API Keys" },
  { href: "/settings/tax-rates", label: "Tax Rates" },
  { href: "/settings/currencies", label: "Currencies" },
  { href: "/settings/audit-log", label: "Audit Log" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
