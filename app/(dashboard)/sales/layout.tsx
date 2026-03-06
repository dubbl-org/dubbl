"use client";

import { FileText, ScrollText, CreditCard, RefreshCw } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/sales", label: "Invoices", icon: FileText, exact: true },
  { href: "/sales/quotes", label: "Quotes", icon: ScrollText },
  { href: "/sales/credit-notes", label: "Credit Notes", icon: CreditCard },
  { href: "/sales/recurring", label: "Recurring", icon: RefreshCw },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
