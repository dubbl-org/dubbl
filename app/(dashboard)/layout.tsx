"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { OrgLoader } from "@/components/dashboard/org-loader";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrgLoader>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="bg-content-bg">
          <Topbar />
          <div className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-6">
            {children}
          </div>
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </OrgLoader>
  );
}
