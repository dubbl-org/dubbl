"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  BookOpen,
  BarChart3,
  Settings,
  CreditCard,
  Users,
  Key,
  DollarSign,
  FileText,
  ShoppingCart,
  Receipt,
  Landmark,
  Wallet,
  Package,
  FolderKanban,
  Building2,
  UserCheck,
  PiggyBank,
  Scale,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  PieChart,
  Activity,
  Layers,
  Calculator,
  Clock,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface NavSection {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const overviewItem: NavItem = {
  label: "Overview",
  href: "/dashboard",
  icon: LayoutDashboard,
};

const sections: NavSection[] = [
  {
    label: "Money In",
    icon: TrendingUp,
    items: [
      { label: "Invoices", href: "/invoices", icon: FileText },
      { label: "Quotes", href: "/quotes", icon: Receipt },
    ],
  },
  {
    label: "Money Out",
    icon: TrendingDown,
    items: [
      { label: "Bills", href: "/bills", icon: ShoppingCart },
      { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
      { label: "Expenses", href: "/expenses", icon: Wallet },
    ],
  },
  {
    label: "Accounting",
    icon: Calculator,
    items: [
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
      { label: "Chart of Accounts", href: "/accounts", icon: BookOpen },
      { label: "Banking", href: "/banking", icon: Landmark },
      { label: "Budgets", href: "/budgets", icon: PiggyBank },
    ],
  },
  {
    label: "Reports",
    icon: PieChart,
    items: [
      { label: "Profit & Loss", href: "/reports/profit-and-loss", icon: TrendingUp },
      { label: "Balance Sheet", href: "/reports/balance-sheet", icon: Scale },
      { label: "Cash Flow", href: "/reports/cash-flow", icon: Activity },
      { label: "Income Statement", href: "/reports/income-statement", icon: BarChart3 },
      { label: "Trial Balance", href: "/reports/trial-balance", icon: Layers },
      { label: "General Ledger", href: "/reports/general-ledger", icon: BookOpen },
      { label: "Aged Receivables", href: "/reports/aged-receivables", icon: Clock },
      { label: "Aged Payables", href: "/reports/aged-payables", icon: Clock },
      { label: "Budget vs Actual", href: "/reports/budget-vs-actual", icon: BarChart3 },
    ],
  },
  {
    label: "Business",
    icon: Building2,
    items: [
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Projects", href: "/projects", icon: FolderKanban },
      { label: "Inventory", href: "/inventory", icon: Package },
      { label: "Fixed Assets", href: "/fixed-assets", icon: Building2 },
      { label: "Payroll", href: "/payroll", icon: UserCheck },
    ],
  },
];

const settingsItems: NavItem[] = [
  { label: "General", href: "/settings", icon: Settings },
  { label: "Members", href: "/settings/members", icon: Users },
  { label: "Billing", href: "/settings/billing", icon: CreditCard },
  { label: "API Keys", href: "/settings/api-keys", icon: Key },
  { label: "Currencies", href: "/settings/currencies", icon: DollarSign },
  { label: "Tax Rates", href: "/settings/tax-rates", icon: Scale },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionContainsActive(pathname: string, items: NavItem[]) {
  return items.some((item) => isActive(pathname, item.href));
}

function NavItemLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "h-8 rounded-lg text-[13px] transition-colors",
          active
            ? "bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-950/40 dark:text-emerald-300"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Link href={item.href}>
          <item.icon className="size-4" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function CollapsibleNavGroup({ section }: { section: NavSection }) {
  const pathname = usePathname();
  const hasActive = sectionContainsActive(pathname, section.items);
  const [open, setOpen] = useState(hasActive);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="py-0">
        <SidebarGroupLabel
          asChild
          className="h-8 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 cursor-pointer select-none"
        >
          <CollapsibleTrigger className="flex w-full items-center gap-2">
            <section.icon className="size-3.5" />
            <span className="flex-1 text-left">{section.label}</span>
            <ChevronRight
              className={cn(
                "size-3.5 group-chevron transition-transform duration-200",
                open && "rotate-90"
              )}
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="pl-1">
              {section.items.map((item) => (
                <NavItemLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {/* Overview - standalone */}
        <SidebarGroup className="py-1">
          <SidebarGroupContent>
            <SidebarMenu>
              <NavItemLink
                item={overviewItem}
                active={isActive(pathname, overviewItem.href)}
              />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator className="mx-2" />

        {/* Collapsible sections */}
        {sections.map((section) => (
          <CollapsibleNavGroup key={section.label} section={section} />
        ))}

        <SidebarSeparator className="mx-2" />

        {/* Settings section */}
        <CollapsibleNavGroup
          section={{
            label: "Settings",
            icon: Settings,
            items: settingsItems,
          }}
        />
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
