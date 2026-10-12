import {
  ArrowLeftRight,
  BookUser,
  ChartLine,
  CircleHelp,
  FileText,
  FolderOpen,
  Landmark,
  Layers,
  LayoutDashboard,
  Package,
  Percent,
  Settings,
  Sparkles,
  ShoppingCart,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface ShellModule {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Path prefixes owned by this module (defaults to `href`). */
  match?: string[];
}

export interface SubnavItem {
  href: string;
  label: string;
  exact?: boolean;
  badge?: string | number;
  title?: string;
  /** Optional colour dot, e.g. a project colour. */
  dot?: string;
}

export interface SubnavSection {
  label?: string;
  items: SubnavItem[];
}

/** Tilly gets its own spot at the top of the rail, drawn with its mark. */
export const ASSISTANT_MODULE: ShellModule = { key: "assistant", label: "Tilly", href: "/assistant", icon: Sparkles };

export const MODULE_GROUPS: ShellModule[][] = [
  [
    { key: "dashboard", label: "Overview", href: "/dashboard", icon: LayoutDashboard, match: ["/dashboard", "/notifications"] },
    { key: "contacts", label: "Contacts", href: "/contacts", icon: BookUser },
    { key: "sales", label: "Sales", href: "/sales", icon: FileText },
    { key: "purchases", label: "Purchases", href: "/purchases", icon: ShoppingCart },
    { key: "accounting", label: "Accounting", href: "/accounting", icon: ArrowLeftRight },
    { key: "tax", label: "Tax", href: "/tax", icon: Percent },
  ],
  [
    { key: "projects", label: "Projects", href: "/projects", icon: Layers },
    { key: "inventory", label: "Inventory", href: "/inventory", icon: Package },
    { key: "payroll", label: "Payroll", href: "/payroll", icon: Landmark },
    { key: "teams", label: "Teams", href: "/teams", icon: Users },
  ],
  [
    { key: "crm", label: "CRM", href: "/crm", icon: Target },
    { key: "documents", label: "Documents", href: "/documents", icon: FolderOpen },
    { key: "reports", label: "Reports", href: "/reports", icon: ChartLine },
  ],
];

export const FOOTER_MODULES: ShellModule[] = [
  { key: "help", label: "Help", href: "/docs", icon: CircleHelp },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];

const ALL_MODULES = [ASSISTANT_MODULE, ...MODULE_GROUPS.flat(), ...FOOTER_MODULES];

function owns(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function findModule(pathname: string): ShellModule | undefined {
  return ALL_MODULES.find((m) => (m.match ?? [m.href]).some((p) => owns(pathname, p)));
}

/** The single best-matching item, so `/sales` never lights up alongside `/sales/quotes`. */
export function findActiveHref(pathname: string, sections: SubnavSection[]): string | undefined {
  let best: string | undefined;
  for (const item of sections.flatMap((s) => s.items)) {
    const hit = item.exact ? pathname === item.href : owns(pathname, item.href);
    if (hit && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

/** Panel content for modules that don't register their own sub-navigation. */
export const STATIC_SUBNAV: Record<string, SubnavSection[]> = {
  dashboard: [
    {
      items: [
        { href: "/dashboard", label: "Overview", exact: true },
        { href: "/notifications", label: "Notifications" },
      ],
    },
    {
      label: "Reports",
      items: [
        { href: "/reports/profit-and-loss", label: "Profit and loss" },
        { href: "/reports/balance-sheet", label: "Balance sheet" },
        { href: "/reports/cash-flow", label: "Cash flow" },
        { href: "/reports/aged-receivables", label: "Aged receivables" },
        { href: "/reports/aged-payables", label: "Aged payables" },
      ],
    },
  ],
  reports: [
    { items: [{ href: "/reports", label: "All reports", exact: true }] },
    {
      label: "The big picture",
      items: [
        { href: "/reports/executive-summary", label: "Executive summary" },
        { href: "/reports/profit-and-loss", label: "Profit and loss" },
        { href: "/reports/balance-sheet", label: "Balance sheet" },
        { href: "/reports/cash-flow", label: "Cash flow" },
        { href: "/reports/pack", label: "Report pack" },
      ],
    },
    {
      label: "Profit and spending",
      items: [
        { href: "/reports/tracking", label: "Tracking" },
        { href: "/reports/pnl-comparison", label: "P&L comparison" },
        { href: "/reports/budget-vs-actual", label: "Budget vs actual" },
        { href: "/reports/expense-analytics", label: "Expense analytics" },
        { href: "/reports/profitability", label: "Profitability" },
        { href: "/reports/vendor-spend", label: "Vendor spend" },
        { href: "/reports/sales-by-customer", label: "Sales by customer" },
        { href: "/reports/sales-by-item", label: "Sales by item" },
      ],
    },
    {
      label: "Getting paid",
      items: [
        { href: "/reports/aged-receivables", label: "Aged receivables" },
        { href: "/reports/aged-payables", label: "Aged payables" },
        { href: "/reports/payment-performance", label: "Payment performance" },
        { href: "/reports/duplicate-detection", label: "Duplicate detection" },
      ],
    },
    {
      label: "Tax",
      items: [
        { href: "/reports/vat-return", label: "VAT return" },
        { href: "/reports/tax-summary", label: "Tax summary" },
        { href: "/reports/1099", label: "1099 totals" },
      ],
    },
    {
      label: "Planning",
      items: [
        { href: "/reports/cash-flow-forecast", label: "Cash flow forecast" },
        { href: "/reports/financial-calendar", label: "Financial calendar" },
        { href: "/reports/financial-ratios", label: "Financial ratios" },
      ],
    },
    {
      label: "For your accountant",
      items: [
        { href: "/reports/trial-balance", label: "Trial balance" },
        { href: "/reports/general-ledger", label: "General ledger" },
        { href: "/reports/comparative-balance-sheet", label: "Comparative balance sheet" },
        { href: "/reports/consolidation", label: "Consolidation" },
      ],
    },
    {
      label: "Saved and scheduled",
      items: [
        { href: "/reports/bank-reconciliation-status", label: "Reconciliation status" },
        { href: "/reports/bank-cash-flow", label: "Bank cash flow" },
        { href: "/reports/custom", label: "Custom reports" },
        { href: "/reports/saved", label: "Saved reports" },
        { href: "/reports/schedules", label: "Schedules" },
      ],
    },
  ],
};
