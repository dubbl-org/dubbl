"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Search, Plus, Menu } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { useShell } from "@/components/dashboard/shell/shell-context";
import { usePathname } from "next/navigation";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { NotificationDropdown } from "@/components/dashboard/notification-dropdown";
import { AssistantButton } from "@/components/dashboard/assistant/assistant-panel";

/* ------------------------------------------------------------------ */
/*  Custom topbar action slot                                          */
/* ------------------------------------------------------------------ */

// The setter and the value live in separate contexts: pages only read the
// stable setter, so publishing an action never re-renders the page itself.
const TopbarActionSetter = createContext<(node: ReactNode) => void>(() => {});
const TopbarActionValue = createContext<ReactNode>(null);

/** Wraps the dashboard so any page can put an action in the topbar. */
export function TopbarActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode>(null);
  const set = useCallback((node: ReactNode) => setAction(node), []);
  return (
    <TopbarActionSetter.Provider value={set}>
      <TopbarActionValue.Provider value={action}>{children}</TopbarActionValue.Provider>
    </TopbarActionSetter.Provider>
  );
}

/** Render a custom action in the topbar from any page. */
export function useTopbarAction(node: ReactNode) {
  const setAction = useContext(TopbarActionSetter);
  useLayoutEffect(() => {
    setAction(node);
    return () => setAction(null);
  }, [node, setAction]);
}

const LABELS: Record<string, string> = {
  // Top-level
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
  assistant: "Tilly",
  documents: "Documents",
  settings: "Settings",
  tax: "Tax",
  crm: "CRM",
  portal: "Customer Portal",
  // Contacts
  people: "People",
  duplicates: "Duplicates",
  consolidation: "Consolidation",
  // Sales
  invoices: "Invoices",
  quotes: "Quotes",
  receipts: "Cash Sales",
  "credit-notes": "Credit Notes",
  recurring: "Recurring",
  payments: "Payments",
  "customer-prepayments": "Prepayments",
  "revenue-schedules": "Revenue Schedules",
  new: "New",
  // Purchases
  bills: "Bills",
  expenses: "Expenses",
  orders: "Purchase Orders",
  requisitions: "Requisitions",
  "vendor-spend": "Vendor Spend",
  "debit-notes": "Supplier Credits",
  "goods-receipts": "Goods Received",
  // Accounting
  transactions: "Transactions",
  accounts: "Accounts",
  banking: "Banking",
  "fixed-assets": "Fixed Assets",
  budgets: "Budgets",
  reconcile: "Reconcile",
  loans: "Loans",
  "opening-balances": "Opening Balances",
  accruals: "Accruals",
  "recurring-journals": "Recurring Journals",
  "asset-categories": "Asset Categories",
  // Settings
  general: "General",
  members: "Members",
  roles: "Roles",
  billing: "Billing",
  advisors: "Advisors",
  pipelines: "Pipelines",
  "bank-rules": "Bank Rules",
  "approval-workflows": "Approvals",
  webhooks: "Webhooks",
  "api-keys": "API Keys",
  "audit-log": "Audit Log",
  "cost-centers": "Cost Centers",
  tags: "Tags",
  reminders: "Reminders",
  "document-templates": "Document Templates",
  currencies: "Currencies",
  "tax-rates": "Tax Rates",
  // Payroll
  employees: "Employees",
  runs: "Pay Runs",
  contractors: "Contractors",
  "time-leave": "Time & Leave",
  compensation: "Compensation",
  timesheets: "Timesheets",
  payslips: "Payslips",
  "tax-forms": "Tax Forms",
  leave: "Leave",
  reviews: "Reviews",
  pay: "Pay",
  "tax-liabilities": "Tax Liabilities",
  // Reports
  "trial-balance": "Trial Balance",
  "balance-sheet": "Balance Sheet",
  "comparative-balance-sheet": "Comparative Balance Sheet",
  "income-statement": "Income Statement",
  "profit-and-loss": "Profit & Loss",
  "pnl-comparison": "P&L Comparison",
  "cash-flow": "Cash Flow",
  "cash-flow-forecast": "Cash Flow Forecast",
  "general-ledger": "General Ledger",
  "aged-receivables": "Aged Receivables",
  "aged-payables": "Aged Payables",
  "budget-vs-actual": "Budget vs Actual",
  "financial-ratios": "Financial Ratios",
  "financial-calendar": "Financial Calendar",
  "payment-performance": "Payment Performance",
  "expense-analytics": "Expense Analytics",
  profitability: "Profitability",
  "tax-summary": "Tax Summary",
  "executive-summary": "Executive Summary",
  pack: "Report Pack",
  tracking: "Tracking",
  saved: "Saved Reports",
  schedules: "Schedules",
  "bank-reconciliation-status": "Reconciliation Status",
  "bank-cash-flow": "Bank Cash Flow",
  "1099": "1099 Totals",
  "sales-by-customer": "Sales by Customer",
  "sales-by-item": "Sales by Item",
  forecasting: "Forecasting",
  custom: "Custom Reports",
  "report-schedules": "Report Schedules",
  scheduled: "Scheduled",
  // Inventory
  "stock-takes": "Stocktakes",
  warehouses: "Locations",
  valuation: "Stock value",
  categories: "Categories",
  transfers: "Transfers",
  alerts: "Reorder alerts",
  history: "History",
  suppliers: "Suppliers",
  bom: "Bills of materials",
  assembly: "Assembly orders",
  variants: "Variants",
  "landed-costs": "Landed costs",
  // CRM
  deals: "Deals",
  activities: "Activities",
  analytics: "Analytics",
  "duplicate-detection": "Duplicate Detection",
  // Documents
  unlinked: "Not Attached",
  attachments: "Attached to Records",
  emails: "Sent Emails",
  // Projects
  tasks: "Tasks",
  milestones: "Milestones",
  notes: "Notes",
  team: "Team",
  teams: "Teams",
  time: "Time Tracking",
  // Tax
  "sales-tax": "Sales Tax",
  "schedule-c": "Schedule C",
  "vat-return": "VAT Return",
  bas: "BAS",
  periods: "Tax Periods",
  // Workflows
  workflows: "Workflows",
  "approval-requests": "Approval Requests",
  // Signatures
  signature: "Signature",
  sign: "Sign",
  // Misc
  "scheduled-payments": "Scheduled Payments",
  "self-service": "Self Service",
  statements: "Statements",
  imports: "Imports",
  batches: "Batches",
  docs: "Docs",
  admin: "Admin",
  "email-preview": "Email Preview",
  "import-export": "Import & Export",
  backups: "Backups",
  trash: "Trash",
  procurement: "Bill Matching",
  integrations: "Integrations",
  stripe: "Stripe",
  email: "Email Sending",
  "fiscal-years": "Financial Years",
};

