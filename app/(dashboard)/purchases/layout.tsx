"use client";

import { Receipt, CreditCard, ClipboardList, ClipboardCheck, PackageOpen } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/purchases", label: "Bills", icon: Receipt, exact: true },
  { href: "/purchases/expenses", label: "Expenses", icon: CreditCard },
  { href: "/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/purchases/requisitions", label: "Requisitions", icon: ClipboardCheck },
  { href: "/purchases/landed-costs", label: "Landed Costs", icon: PackageOpen },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
