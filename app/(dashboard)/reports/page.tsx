"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Scale,
  PieChart,
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
  FileSpreadsheet,
  Globe,
  MapPin,
  Calculator,
} from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { ContentReveal } from "@/components/ui/content-reveal";

const reportCategories = [
  {
    title: "Financial",
    description: "Core financial statements and budget analysis.",
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
      {
        title: "P&L Comparison",
        description: "Side-by-side period comparison with change amounts and percentages.",
        href: "/reports/pnl-comparison",
        icon: ArrowLeftRight,
      },
      {
        title: "Cash Flow Forecast",
        description: "Forward-looking projection from invoices, bills, and recurring templates.",
        href: "/reports/cash-flow-forecast",
        icon: Compass,
      },
      {
        title: "Contact Profitability",
        description: "Revenue minus costs per customer for the period.",
        href: "/reports/profitability",
        icon: Users,
      },
      {
        title: "Comparative Balance Sheet",
        description: "Period-over-period balance sheet comparison.",
        href: "/reports/comparative-balance-sheet",
        icon: GitCompareArrows,
      },
      {
        title: "Financial Calendar",
        description: "Upcoming invoice due dates, bill payments, and recurring events.",
        href: "/reports/financial-calendar",
        icon: CalendarDays,
      },
      {
        title: "Consolidation",
        description: "Combined financial statements across multiple entities.",
        href: "/reports/consolidation",
        icon: Building2,
      },
    ],
  },
  {
    title: "Tax & Analytics",
    description: "Tax reporting, expense breakdowns, and financial KPIs.",
    reports: [
      {
        title: "Tax Summary",
        description: "Output tax vs input tax by tax rate for the period.",
        href: "/reports/tax-summary",
        icon: Receipt,
      },
      {
        title: "Expense Analytics",
        description: "Spending by category with trends and averages.",
        href: "/reports/expense-analytics",
        icon: Layers,
      },
      {
        title: "Financial Ratios",
        description: "Current ratio, margins, DSO, DPO, and more KPIs.",
        href: "/reports/financial-ratios",
        icon: Gauge,
      },
      {
        title: "Vendor Spend Analysis",
        description: "Top suppliers by total spend for the period.",
        href: "/reports/vendor-spend",
        icon: ShoppingBag,
      },
      {
        title: "Payment Performance",
        description: "Average collection and payment times by contact.",
        href: "/reports/payment-performance",
        icon: Timer,
      },
      {
        title: "Duplicate Detection",
        description: "Find potential duplicate invoices and bills.",
        href: "/reports/duplicate-detection",
        icon: Copy,
      },
    ],
  },
  {
    title: "Sales",
    description: "Receivables aging and customer analysis.",
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
    description: "Payables aging and supplier analysis.",
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
    description: "Trial balance, general ledger, and account details.",
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

const EU_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

function getTaxReports(countryCode: string | null) {
  if (!countryCode) return [];

  const reports: { title: string; description: string; href: string; icon: typeof Receipt }[] = [];

  if (countryCode === "GB" || EU_COUNTRIES.includes(countryCode)) {
    reports.push({
      title: "VAT Return",
      description: "UK/EU VAT Return with boxes 1-9.",
      href: "/reports/vat-return",
      icon: Globe,
    });
  }

  if (countryCode === "AU") {
    reports.push({
      title: "Business Activity Statement",
      description: "Australian BAS with GST calculations.",
      href: "/reports/bas",
      icon: FileSpreadsheet,
    });
  }

  if (countryCode === "US") {
    reports.push(
      {
        title: "Sales Tax Report",
        description: "Sales tax collected by state and jurisdiction.",
        href: "/reports/sales-tax",
        icon: MapPin,
      },
      {
        title: "Schedule C",
        description: "US Schedule C tax filing preparation.",
        href: "/reports/schedule-c",
        icon: Calculator,
      }
    );
  }

  return reports;
}

export default function ReportsPage() {
  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/organization", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.countryCode) setCountryCode(data.countryCode);
      })
      .catch(() => {});
  }, []);

  const taxReports = getTaxReports(countryCode);

  const allCategories = taxReports.length > 0
    ? reportCategories.map((cat) =>
        cat.title === "Tax & Analytics"
          ? { ...cat, reports: [...taxReports, ...cat.reports] }
          : cat
      )
    : reportCategories;

  return (
    <ContentReveal>
      <div className="space-y-6 sm:space-y-10">
        {allCategories.map((category, i) => (
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
