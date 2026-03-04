"use client";

import { useState, useEffect } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

interface Org {
  id: string;
  name: string;
  slug: string;
}

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-[rgba(255,255,255,0.08)]"
        >
          <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs font-semibold">
            {activeOrg?.name?.[0]?.toUpperCase() || "D"}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold text-white">
              {activeOrg?.name || "Select org"}
            </span>
            <span className="truncate text-xs text-[rgba(255,255,255,0.45)]">
              {activeOrg?.slug || ""}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-[rgba(255,255,255,0.35)]" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
        align="start"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => switchOrg(org)}
            className="gap-2"
          >
            <div className="flex size-5 items-center justify-center rounded-md bg-emerald-600 text-white text-[10px] font-semibold">
              {org.name[0]?.toUpperCase()}
            </div>
            <span>{org.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2">
          <div className="flex size-5 items-center justify-center rounded-md border border-dashed border-emerald-300 dark:border-emerald-800">
            <Plus className="size-3" />
          </div>
          <span className="text-muted-foreground">New organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
