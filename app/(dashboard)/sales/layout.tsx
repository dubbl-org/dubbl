"use client";

import { FileText, ScrollText, CreditCard, RefreshCw, Banknote, Wallet, CalendarClock } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/sales", label: "Invoices", icon: FileText, exact: true },
  { href: "/sales/quotes", label: "Quotes", icon: ScrollText },
  { href: "/sales/receipts", label: "Cash Sales", icon: Banknote },
  { href: "/sales/credit-notes", label: "Credit Notes", icon: CreditCard },
  { href: "/sales/customer-prepayments", label: "Prepayments", icon: Wallet, title: "Money customers paid in advance, held as credit on their account" },
  { href: "/sales/revenue-schedules", label: "Revenue Schedules", icon: CalendarClock, title: "Recognise income from an invoice gradually over time" },
  { href: "/sales/recurring", label: "Recurring", icon: RefreshCw },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
