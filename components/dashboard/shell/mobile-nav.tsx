"use client";

import { Suspense } from "react";
import Link from "next/link";
import { DocumentsSidebar } from "@/components/dashboard/documents/browser/sidebar";
import { Logo } from "@/components/shared/logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { OrgSwitcher } from "@/components/dashboard/org-switcher";
import { UserMenu } from "@/components/dashboard/user-menu";
import { cn } from "@/lib/utils";
import { FOOTER_MODULES, MODULE_GROUPS } from "./nav";
import { PanelNav, useShellSections } from "./panel";
import { useShell } from "./shell-context";

/** Below `md` the rail and panel collapse into one drawer. */
export function ShellMobileNav() {
  const { mobileOpen, setMobileOpen } = useShell();
  const { pathname, mod, sections, fallbackLabel } = useShellSections();
  const close = () => setMobileOpen(false);

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-[288px] gap-0 bg-shell p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 shrink-0 items-center gap-2 px-4">
          <Logo className="h-4 w-auto" />
          <span className="text-[14px] font-semibold tracking-tight">dubbl</span>
        </div>
        <div className="px-2.5">
          <OrgSwitcher />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4 pt-3">
          {MODULE_GROUPS.map((group, i) => (
            <div key={i} className={cn("flex flex-col gap-px", i > 0 && "mt-4")}>
              {group.map((m) => {
                const Icon = m.icon;
                const active = mod?.key === m.key;
                return (
                  <Link
                    key={m.key}
                    href={m.href}
                    onClick={close}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-colors",
                      active
                        ? "bg-foreground/[0.055] font-medium text-foreground"
                        : "text-foreground/65 hover:bg-foreground/[0.035] hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                    {m.label}
                  </Link>
                );
              })}
            </div>
          ))}
          {mod?.key === "documents" ? (
            <div className="mt-6 border-t border-border/70 pt-4">
              <Suspense>
                <DocumentsSidebar onNavigate={close} />
              </Suspense>
            </div>
          ) : sections.length > 0 && (
            <div className="mt-6 border-t border-border/70 pt-4">
              <PanelNav
                sections={sections}
                pathname={pathname}
                fallbackLabel={fallbackLabel}
                onNavigate={close}
              />
            </div>
          )}
        </nav>
        <div className="flex shrink-0 items-center justify-between border-t border-border/70 px-3 py-2.5">
          <UserMenu />
          <div className="flex items-center gap-1">
            {FOOTER_MODULES.map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.key}
                  href={m.href}
                  onClick={close}
                  aria-label={m.label}
                  className="flex size-9 items-center justify-center rounded-[9px] text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground"
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </Link>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
