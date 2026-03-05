"use client";

import { FileText, ScrollText } from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/sales", label: "Invoices", icon: FileText, exact: true },
  { href: "/sales/quotes", label: "Quotes", icon: ScrollText },
];

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
