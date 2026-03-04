"use client";

import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/purchases", label: "Bills", exact: true },
  { href: "/purchases/expenses", label: "Expenses" },
  { href: "/purchases/orders", label: "Purchase Orders" },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
