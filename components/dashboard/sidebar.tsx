"use client";

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
} from "@/components/ui/sidebar";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

const mainNav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
  { label: "Accounts", href: "/accounts", icon: BookOpen },
];

const salesNav = [
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Quotes", href: "/quotes", icon: Receipt },
];

const purchasesNav = [
  { label: "Bills", href: "/bills", icon: ShoppingCart },
  { label: "Purchase Orders", href: "/purchase-orders", icon: Receipt },
];

const accountingNav = [
  { label: "Banking", href: "/banking", icon: Landmark },
  { label: "Expenses", href: "/expenses", icon: Wallet },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Budgets", href: "/budgets", icon: PiggyBank },
];

const advancedNav = [
  { label: "Inventory", href: "/inventory", icon: Package },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Fixed Assets", href: "/fixed-assets", icon: Building2 },
  { label: "Payroll", href: "/payroll", icon: UserCheck },
];

const settingsNav = [
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

function NavGroup({ label, items }: { label: string; items: typeof mainNav }) {
  const pathname = usePathname();
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/50">{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className={cn(
                    "rounded-lg transition-colors duration-150",
                    active
                      ? "bg-emerald-50 text-emerald-700 font-medium border-l-[3px] border-emerald-500 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-400"
                      : "hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20"
                  )}
                >
                  <Link href={item.href}>
                    {active && <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />}
                    <item.icon className={cn("size-4", active && "text-emerald-600 dark:text-emerald-400")} />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Main" items={mainNav} />
        <NavGroup label="Sales" items={salesNav} />
        <NavGroup label="Purchases" items={purchasesNav} />
        <NavGroup label="Accounting" items={accountingNav} />
        <NavGroup label="Advanced" items={advancedNav} />
        <NavGroup label="Settings" items={settingsNav} />
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
