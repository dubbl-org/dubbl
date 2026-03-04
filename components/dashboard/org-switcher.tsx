"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Plus, ArrowLeftRight, Settings, Users, Check, CreditCard } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateOrgDialog } from "./create-org-dialog";
import { useRouter } from "next/navigation";

interface Org {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrg, setActiveOrg] = useState<Org | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const router = useRouter();

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
  const orgDisplayName = activeOrg?.name || activeOrg?.slug || "";
  const orgInitial = (activeOrg?.name?.[0] || activeOrg?.slug?.[0] || "D").toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-sidebar-border hover:bg-muted data-[state=open]:border-sidebar-border data-[state=open]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <div className="flex size-6 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-semibold text-white">
              {orgInitial}
            </div>
            <span className="flex-1 truncate text-[13px] font-medium text-sidebar-accent-foreground">
              {orgDisplayName}
            </span>
            {activeOrg && (
              <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {ROLE_LABELS[activeOrg.role] || activeOrg.role}
              </span>
            )}
            <ChevronDown className="size-3 text-sidebar-foreground/40" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="!w-[15rem] p-0 overflow-hidden"
          align="start"
          sideOffset={6}
        >
          {/* Org info header */}
          {activeOrg && (
            <div className="border-b border-border px-3 py-3">
              <div className="flex items-center justify-between">
                <p className="truncate text-[13px] font-semibold">{activeOrg.name || activeOrg.slug}</p>
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                  {ROLE_LABELS[activeOrg.role] || activeOrg.role}
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{activeOrg.slug}</p>
            </div>
          )}

          {/* Actions with inline data */}
          <div className="p-1">
            <DropdownMenuItem
              onClick={() => router.push("/settings")}
              className="gap-2 text-[13px]"
            >
              <Settings className="size-3.5" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/settings/members")}
              className="gap-2 text-[13px]"
            >
              <Users className="size-3.5" />
              Members
              {activeOrg && (
                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                  {activeOrg.memberCount}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/settings/billing")}
              className="gap-2 text-[13px]"
            >
              <CreditCard className="size-3.5" />
              Billing
              <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                Free
              </span>
            </DropdownMenuItem>

            {otherOrgs.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 text-[13px]">
                    <ArrowLeftRight className="size-3.5" />
                    Switch organization
                    <span className="ml-auto pr-1 text-[11px] tabular-nums text-muted-foreground">
                      {otherOrgs.length}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-44" sideOffset={8}>
                    {otherOrgs.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        onClick={() => switchOrg(org)}
                        className="gap-2"
                      >
                        <div className="flex size-5 items-center justify-center rounded bg-muted text-[9px] font-semibold text-muted-foreground">
                          {(org.name?.[0] || org.slug?.[0] || "?").toUpperCase()}
                        </div>
                        <span className="flex-1 truncate text-[13px]">{org.name || org.slug}</span>
                        {org.id === activeOrg?.id && (
                          <Check className="size-3 shrink-0 text-emerald-600" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setCreateOpen(true)}
              className="gap-2 text-[13px] text-muted-foreground"
            >
              <Plus className="size-3.5" />
              New organization
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
