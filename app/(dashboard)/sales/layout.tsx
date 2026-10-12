"use client";

import { FileText, ScrollText, CreditCard, RefreshCw, Banknote, Wallet, CalendarClock, Coins } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/sales", label: "Invoices", icon: FileText, exact: true },
  { href: "/sales/quotes", label: "Quotes", icon: ScrollText, title: "Prices you've offered, which turn into invoices when accepted" },
  { href: "/sales/receipts", label: "Cash sales", icon: Banknote, title: "Sales paid on the spot, with no invoice to chase" },
  { href: "/sales/credit-notes", label: "Credit notes", icon: CreditCard, title: "Money you owe a customer back, e.g. for a return" },
  { href: "/sales/payments", label: "Payments", icon: Coins, group: "Getting paid", title: "Payments received from customers" },
  { href: "/sales/customer-prepayments", label: "Prepayments", icon: Wallet, group: "Getting paid", title: "Money customers paid in advance, held as credit on their account" },
  { href: "/sales/recurring", label: "Recurring invoices", icon: RefreshCw, group: "Automation", title: "Invoices that send themselves on a schedule" },
  { href: "/sales/revenue-schedules", label: "Revenue schedules", icon: CalendarClock, group: "Automation", title: "Recognise income from an invoice gradually over time" },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
