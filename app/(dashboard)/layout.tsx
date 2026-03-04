"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { CommandPalette } from "@/components/dashboard/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-content-bg">
        <Topbar />
        <div className="flex-1 p-6">
          <div className="mx-auto max-w-[1100px]">{children}</div>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
