"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent"
          >
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-semibold">
              {activeOrg?.name?.[0]?.toUpperCase() || "D"}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-sidebar-accent-foreground">
                {activeOrg?.name || "Select org"}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/50">
                {activeOrg?.slug || ""}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/40" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] min-w-52"
          align="start"
        >
          {orgs.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => switchOrg(org)}
              className="gap-2 justify-between"
            >
              <span className="truncate">{org.name}</span>
              {org.id === activeOrg?.id && (
                <Check className="size-3.5 shrink-0 text-emerald-600" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setCreateOpen(true)}
            className="gap-2 text-muted-foreground"
          >
            <Plus className="size-3.5" />
            New organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
