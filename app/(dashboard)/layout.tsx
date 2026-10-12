"use client";

import { usePathname } from "next/navigation";
import { Topbar, TopbarActionProvider } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { OrgLoader } from "@/components/dashboard/org-loader";
import { CreateDrawerProvider } from "@/components/dashboard/create-drawer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShellProvider } from "@/components/dashboard/shell/shell-context";
import { ShellRail } from "@/components/dashboard/shell/rail";
import { ShellPanel } from "@/components/dashboard/shell/panel";
import { ShellMain } from "@/components/dashboard/shell/main";
import { ShellMobileNav } from "@/components/dashboard/shell/mobile-nav";
import { AssistantProvider } from "@/components/dashboard/assistant/assistant-context";
import { AssistantDock } from "@/components/dashboard/assistant/assistant-panel";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tilly and the file browser fill the sheet edge to edge and scroll on their own.
  const pathname = usePathname();
  const bare = pathname === "/assistant" || pathname === "/documents";
  return (
    <OrgLoader>
      <ShellProvider>
        <CreateDrawerProvider>
          <TooltipProvider delayDuration={150}>
            <AssistantProvider>
              <TopbarActionProvider>
                <div className="flex h-svh overflow-hidden bg-shell">
                  <ShellRail />
                  <ShellPanel />
                  <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
                    <ShellMain>
                      <Topbar />
                      <div
                        className={
                          bare
                            ? "flex min-h-0 w-full flex-1 flex-col"
                            : "w-full flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
                        }
                      >
                        {children}
                      </div>
                    </ShellMain>
                  </div>
                  <AssistantDock />
                </div>
                <ShellMobileNav />
                <CommandPalette />
              </TopbarActionProvider>
            </AssistantProvider>
          </TooltipProvider>
        </CreateDrawerProvider>
      </ShellProvider>
    </OrgLoader>
  );
}
