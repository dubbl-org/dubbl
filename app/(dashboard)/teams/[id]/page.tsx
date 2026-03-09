"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Users,
  Plus,
  Trash2,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  members: TeamMember[];
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
}

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const fetchTeam = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/teams/${teamId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setTeam(data.data || data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const fetchOrgMembers = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoadingMembers(true);

    fetch("/api/v1/members", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const members = data.members || data.data || [];
        setOrgMembers(members.map((m: { id: string; userName?: string; userEmail?: string; name?: string; email?: string }) => ({
          id: m.id,
          name: m.userName || m.name || "",
          email: m.userEmail || m.email || "",
        })));
      })
      .finally(() => {
        setLoadingMembers(false);
      });
  }, []);

  function handleOpenPopover() {
    setPopoverOpen(true);
    fetchOrgMembers();
  }

  async function handleAddMember(memberId: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setAddingMemberId(memberId);

    try {
      const res = await fetch(`/api/v1/teams/${teamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ memberId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to add member");
      }

      toast.success("Member added");
      setPopoverOpen(false);
      fetchTeam();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddingMemberId(null);
    }
  }

  async function handleRemoveMember(memberId: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRemovingMemberId(memberId);

    try {
      const res = await fetch(`/api/v1/teams/${teamId}/members?memberId=${memberId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove member");
      }

      toast.success("Member removed");
      fetchTeam();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  if (loading) return <BrandLoader />;

  if (!team) {
    return (
      <ContentReveal className="space-y-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium">Team not found</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => router.push("/teams")}
          >
            <ArrowLeft className="mr-2 size-3.5" />
            Back to Teams
          </Button>
        </div>
      </ContentReveal>
    );
  }

  // Filter out members already in the team
  const teamMemberIds = new Set(team.members.map((m) => m.id));
  const availableMembers = orgMembers.filter((m) => !teamMemberIds.has(m.id));

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => router.push("/teams")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="size-3 rounded-full shrink-0"
            style={{ backgroundColor: team.color || "#6b7280" }}
          />
          <h1 className="text-lg font-semibold truncate">{team.name}</h1>
        </div>
      </div>

      {team.description && (
        <p className="text-sm text-muted-foreground">{team.description}</p>
      )}

      {/* Stats */}
      <motion.div {...anim(0)} className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" />
          <span className="text-[11px] font-medium uppercase tracking-wide">Members</span>
        </div>
        <p className="mt-2 text-2xl font-bold font-mono tabular-nums truncate">
          {team.members.length}
        </p>
      </motion.div>

      {/* Members section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Team Members</h3>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={handleOpenPopover}
              >
                <Plus className="size-3" />
                Add Member
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <p className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                Select a member to add
              </p>
              {loadingMembers ? (
                <div className="flex items-center justify-center py-6">
                  <div className="brand-loader" aria-label="Loading">
                    <div className="brand-loader-circle brand-loader-circle-1" />
                    <div className="brand-loader-circle brand-loader-circle-2" />
                  </div>
                </div>
              ) : availableMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No available members to add
                </p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {availableMembers.map((member) => (
                    <button
                      key={member.id}
                      disabled={addingMemberId === member.id}
                      onClick={() => handleAddMember(member.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left hover:bg-muted/50 transition-colors disabled:opacity-50"
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {getInitials(member.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{member.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {team.members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <Users className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No members yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add members to this team to get started.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {team.members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 px-4 py-3 first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={removingMemberId === member.id}
                  onClick={() => handleRemoveMember(member.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </ContentReveal>
  );
}
