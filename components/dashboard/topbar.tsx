"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { usePathname } from "next/navigation";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";

const LABELS: Record<string, string> = {
  dashboard: "Overview",
  sales: "Sales",
  purchases: "Purchases",
  contacts: "Contacts",
  accounting: "Accounting",
  projects: "Projects",
  inventory: "Inventory",
  payroll: "Payroll",
  reports: "Reports",
  settings: "Settings",
  // Sales subtabs
  invoices: "Invoices",
  quotes: "Quotes",
  new: "New",
  // Purchases subtabs
  bills: "Bills",
  expenses: "Expenses",
  orders: "Purchase Orders",
  // Accounting subtabs
  transactions: "Transactions",
  accounts: "Accounts",
  banking: "Banking",
  "fixed-assets": "Fixed Assets",
  budgets: "Budgets",
  // Settings subtabs
  members: "Members",
  billing: "Billing",
  "api-keys": "API Keys",
  currencies: "Currencies",
  "tax-rates": "Tax Rates",
  "audit-log": "Audit Log",
  // Payroll sub-pages
  employees: "Employees",
  runs: "Pay Runs",
  // Reports sub-pages
  "trial-balance": "Trial Balance",
  "balance-sheet": "Balance Sheet",
  "income-statement": "Income Statement",
  "profit-and-loss": "Profit & Loss",
  "cash-flow": "Cash Flow",
  "general-ledger": "General Ledger",
  "aged-receivables": "Aged Receivables",
  "aged-payables": "Aged Payables",
  "budget-vs-actual": "Budget vs Actual",
  general: "General",
  time: "Time Tracking",
  // Project subtabs
  tasks: "Tasks",
  milestones: "Milestones",
  notes: "Notes",
  team: "Team",
};

const CTA_MAP: Record<string, { label: string; drawer: "contact" | "project" | "invoice" | "bill" | "entry" | "inventory" | "quote" | "purchaseOrder" | "expense" | "fixedAsset" | "budget" | "employee" }> = {
  sales: { label: "New Invoice", drawer: "invoice" },
  purchases: { label: "New Bill", drawer: "bill" },
  accounting: { label: "New Entry", drawer: "entry" },
  contacts: { label: "New Contact", drawer: "contact" },
  projects: { label: "New Project", drawer: "project" },
  inventory: { label: "New Item", drawer: "inventory" },
};

export function Topbar() {
  const pathname = usePathname();
  const { open: openDrawer } = useCreateDrawer();
  const segments = pathname.split("/").filter(Boolean);

  // For group roots, show the default subtab in the breadcrumb
  const DEFAULT_SUBTABS: Record<string, string> = {
    settings: "general",
    sales: "invoices",
    purchases: "bills",
    accounting: "transactions",
  };
  const defaultSub = segments.length === 1 ? DEFAULT_SUBTABS[segments[0]] : undefined;
  const effectiveSegments = defaultSub ? [segments[0], defaultSub] : segments;

  // For entity detail pages like /projects/[id] or /projects/[id]/time,
  // detect the pattern and show proper breadcrumbs
  const isEntityDetail = segments.length >= 2 && segments[0] in LABELS && !(segments[1] in LABELS);
  let pageTitle: string;
  let parentLabel: string | null;

  if (isEntityDetail) {
    // e.g. /projects/[id] → "Projects" or /projects/[id]/time → "Projects / Time Tracking"
    parentLabel = LABELS[segments[0]] || segments[0];
    const subTab = segments.length > 2 ? segments[segments.length - 1] : null;
    pageTitle = subTab ? (LABELS[subTab] || subTab) : (LABELS[segments[0]] || segments[0]);
    if (!subTab) parentLabel = null; // Don't show "Projects / Projects"
  } else {
    pageTitle = LABELS[effectiveSegments[effectiveSegments.length - 1] || ""] || effectiveSegments[effectiveSegments.length - 1] || "Overview";
    parentLabel = effectiveSegments.length > 1 ? LABELS[effectiveSegments[0]] || effectiveSegments[0] : null;
  }

  const cta = CTA_MAP[segments[0]];

  const openCommandPalette = useCallback(() => {
    document.dispatchEvent(new CustomEvent("open-command-palette"));
  }, []);

  return (
    <header className="shrink-0">
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-2 px-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo className="h-5 w-auto" />
            <span className="text-[14px] font-semibold tracking-tight">dubbl</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          {parentLabel && effectiveSegments.length > 1 && (
            <>
              <span className="text-[13px] text-muted-foreground">{parentLabel}</span>
              <span className="text-muted-foreground/40">/</span>
            </>
          )}
          <h1 className="text-[13px] text-muted-foreground">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="[&_button]:size-6 [&_button_svg]:size-3" />
          <div className="h-4 w-px bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={openCommandPalette}
            className="hidden sm:flex items-center gap-2 text-muted-foreground text-xs h-7 px-2.5"
          >
            <Search className="size-3" />
            <span>Search...</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </Button>
          {cta && (
            <>
              <div className="h-4 w-px bg-border" />
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => openDrawer(cta.drawer)}
              >
                <Plus className="size-3" />
                {cta.label}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
