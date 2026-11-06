"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/query/use-api";
import { History } from "@/components/dashboard/assistant/history";
import { DocumentsSidebar } from "@/components/dashboard/documents/browser/sidebar";
import { STATIC_SUBNAV, findActiveHref, findModule, type SubnavSection } from "./nav";
import { useShell } from "./shell-context";

interface ProjectListItem {
  id: string;
  name: string;
  color: string;
}

const EMPTY_PROJECTS: ProjectListItem[] = [];

function useActiveProjects() {
  // Shell-wide, not part of whichever page is open, so it isn't learned for prefetching
  const { data, refetch } = useApi<{ data?: ProjectListItem[] }>("/api/v1/projects?status=active", { learn: false });

  useEffect(() => {
    const load = () => void refetch();
    window.addEventListener("projects-changed", load);
    return () => window.removeEventListener("projects-changed", load);
  }, [refetch]);

  return data?.data ?? EMPTY_PROJECTS;
}

export function PanelNav({
  sections,
  pathname,
  fallbackLabel,
  onNavigate,
}: {
  sections: SubnavSection[];
  pathname: string;
  fallbackLabel?: string;
  onNavigate?: () => void;
}) {
  const activeHref = findActiveHref(pathname, sections);

  return (
    <>
      {sections.map((section, i) => {
        const label = section.label ?? (i === 0 ? fallbackLabel : undefined);
        return (
          <div key={section.label ?? i} className={cn(i > 0 && "mt-5")}>
            {label && (
              <p className="px-2.5 pb-1.5 text-[12px] text-muted-foreground/75">{label}</p>
            )}
            <div className="flex flex-col gap-px">
              {section.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-[7px] px-2.5 text-[13.5px] tracking-[-0.005em] transition-colors",
                      active
                        ? "bg-foreground/[0.055] font-medium text-foreground"
                        : "text-foreground/65 hover:bg-foreground/[0.035] hover:text-foreground"
                    )}
                  >
                    {item.dot && (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.dot }}
                      />
                    )}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge != null && (
                      <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground/70">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function useShellSections() {
  const pathname = usePathname();
  const { subnav } = useShell();
  const mod = findModule(pathname);
  const projects = useActiveProjects();

  let sections: SubnavSection[] = subnav ?? (mod ? STATIC_SUBNAV[mod.key] : undefined) ?? [];
  if (mod?.key === "projects") {
    sections = [
      { items: [{ href: "/projects", label: "All projects", exact: true }] },
      {
        label: "Active",
        items: projects.map((p) => ({
          href: `/projects/${p.id}`,
          label: p.name,
          dot: p.color || "#10b981",
        })),
      },
    ];
  }

  // Overview's first group needs no heading; elsewhere it names the module.
  const fallbackLabel = mod && mod.key !== "dashboard" ? mod.label : undefined;
  return { pathname, mod, sections, fallbackLabel };
}

export function ShellPanel() {
  const { pathname, mod, sections, fallbackLabel } = useShellSections();
  const { open: openDrawer } = useCreateDrawer();

  return (
    <aside data-shell="panel" className="hidden w-[232px] shrink-0 flex-col px-2.5 lg:flex">
      <div data-shell="panel-header" className="flex h-[60px] shrink-0 items-center">
        <OrgSwitcher />
      </div>
      {mod?.key === "documents" ? (
        <Suspense>
          <DocumentsSidebar className="min-h-0 flex-1" />
        </Suspense>
      ) : (
      <nav className="min-h-0 flex-1 overflow-y-auto pb-6 scrollbar-none">
        {mod?.key === "assistant" ? (
          <History className="h-full" />
        ) : (
          <PanelNav sections={sections} pathname={pathname} fallbackLabel={fallbackLabel} />
        )}
        {mod?.key === "projects" && (
          <button
            type="button"
            onClick={() => openDrawer("project")}
            className="mt-px flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.035] hover:text-foreground"
          >
            <Plus className="size-3.5" />
            New project
          </button>
        )}
      </nav>
      )}
    </aside>
  );
}