function getLabel(segment: string): string {
  return LABELS[segment] || segment;
}

type DrawerType = "contact" | "project" | "invoice" | "bill" | "entry" | "inventory" | "quote" | "salesReceipt" | "purchaseOrder" | "expense" | "fixedAsset" | "budget" | "employee" | "creditNote" | "recurring" | "account" | "bankAccount" | "warehouse" | "stockTake" | "category" | "transfer" | "contractor" | "debitNote" | "customerCredit" | "loan" | "openingBalance" | "accrualSchedule" | "revenueSchedule" | "recurringJournal";

const CTA_MAP: Record<string, { label: string; drawer: DrawerType } | null> = {
  sales: { label: "New Invoice", drawer: "invoice" },
  "sales/quotes": { label: "New Quote", drawer: "quote" },
  "sales/receipts": { label: "New cash sale", drawer: "salesReceipt" },
  "sales/credit-notes": { label: "New Credit Note", drawer: "creditNote" },
  "sales/recurring": { label: "New Recurring", drawer: "recurring" },
  "sales/customer-prepayments": { label: "New prepayment", drawer: "customerCredit" },
  "sales/revenue-schedules": { label: "New revenue schedule", drawer: "revenueSchedule" },
  // Payments are recorded from an invoice ("Record payment"), not created here.
  "sales/payments": null,
  purchases: { label: "New Bill", drawer: "bill" },
  "purchases/expenses": { label: "New Expense", drawer: "expense" },
  "purchases/orders": { label: "New PO", drawer: "purchaseOrder" },
  "purchases/debit-notes": { label: "New supplier credit", drawer: "debitNote" },
  // These pages have their own create flow (or come from a purchase order)
  "purchases/requisitions": null,
  "purchases/goods-receipts": null,
  "purchases/landed-costs": null,
  "purchases/bills/recurring": null,
  "purchases/expenses/recurring": null,
  accounting: { label: "New Entry", drawer: "entry" },
  "accounting/accounts": { label: "New Account", drawer: "account" },
  "accounting/banking": { label: "New Account", drawer: "bankAccount" },
  "accounting/fixed-assets": { label: "New Asset", drawer: "fixedAsset" },
  "accounting/budgets": { label: "New Budget", drawer: "budget" },
  "accounting/loans": { label: "New loan", drawer: "loan" },
  "accounting/opening-balances": { label: "Set opening balances", drawer: "openingBalance" },
  "accounting/accruals": { label: "New accrual", drawer: "accrualSchedule" },
  "accounting/recurring-journals": { label: "New recurring journal", drawer: "recurringJournal" },
  "accounting/asset-categories": null,
  "accounting/banking/scheduled": null,
  "accounting/banking/batches": null,
  "accounting/fiscal-years": null,
  contacts: { label: "New Contact", drawer: "contact" },
  // These contact pages have their own actions (or none)
  "contacts/people": null,
  "contacts/statements": null,
  "contacts/portal": null,
  "contacts/duplicates": null,
  projects: { label: "New Project", drawer: "project" },
  inventory: { label: "New Item", drawer: "inventory" },
  "inventory/stock-takes": { label: "New Stock Take", drawer: "stockTake" },
  "inventory/warehouses": { label: "New Warehouse", drawer: "warehouse" },
  "inventory/transfers": { label: "New Transfer", drawer: "transfer" },
  "inventory/valuation": null,
  "inventory/categories": null,
  "inventory/alerts": null,
  "inventory/bom": null,
  "inventory/assembly": null,
  "payroll/employees": { label: "New Employee", drawer: "employee" },
  "payroll/contractors": { label: "Add Contractor", drawer: "contractor" },
  "payroll/time-leave": null,
  "payroll/compensation": null,
  "payroll/analytics": null,
  teams: null,
};

