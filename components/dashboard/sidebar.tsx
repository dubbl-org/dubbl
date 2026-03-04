"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

// Animated icons
import { GaugeIcon } from "@/components/ui/gauge";
import { FileTextIcon } from "@/components/ui/file-text";
import { ReceiptAnimatedIcon } from "@/components/ui/receipt-animated";
import { CartIcon } from "@/components/ui/cart";
import { HandCoinsIcon } from "@/components/ui/hand-coins";
import { ArrowLeftRightAnimatedIcon } from "@/components/ui/arrow-left-right-animated";
import { LayersIcon } from "@/components/ui/layers";
import { LandmarkAnimatedIcon } from "@/components/ui/landmark-animated";
import { ChartLineIcon } from "@/components/ui/chart-line";
import { SettingsIcon } from "@/components/ui/settings";
import { CircleHelpIcon } from "@/components/ui/circle-help";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnimatedIcon = React.ForwardRefExoticComponent<any>;

interface IconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: AnimatedIcon;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "",
    items: [
      { label: "Overview", href: "/dashboard", icon: GaugeIcon },
    ],
  },
  {
    label: "Money In",
    items: [
      { label: "Invoices", href: "/invoices", icon: FileTextIcon },
      { label: "Quotes", href: "/quotes", icon: ReceiptAnimatedIcon },
    ],
  },
  {
    label: "Money Out",
    items: [
      { label: "Bills", href: "/bills", icon: CartIcon },
      { label: "Expenses", href: "/expenses", icon: HandCoinsIcon },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRightAnimatedIcon },
      { label: "Accounts", href: "/accounts", icon: LayersIcon },
      { label: "Banking", href: "/banking", icon: LandmarkAnimatedIcon },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Reports", href: "/reports", icon: ChartLineIcon },
    ],
  },
];

const footerItems: NavItem[] = [
  { label: "Settings", href: "/settings", icon: SettingsIcon },
  { label: "Help", href: "/help", icon: CircleHelpIcon },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItemLink({ item, active }: { item: NavItem; active: boolean }) {
  const [hovered, setHovered] = useState(false);
  const iconRef = useRef<IconHandle>(null);
  const IconComp = item.icon;

  useEffect(() => {
    if (hovered) {
      iconRef.current?.startAnimation();
    } else {
      iconRef.current?.stopAnimation();
    }
  }, [hovered]);

  return (
    <SidebarMenuItem
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
        )}
      >
        <IconComp ref={iconRef} size={16} className="shrink-0" />
        <span>{item.label}</span>
      </Link>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="none">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label || "overview"} className="px-0 py-1">
            {section.label && (
              <SidebarGroupLabel className="h-7 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
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

      <SidebarFooter className="px-2">
        <SidebarMenu className="gap-0.5">
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
