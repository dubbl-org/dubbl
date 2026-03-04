"use client";

import { useCallback } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const LABELS: Record<string, string> = {
  dashboard: "Overview",
  transactions: "Transactions",
  accounts: "Accounts",
  reports: "Reports",
  settings: "Settings",
  members: "Members",
  billing: "Billing",
  "api-keys": "API Keys",
  currencies: "Currencies",
  "tax-rates": "Tax Rates",
  "trial-balance": "Trial Balance",
  "balance-sheet": "Balance Sheet",
  "income-statement": "Income Statement",
  "profit-and-loss": "Profit & Loss",
  "cash-flow": "Cash Flow",
  "general-ledger": "General Ledger",
  "aged-receivables": "Aged Receivables",
  "aged-payables": "Aged Payables",
  "budget-vs-actual": "Budget vs Actual",
  contacts: "Contacts",
  invoices: "Invoices",
  quotes: "Quotes",
  bills: "Bills",
  "purchase-orders": "Purchase Orders",
  expenses: "Expenses",
  banking: "Banking",
  budgets: "Budgets",
  inventory: "Inventory",
  projects: "Projects",
  "fixed-assets": "Fixed Assets",
  payroll: "Payroll",
  new: "New",
};

const CTA_MAP: Record<string, { label: string; href: string }> = {
  invoices: { label: "New Invoice", href: "/invoices/new" },
  quotes: { label: "New Quote", href: "/quotes/new" },
  bills: { label: "New Bill", href: "/bills/new" },
  expenses: { label: "New Expense", href: "/expenses/new" },
  transactions: { label: "New Entry", href: "/transactions/new" },
  accounts: { label: "New Account", href: "/accounts/new" },
  contacts: { label: "New Contact", href: "/contacts/new" },
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const segments = pathname.split("/").filter(Boolean);

  const pageTitle = LABELS[segments[segments.length - 1] || ""] || segments[segments.length - 1] || "Overview";
  const parentLabel = segments.length > 1 ? LABELS[segments[0]] || segments[0] : null;

  // Find contextual CTA based on first path segment
  const cta = CTA_MAP[segments[0]];

  const openCommandPalette = useCallback(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
    );
  }, []);

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between gap-2 border-b px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 !h-4" />
        <div className="flex items-center gap-2">
          {parentLabel && segments.length > 1 && (
            <>
              <span className="text-[13px] text-muted-foreground">{parentLabel}</span>
              <span className="text-muted-foreground/50">/</span>
            </>
          )}
          <h1 className="text-[15px] font-semibold">{pageTitle}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={openCommandPalette}
          className="hidden sm:flex items-center gap-2 text-muted-foreground text-xs h-7 px-2.5"
        >
          <Search className="size-3" />
          <span>Search...</span>
          <kbd className="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-0.5 rounded-md border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </Button>
        {cta && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => router.push(cta.href)}
          >
            <Plus className="size-3" />
            {cta.label}
          </Button>
        )}
      </div>
    </header>
  );
}
