"use client";

import Link from "next/link";
import {
  BarChart3,
  Scale,
  PieChart,
  TrendingUp,
  DollarSign,
  BookOpen,
  Target,
  Clock,
  ArrowDownUp,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";

const reportCategories = [
  {
    title: "Financial",
    reports: [
      {
        title: "Profit & Loss",
        description: "Revenue minus expenses over a period.",
        href: "/reports/profit-and-loss",
        icon: TrendingUp,
      },
      {
        title: "Balance Sheet",
        description: "Assets, liabilities, and equity at a point in time.",
        href: "/reports/balance-sheet",
        icon: BarChart3,
      },
      {
        title: "Cash Flow Statement",
        description: "Cash inflows and outflows by operating, investing, and financing activities.",
        href: "/reports/cash-flow",
        icon: ArrowDownUp,
      },
      {
        title: "Income Statement",
        description: "Revenue and expenses over a period.",
        href: "/reports/income-statement",
        icon: PieChart,
      },
      {
        title: "Budget vs Actual",
        description: "Compare budgeted amounts against actual GL balances.",
        href: "/reports/budget-vs-actual",
        icon: Target,
      },
    ],
  },
  {
    title: "Sales",
    reports: [
      {
        title: "Aged Receivables",
        description: "Outstanding invoices grouped by aging buckets.",
        href: "/reports/aged-receivables",
        icon: Clock,
      },
    ],
  },
  {
    title: "Purchases",
    reports: [
      {
        title: "Aged Payables",
        description: "Outstanding bills grouped by aging buckets.",
        href: "/reports/aged-payables",
        icon: DollarSign,
      },
    ],
  },
  {
    title: "Accounting",
    reports: [
      {
        title: "Trial Balance",
        description: "Summary of all account balances to verify debits equal credits.",
        href: "/reports/trial-balance",
        icon: Scale,
      },
      {
        title: "General Ledger",
        description: "All journal lines grouped by account with running balance.",
        href: "/reports/general-ledger",
        icon: BookOpen,
      },
    ],
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Financial reports and analysis."
      />

      {reportCategories.map((category) => (
        <div key={category.title} className="space-y-4">
          <h2 className="text-lg font-semibold">{category.title}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {category.reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="group rounded-lg border bg-card p-6 shadow-sm transition-colors duration-150 hover:border-emerald-200 hover:bg-emerald-50/30"
              >
                <report.icon className="size-8 text-muted-foreground transition-colors group-hover:text-emerald-600" />
                <h3 className="mt-4 text-sm font-semibold">{report.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {report.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
