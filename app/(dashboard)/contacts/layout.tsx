"use client";

import {
  BookUser,
  UserRound,
  ScrollText,
  Globe,
  Copy,
  Wallet,
  Clock,
  Hourglass,
  FileSpreadsheet,
  BellRing,
} from "lucide-react";
import { TabLayout } from "@/components/dashboard/tab-layout";

const TABS = [
  { href: "/contacts", label: "All contacts", icon: BookUser, exact: true },
  { href: "/contacts/people", label: "People", icon: UserRound, title: "Everyone you deal with at your customers and suppliers" },
  { href: "/contacts/statements", label: "Statements", icon: ScrollText, group: "Stay in touch", title: "Send account statements to customers with an open balance" },
  { href: "/contacts/portal", label: "Customer portal", icon: Globe, group: "Stay in touch", title: "Private links where customers see their invoices and statements" },
  { href: "/contacts/duplicates", label: "Duplicates", icon: Copy, group: "Stay in touch", title: "Contacts entered twice, ready to merge" },
  { href: "/sales/customer-prepayments", label: "Customer credits", icon: Wallet, group: "Related", title: "Money customers paid in advance, held on their account" },
  { href: "/reports/aged-receivables", label: "Aged receivables", icon: Clock, group: "Related" },
  { href: "/reports/aged-payables", label: "Aged payables", icon: Hourglass, group: "Related" },
  { href: "/reports/1099", label: "1099 totals", icon: FileSpreadsheet, group: "Related", title: "What you paid each US contractor this year" },
  { href: "/settings/reminders", label: "Payment reminders", icon: BellRing, group: "Related", title: "Automatic emails when an invoice is due or late" },
];

export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  return <TabLayout tabs={TABS}>{children}</TabLayout>;
}
