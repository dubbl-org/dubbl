"use client";

import { Receipt, CreditCard, ClipboardList, ClipboardCheck, PackageOpen, Undo2, PackageCheck } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/purchases", label: "Bills", icon: Receipt, exact: true },
  { href: "/purchases/debit-notes", label: "Supplier Credits", icon: Undo2, title: "Credit a supplier owes you back, applied against bills" },
  { href: "/purchases/expenses", label: "Expenses", icon: CreditCard },
  { href: "/purchases/orders", label: "Purchase Orders", icon: ClipboardList },
  { href: "/purchases/goods-receipts", label: "Goods Received", icon: PackageCheck, title: "Items received from suppliers against a purchase order" },
  { href: "/purchases/requisitions", label: "Requisitions", icon: ClipboardCheck },
  { href: "/purchases/landed-costs", label: "Landed Costs", icon: PackageOpen, title: "Extra costs like freight & duty added to the cost of stock" },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
