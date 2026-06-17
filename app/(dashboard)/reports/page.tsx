"use client";

import Link from "next/link";
import {
  BarChart3,
  Scale,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BookOpen,
  Target,
  Clock,
  ArrowDownUp,
  Receipt,
  ArrowLeftRight,
  Gauge,
  Layers,
  Compass,
  Users,
  CalendarDays,
  GitCompareArrows,
  ShoppingBag,
  Timer,
  Copy,
  Building2,
  FileText,
  Sparkles,
  Package2,
  FileCheck2,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

const reportCategories = [
  {
    title: "The big picture",
    description: "Start-here summaries of how the business is doing.",
    reports: [
      {
        title: "Quick health check",
        description: "One page of key numbers this period next to last period, so you can see what changed at a glance.",
        href: "/reports/executive-summary",
        icon: Sparkles,
      },
      {
        title: "Money in vs money out",
        description: "What you earned minus what you spent over a period (also called profit & loss).",
        href: "/reports/profit-and-loss",
        icon: TrendingUp,
      },
      {
        title: "What you own and owe",
        description: "Everything the business owns and owes on a chosen date (also called a balance sheet).",
        href: "/reports/balance-sheet",
        icon: BarChart3,
      },
      {
        title: "Where your cash went",
        description: "How cash moved in and out over a period — from day-to-day trading, buying/selling things, and funding.",
        href: "/reports/cash-flow",
        icon: ArrowDownUp,
      },
      {
        title: "Download a report bundle",
        description: "Get the main reports for a period in one spreadsheet — handy for your accountant, bank, or tax time.",
        href: "/reports/pack",
        icon: Package2,
      },
    ],
  },
  {
    title: "Profit & spending",
    description: "Dig into earnings, costs, and how you compare over time.",
    reports: [
      {
        title: "Profit by team or project",
        description: "See money in vs money out split by department or project, side by side.",
        href: "/reports/tracking",
        icon: Layers,
      },
      {
        title: "Compare two periods side by side",
        description: "Put this period's earnings and costs next to another period to spot the change.",
        href: "/reports/pnl-comparison",
        icon: ArrowLeftRight,
      },
      {
        title: "Budget vs what actually happened",
        description: "See where you came in over or under your plan.",
        href: "/reports/budget-vs-actual",
        icon: Target,
      },
      {
        title: "Where the money is spent",
        description: "Your spending grouped by category, with trends and averages.",
        href: "/reports/expense-analytics",
        icon: TrendingDown,
      },
      {
        title: "Profit by customer",
        description: "What each customer brought in minus what serving them cost.",
        href: "/reports/profitability",
        icon: Users,
      },
      {
        title: "Who you spend the most with",
        description: "Your biggest suppliers ranked by total spend for the period.",
        href: "/reports/vendor-spend",
        icon: ShoppingBag,
      },
    ],
  },
  {
    title: "Getting paid & paying",
    description: "Track what's owed to you and what you owe.",
    reports: [
      {
        title: "Who owes you (and how late)",
        description: "Unpaid customer invoices grouped by how overdue they are.",
        href: "/reports/aged-receivables",
        icon: Clock,
      },
      {
        title: "What you owe (and when it's due)",
        description: "Unpaid supplier bills grouped by how soon they're due.",
        href: "/reports/aged-payables",
        icon: DollarSign,
      },
      {
        title: "How fast you get paid",
        description: "Average time customers take to pay you and you take to pay suppliers.",
        href: "/reports/payment-performance",
        icon: Timer,
      },
      {
        title: "Possible double-ups",
        description: "Find invoices or bills that may have been entered twice.",
        href: "/reports/duplicate-detection",
        icon: Copy,
      },
    ],
  },
  {
    title: "Tax time",
    description: "Reports for filing your sales tax and vendor forms.",
    reports: [
      {
        title: "Sales tax / VAT / GST return",
        description: "The figures for your tax return, box by box — open any box to see what's behind the number.",
        href: "/reports/vat-return",
        icon: FileCheck2,
      },
      {
        title: "Tax collected vs tax paid",
        description: "Tax you charged customers vs tax you paid suppliers, by tax rate.",
        href: "/reports/tax-summary",
        icon: Receipt,
      },
      {
        title: "1099 vendor totals (US)",
        description: "Total non-card payments to each 1099 contractor for the year, with who crosses the filing threshold.",
        href: "/reports/1099",
        icon: FileText,
      },
    ],
  },
  {
    title: "Planning ahead",
    description: "Look forward and keep an eye on key signals.",
    reports: [
      {
        title: "Cash coming up",
        description: "A forward look at expected money in and out from invoices, bills, and repeating items.",
        href: "/reports/cash-flow-forecast",
        icon: Compass,
      },
      {
        title: "What's due soon",
        description: "Upcoming invoice due dates, bill payments, and repeating events on a calendar.",
        href: "/reports/financial-calendar",
        icon: CalendarDays,
      },
      {
        title: "Business health signals",
        description: "Quick ratios like how easily you can cover bills and how strong your margins are.",
        href: "/reports/financial-ratios",
        icon: Gauge,
      },
    ],
  },
  {
    title: "For your accountant",
    description: "The detailed, line-by-line views accountants expect.",
    reports: [
      {
        title: "Account balances check",
        description: "Every account's balance on a chosen date, with optional earlier dates to compare (also called a trial balance).",
        href: "/reports/trial-balance",
        icon: Scale,
      },
      {
        title: "Every transaction, by account",
        description: "All bookkeeping entries grouped by account with a running balance (also called the general ledger).",
        href: "/reports/general-ledger",
        icon: BookOpen,
      },
      {
        title: "What you own and owe — compared",
        description: "Two dates of what you own and owe, side by side, to show what moved.",
        href: "/reports/comparative-balance-sheet",
        icon: GitCompareArrows,
      },
      {
        title: "Combined view across companies",
        description: "Roll up the numbers from several companies into one set of statements.",
        href: "/reports/consolidation",
        icon: Building2,
      },
    ],
  },
];

export default function ReportsPage() {
  useDocumentTitle("Reports · Overview");
  return (
    <ContentReveal>
      <div className="space-y-6 sm:space-y-10">
        {reportCategories.map((category, i) => (
          <div key={category.title}>
            {i > 0 && <div className="mb-6 sm:mb-10 h-px bg-border" />}
            <Section title={category.title} description={category.description}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                {category.reports.map((report) => (
                  <Link
                    key={report.href}
                    href={report.href}
                    className="group rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 sm:p-6 shadow-sm transition-all duration-150 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5"
                  >
                    <div className="flex size-9 sm:size-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                      <report.icon className="size-4 sm:size-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="mt-3 sm:mt-4 text-sm font-semibold">{report.title}</h3>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                      {report.description}
                    </p>
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        ))}
      </div>
    </ContentReveal>
  );
}
