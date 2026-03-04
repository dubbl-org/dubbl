"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Receipt,
  ArrowLeftRight,
  Landmark,
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
} from "@/components/ui/sidebar";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

// Animated icons (lucide-animated)
import { GaugeIcon } from "@/components/ui/gauge";
import { FileTextIcon } from "@/components/ui/file-text";
import { CartIcon } from "@/components/ui/cart";
import { HandCoinsIcon } from "@/components/ui/hand-coins";
import { LayersIcon } from "@/components/ui/layers";
import { ChartLineIcon } from "@/components/ui/chart-line";
import { SettingsIcon } from "@/components/ui/settings";
import { CircleHelpIcon } from "@/components/ui/circle-help";

interface NavItem {
  label: string;
  href: string;
  icon?: LucideIcon;
  animatedIcon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "",
    items: [
      { label: "Overview", href: "/dashboard", animatedIcon: GaugeIcon },
    ],
  },
  {
    label: "Money In",
    items: [
      { label: "Invoices", href: "/invoices", animatedIcon: FileTextIcon },
      { label: "Quotes", href: "/quotes", icon: Receipt },
    ],
  },
  {
    label: "Money Out",
    items: [
      { label: "Bills", href: "/bills", animatedIcon: CartIcon },
      { label: "Expenses", href: "/expenses", animatedIcon: HandCoinsIcon },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight },
      { label: "Accounts", href: "/accounts", animatedIcon: LayersIcon },
      { label: "Banking", href: "/banking", icon: Landmark },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", href: "/reports", animatedIcon: ChartLineIcon },
    ],
  },
];

const footerItems: NavItem[] = [
  { label: "Settings", href: "/settings", animatedIcon: SettingsIcon },
  { label: "Help", href: "/help", animatedIcon: CircleHelpIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItemLink({ item, active }: { item: NavItem; active: boolean }) {
  const IconComponent = item.icon;
  const AnimatedIconComponent = item.animatedIcon;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "h-8 rounded-lg text-[13px] transition-colors",
          active
            ? "bg-[rgba(255,255,255,0.08)] text-white font-medium border-l-2 border-emerald-400"
            : "text-[rgba(255,255,255,0.65)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
        )}
      >
        <Link href={item.href}>
          {AnimatedIconComponent ? (
            <AnimatedIconComponent size={16} className="shrink-0" />
          ) : IconComponent ? (
            <IconComponent className="size-4 shrink-0" />
          ) : null}
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="shadow-[1px_0_0_rgba(255,255,255,0.06)]">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {sections.map((section) => (
          <SidebarGroup key={section.label || "overview"} className="py-1">
            {section.label && (
              <SidebarGroupLabel className="h-7 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.35)]">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {footerItems.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </SidebarMenu>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
