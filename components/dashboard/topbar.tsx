"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Plus, Menu } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useSidebar } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";

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
  // Sales subtabs
  "credit-notes": "Credit Notes",
  recurring: "Recurring",
  payments: "Payments",
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
  const entityTitle = useEntityTitle();
  const { toggleSidebar, isMobile } = useSidebar();
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

  // For entity detail pages like /projects/[id] or /accounting/banking/[id],
  // detect the pattern and show proper breadcrumbs
  const isEntityDetail = segments.length >= 2 && segments[0] in LABELS && !(segments[1] in LABELS);
  // Also detect nested entity detail: /accounting/banking/[id] where segments[2] is not a known label
  const isNestedEntityDetail = segments.length >= 3 && segments[0] in LABELS && segments[1] in LABELS && !(segments[2] in LABELS);
  let pageTitle: string;
  let parentLabel: string | null;
  let parentHref: string | null = null;

  if (isNestedEntityDetail) {
    parentLabel = LABELS[segments[1]] || segments[1];
    parentHref = `/${segments[0]}/${segments[1]}`;
    if (entityTitle) {
      pageTitle = entityTitle;
    } else {
      const subTab = segments.length > 3 ? segments[segments.length - 1] : null;
      pageTitle = subTab ? (LABELS[subTab] || subTab) : (LABELS[segments[1]] || segments[1]);
      if (!subTab) parentLabel = null;
    }
  } else if (isEntityDetail) {
    parentLabel = LABELS[segments[0]] || segments[0];
    parentHref = `/${segments[0]}`;
    if (entityTitle) {
      pageTitle = entityTitle;
    } else {
      const subTab = segments.length > 2 ? segments[segments.length - 1] : null;
      pageTitle = subTab ? (LABELS[subTab] || subTab) : (LABELS[segments[0]] || segments[0]);
      if (!subTab) parentLabel = null;
    }
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
      <div className="mx-auto flex h-14 w-full max-w-[1100px] items-center justify-between gap-2 px-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {isMobile && (
            <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={toggleSidebar}>
              <Menu className="size-4" />
            </Button>
          )}
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Logo className="h-5 w-auto" />
            <span className="text-[14px] font-semibold tracking-tight hidden sm:inline">dubbl</span>
          </Link>
          <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
          {parentLabel && effectiveSegments.length > 1 && (
            <div className="hidden sm:contents">
              {parentHref ? (
                <Link href={parentHref} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  {parentLabel}
                </Link>
              ) : (
                <span className="text-[13px] text-muted-foreground shrink-0">{parentLabel}</span>
              )}
              <span className="text-muted-foreground/40 shrink-0">/</span>
            </div>
          )}
          <h1 className="text-[13px] text-muted-foreground truncate">{pageTitle}</h1>
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
                <span className="hidden sm:inline">{cta.label}</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
