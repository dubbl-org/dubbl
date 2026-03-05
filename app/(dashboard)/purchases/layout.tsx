"use client";

import { Receipt, CreditCard, ClipboardList } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/purchases", label: "Bills", icon: Receipt, exact: true },
  { href: "/purchases/expenses", label: "Expenses", icon: CreditCard },
  { href: "/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
