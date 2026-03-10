"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Plus, Menu, Bell } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useSidebar } from "@/components/ui/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";

/* ------------------------------------------------------------------ */
/*  Custom topbar action slot                                          */
/* ------------------------------------------------------------------ */

const TopbarActionCtx = createContext<{
  setAction: (node: ReactNode) => void;
}>({ setAction: () => {} });

/** Render a custom action in the topbar from any page. */
export function useTopbarAction(node: ReactNode) {
  const { setAction } = useContext(TopbarActionCtx);
  useLayoutEffect(() => {
    setAction(node);
    return () => setAction(null);
  }, [node, setAction]);
}

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
  notifications: "Notifications",
  documents: "Documents",
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
  "document-templates": "Document Templates",
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
  custom: "Custom Reports",
  general: "General",
  time: "Time Tracking",
  // Inventory subtabs
  "stock-takes": "Stock Takes",
  warehouses: "Warehouses",
  valuation: "Valuation",
  categories: "Categories",
  transfers: "Transfers",
  alerts: "Alerts",
  history: "History",
  suppliers: "Suppliers",
  bom: "Bill of Materials",
  assembly: "Assembly Orders",
  variants: "Variants",
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

type DrawerType = "contact" | "project" | "invoice" | "bill" | "entry" | "inventory" | "quote" | "purchaseOrder" | "expense" | "fixedAsset" | "budget" | "employee" | "creditNote" | "recurring" | "account" | "bankAccount" | "warehouse" | "stockTake" | "category" | "transfer" | "contractor";

const CTA_MAP: Record<string, { label: string; drawer: DrawerType } | null> = {
  sales: { label: "New Invoice", drawer: "invoice" },
  "sales/quotes": { label: "New Quote", drawer: "quote" },
  "sales/credit-notes": { label: "New Credit Note", drawer: "creditNote" },
  "sales/recurring": { label: "New Recurring", drawer: "recurring" },
  purchases: { label: "New Bill", drawer: "bill" },
  "purchases/expenses": { label: "New Expense", drawer: "expense" },
  "purchases/orders": { label: "New PO", drawer: "purchaseOrder" },
  accounting: { label: "New Entry", drawer: "entry" },
  "accounting/accounts": { label: "New Account", drawer: "account" },
  "accounting/banking": { label: "New Account", drawer: "bankAccount" },
  "accounting/fixed-assets": { label: "New Asset", drawer: "fixedAsset" },
  "accounting/budgets": { label: "New Budget", drawer: "budget" },
  contacts: { label: "New Contact", drawer: "contact" },
  projects: { label: "New Project", drawer: "project" },
  inventory: { label: "New Item", drawer: "inventory" },
  "inventory/stock-takes": { label: "New Stock Take", drawer: "stockTake" },
  "inventory/warehouses": { label: "New Warehouse", drawer: "warehouse" },
  "inventory/transfers": { label: "New Transfer", drawer: "transfer" },
  "inventory/valuation": null,
  "payroll/employees": { label: "New Employee", drawer: "employee" },
  "payroll/contractors": { label: "Add Contractor", drawer: "contractor" },
  "payroll/time-leave": null,
  "payroll/compensation": null,
  "payroll/analytics": null,
  teams: null,
};

export function Topbar() {
  const [customAction, setCustomAction] = useState<ReactNode>(null);
  const stableSetAction = useCallback((n: ReactNode) => setCustomAction(n), []);

  return (
    <TopbarActionCtx.Provider value={{ setAction: stableSetAction }}>
      <TopbarInner customAction={customAction} />
    </TopbarActionCtx.Provider>
  );
}

function useUnreadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
    if (!orgId) return;
    fetch("/api/v1/notifications?unread=true&limit=1", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.unreadCount !== undefined) setCount(data.unreadCount); })
      .catch(() => {});
  }, []);
  return count;
}

function TopbarInner({ customAction }: { customAction: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const entityTitle = useEntityTitle();
  const { toggleSidebar, isMobile } = useSidebar();
  const segments = pathname.split("/").filter(Boolean);
  const unreadCount = useUnreadCount();

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

  const subtabKey = `${segments[0]}/${segments[1]}`;
  const cta = subtabKey in CTA_MAP ? CTA_MAP[subtabKey] : CTA_MAP[segments[0]];

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
          <Button
            variant="ghost"
            size="icon"
            className="relative size-7"
            onClick={() => router.push("/notifications")}
          >
            <Bell className="size-3.5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-medium text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
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
          {customAction && (
            <>
              <div className="h-4 w-px bg-border" />
              {customAction}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
