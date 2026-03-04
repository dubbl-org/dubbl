"use client";

import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/sales", label: "Invoices", exact: true },
  { href: "/sales/quotes", label: "Quotes" },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
