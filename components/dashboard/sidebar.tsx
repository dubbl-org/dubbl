"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { useCreateDrawer } from "./create-drawer";
import { cn } from "@/lib/utils";

// Animated icons
import { GaugeIcon } from "@/components/ui/gauge";
import { FileTextIcon } from "@/components/ui/file-text";
import { CartIcon } from "@/components/ui/cart";
import { HandCoinsIcon } from "@/components/ui/hand-coins";
import { ArrowLeftRightAnimatedIcon } from "@/components/ui/arrow-left-right-animated";
import { LayersIcon } from "@/components/ui/layers";
import { ChartLineIcon } from "@/components/ui/chart-line";
import { SettingsIcon } from "@/components/ui/settings";
import { CircleHelpIcon } from "@/components/ui/circle-help";
import { ReceiptAnimatedIcon } from "@/components/ui/receipt-animated";
import { LandmarkAnimatedIcon } from "@/components/ui/landmark-animated";
import { UsersAnimatedIcon } from "@/components/ui/users-animated";
import { TargetIcon } from "@/components/ui/target";
import { FolderOpenIcon } from "@/components/ui/folder-open";
import { PercentAnimatedIcon } from "@/components/ui/percent-animated";

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
      { label: "Dashboard", href: "/dashboard", icon: GaugeIcon },
      { label: "Contacts", href: "/contacts", icon: HandCoinsIcon },
    ],
  },
  {
    label: "Financials",
    items: [
      { label: "Sales", href: "/sales", icon: FileTextIcon },
      { label: "Purchases", href: "/purchases", icon: CartIcon },
      { label: "Accounting", href: "/accounting", icon: ArrowLeftRightAnimatedIcon },
      { label: "Tax", href: "/tax", icon: PercentAnimatedIcon },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Teams", href: "/teams", icon: UsersAnimatedIcon },
      { label: "Inventory", href: "/inventory", icon: ReceiptAnimatedIcon },
      { label: "Payroll", href: "/payroll", icon: LandmarkAnimatedIcon },
    ],
  },
  {
    label: "",
    items: [
      { label: "CRM", href: "/crm", icon: TargetIcon },
      { label: "Documents", href: "/documents", icon: FolderOpenIcon },
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

function NavItemLink({ item, active, badge }: { item: NavItem; active: boolean; badge?: number }) {
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
        <span className="flex-1">{item.label}</span>
        {badge !== undefined && badge > 0 && (
          <span className="size-4 rounded-full bg-red-100 text-red-600 text-[9px] font-medium flex items-center justify-center shrink-0 dark:bg-red-950 dark:text-red-400">
            {badge}
          </span>
        )}
      </Link>
    </SidebarMenuItem>
  );
}

interface ProjectListItem {
  id: string;
  name: string;
  color: string;
  status: string;
  tasks?: { id: string; status: string; dueDate: string | null }[];
}

function ProjectsCollapsible({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(() => pathname.startsWith("/projects"));
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [hovered, setHovered] = useState(false);
  const iconRef = useRef<IconHandle>(null);
  const { open: openDrawer } = useCreateDrawer();

  useEffect(() => {
    if (hovered) iconRef.current?.startAnimation();
    else iconRef.current?.stopAnimation();
  }, [hovered]);

  const fetchProjects = () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/projects?status=active", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setProjects(data.data);
      })
      .catch(() => {});
  };

  // Prefetch on mount so data is ready when expanded
  useEffect(() => {
    fetchProjects();
  }, []);

  // Listen for project changes (create/delete/update)
  useEffect(() => {
    const handler = () => fetchProjects();
    window.addEventListener("projects-changed", handler);
    return () => window.removeEventListener("projects-changed", handler);
  }, []);

  const projectsActive = pathname === "/projects" || pathname.startsWith("/projects/");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            projectsActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
          )}
        >
          <LayersIcon ref={iconRef} size={16} className="shrink-0" />
          <span className="flex-1 text-left">Projects</span>
          <ChevronRight className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open && "rotate-90"
          )} />
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub className="mr-0">
          {projects.map((project) => {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const overdue = (project.tasks || []).filter(
              t => t.dueDate && new Date(t.dueDate) < now && t.status !== "done" && t.status !== "cancelled"
            ).length;
            return (
              <SidebarMenuSubItem key={project.id}>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  isActive={pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)}
                >
                  <Link href={`/projects/${project.id}`}>
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color || "#10b981" }}
                    />
                    <span className="truncate flex-1">{project.name}</span>
                    {overdue > 0 && (
                      <span className="size-4 rounded-full bg-red-100 text-red-600 text-[9px] font-medium flex items-center justify-center shrink-0">
                        {overdue}
                      </span>
                    )}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
          <SidebarMenuSubItem>
            <SidebarMenuSubButton
              size="sm"
              className="text-muted-foreground cursor-pointer"
              onClick={() => openDrawer("project")}
            >
              <Plus className="size-3.5" />
              <span>New project</span>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [overdueCounts, setOverdueCounts] = useState<{ sales: number; purchases: number }>({ sales: 0, purchases: 0 });

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/dashboard/alerts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setOverdueCounts({
          sales: data.overdueInvoices?.count || 0,
          purchases: data.overdueBills?.count || 0,
        });
      })
      .catch(() => {});
  }, []);

  const badgeMap: Record<string, number> = {
    "/sales": overdueCounts.sales,
    "/purchases": overdueCounts.purchases,
  };

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <OrgSwitcher />
      </SidebarHeader>

      <SidebarContent className="gap-0 px-2">
        {sections.map((section, i) => (
          <SidebarGroup key={section.label || `section-${i}`} className="px-0 py-1">
            {section.label && (
              <SidebarGroupLabel className="h-7 px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {section.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {section.label === "Operations" && (
                  <ProjectsCollapsible pathname={pathname} />
                )}
                {section.items.map((item) => (
                  <NavItemLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item.href)}
                    badge={badgeMap[item.href]}
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
