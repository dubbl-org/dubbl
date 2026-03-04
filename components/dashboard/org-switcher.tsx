"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { CreateOrgDialog } from "./create-org-dialog";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
}

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    fetch("/api/v1/organization")
      .then((r) => r.json())
      .then((data) => {
        if (data.organizations) {
          setOrgs(data.organizations);
          if (data.organizations.length > 0) {
            const stored = localStorage.getItem("activeOrgId");
            const found = data.organizations.find(
              (o: Org) => o.id === stored
            );
            setActiveOrg(found || data.organizations[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  function switchOrg(org: Org) {
    setActiveOrg(org);
    localStorage.setItem("activeOrgId", org.id);
    window.location.reload();
  }

  const otherOrgs = orgs.filter((o) => o.id !== activeOrg?.id);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent"
          >
            <div className="flex size-7 items-center justify-center rounded bg-emerald-600 text-white text-[11px] font-medium">
              {activeOrg?.name?.[0]?.toUpperCase() || "D"}
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
                {activeOrg?.name || "Select org"}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/50">
                {activeOrg?.slug || ""}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/30" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
          align="start"
        >
          {activeOrg && (
            <div className="px-2 py-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded bg-emerald-600 text-white text-xs font-medium">
                  {activeOrg.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{activeOrg.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {activeOrg.slug} · {activeOrg.memberCount} {activeOrg.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
            </div>
          )}
          {otherOrgs.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                  Switch to
                </p>
                {otherOrgs.map((org) => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => switchOrg(org)}
                    className="gap-2.5"
                  >
                    <div className="flex size-6 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                      {org.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{org.name}</p>
                    </div>
                    {org.id === activeOrg?.id && (
                      <Check className="size-3.5 shrink-0 text-emerald-600" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            className="gap-2 text-muted-foreground"
          >
            <Plus className="size-4" />
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