export function Topbar() {
  const customAction = useContext(TopbarActionValue);
  return <TopbarInner customAction={customAction} />;
}

function TopbarInner({ customAction }: { customAction: ReactNode }) {
  const pathname = usePathname();
  const { open: openDrawer } = useCreateDrawer();
  const entityTitle = useEntityTitle();
  const { setMobileOpen } = useShell();
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
    parentLabel = getLabel(segments[1]);
    parentHref = `/${segments[0]}/${segments[1]}`;
    if (entityTitle) {
      pageTitle = entityTitle;
    } else {
      const subTab = segments.length > 3 ? segments[segments.length - 1] : null;
      pageTitle = subTab ? (getLabel(subTab)) : (getLabel(segments[1]));
      if (!subTab) parentLabel = null;
    }
  } else if (isEntityDetail) {
    parentLabel = getLabel(segments[0]);
    parentHref = `/${segments[0]}`;
    if (entityTitle) {
      pageTitle = entityTitle;
    } else {
      const subTab = segments.length > 2 ? segments[segments.length - 1] : null;
      pageTitle = subTab ? (getLabel(subTab)) : (getLabel(segments[0]));
      if (!subTab) parentLabel = null;
    }
  } else {
    pageTitle = effectiveSegments[effectiveSegments.length - 1] ? getLabel(effectiveSegments[effectiveSegments.length - 1]) : "Overview";
    parentLabel = effectiveSegments.length > 1 ? getLabel(effectiveSegments[0]) : null;
  }

  // Most specific entry wins: /purchases/expenses/recurring before /purchases/expenses before /purchases
  const ctaKey = [segments.slice(0, 3).join("/"), segments.slice(0, 2).join("/"), segments[0]].find((k) => k in CTA_MAP);
  const cta = ctaKey ? CTA_MAP[ctaKey] : undefined;

  const openCommandPalette = useCallback(() => {
    document.dispatchEvent(new CustomEvent("open-command-palette"));
  }, []);

  return (
    <header data-shell="topbar" className="shrink-0 border-b border-border/70">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1.5 size-8 shrink-0 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" />
          </Button>
          <Link href="/dashboard" className="mr-1 shrink-0 md:hidden" aria-label="dubbl">
            <Logo className="h-4 w-auto" />
          </Link>
          {parentLabel && effectiveSegments.length > 1 && (
            <div className="hidden items-center gap-2 sm:flex">
              {parentHref ? (
                <Link href={parentHref} className="shrink-0 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground">
                  {parentLabel}
                </Link>
              ) : (
                <span className="shrink-0 text-[13.5px] text-muted-foreground">{parentLabel}</span>
              )}
              <span className="shrink-0 text-muted-foreground/40">/</span>
            </div>
          )}
          <h1 className="truncate text-[13.5px] font-medium tracking-[-0.005em]">{pageTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={openCommandPalette}
            className="mr-1 hidden h-8 w-56 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] sm:flex"
          >
            <Search className="size-3.5" />
            <span>Search</span>
            <kbd className="pointer-events-none ml-auto font-mono text-[11px] text-muted-foreground/70">
              &#8984;K
            </kbd>
          </button>
          <AssistantButton />
          <NotificationDropdown />
          {cta && (
            <Button
              size="sm"
              className="ml-1 h-8 gap-1.5 rounded-lg px-3 text-[13px]"
              onClick={() => openDrawer(cta.drawer)}
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">{cta.label}</span>
            </Button>
          )}
          {customAction && <div className="ml-1 flex items-center">{customAction}</div>}
        </div>
      </div>
    </header>
  );
}
