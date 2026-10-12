"use client";

import { Receipt, CreditCard, ClipboardList, ClipboardCheck, PackageOpen, Undo2, PackageCheck, Repeat, RefreshCw } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/purchases", label: "Bills", icon: Receipt, exact: true },
  { href: "/purchases/bills/recurring", label: "Recurring bills", icon: Repeat, title: "Supplier bills that repeat on a schedule" },
  { href: "/purchases/debit-notes", label: "Supplier credits", icon: Undo2, title: "Credit a supplier owes you back, applied against bills" },
  { href: "/purchases/expenses", label: "Expenses", icon: CreditCard, group: "Spending", title: "Receipts and out-of-pocket costs" },
  { href: "/purchases/expenses/recurring", label: "Recurring expenses", icon: RefreshCw, group: "Spending", title: "Expenses that come round every week, month or year" },
  { href: "/purchases/requisitions", label: "Requisitions", icon: ClipboardCheck, group: "Ordering", title: "Requests to buy something, waiting for approval" },
  { href: "/purchases/orders", label: "Purchase orders", icon: ClipboardList, group: "Ordering", title: "Orders you've placed with suppliers" },
  { href: "/purchases/goods-receipts", label: "Goods received", icon: PackageCheck, group: "Ordering", title: "Items received from suppliers against a purchase order" },
  { href: "/purchases/landed-costs", label: "Landed costs", icon: PackageOpen, group: "Ordering", title: "Extra costs like freight & duty added to the cost of stock" },
];

export default function PurchasesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
