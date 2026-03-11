"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Trash2,
  ArrowLeft,
  Mail,
  UserPlus,
  Pencil,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/lib/hooks/use-confirm";

interface RawTeamMember {
  id: string;
  memberId: string;
  member?: {
    id: string;
    user?: { name?: string | null; email?: string | null };
    userName?: string;
    userEmail?: string;
  };
  name?: string;
  email?: string;
}

interface TeamMember {
  id: string;
  memberId: string;
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

const ACCENT_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

function getInitials(name: string | undefined | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalizeMembers(raw: RawTeamMember[]): TeamMember[] {
  return raw.map((m) => ({
    id: m.id,
    memberId: m.memberId || m.member?.id || m.id,
    name: m.member?.user?.name || m.member?.userName || m.name || "",
    email: m.member?.user?.email || m.member?.userEmail || m.email || "",
  }));
}

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.id as string;

  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editColor, setEditColor] = useState("#3b82f6");
  const [editSaving, setEditSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const fetchTeam = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/teams/${teamId}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const t = data.team || data.data || data;
        setTeam({
          ...t,
          members: normalizeMembers(t.members || []),
        });
      })
      .finally(() => setLoading(false));
  }, [teamId]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const membersFetchedRef = useRef(false);

  useEffect(() => {
    if (!popoverOpen || membersFetchedRef.current) return;
    membersFetchedRef.current = true;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoadingMembers(true);

    fetch("/api/v1/members?limit=500", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const members = data.members || data.data || [];
        setOrgMembers(
          members.map(
            (m: {
              id: string;
              userName?: string;
              userEmail?: string;
              name?: string;
              email?: string;
              user?: { name?: string; email?: string };
            }) => ({
              id: m.id,
              name: m.userName || m.user?.name || m.name || "",
              email: m.userEmail || m.user?.email || m.email || "",
            })
          )
        );
      })
      .finally(() => setLoadingMembers(false));
  }, [popoverOpen]);

  function openEdit() {
    if (!team) return;
    setEditName(team.name);
    setEditDesc(team.description || "");
    setEditColor(team.color || "#3b82f6");
    setEditOpen(true);
  }

  async function handleEdit() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/v1/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          color: editColor,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Team updated");
      setEditOpen(false);
      fetchTeam();
    } catch {
      toast.error("Failed to update team");
    } finally {
      setEditSaving(false);
    }
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
      membersFetchedRef.current = false;
      fetchTeam();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setAddingMemberId(null);
    }
  }

  async function handleRemoveMember(memberId: string) {
    const confirmed = await confirm({
      title: "Remove team member?",
      description: "They will lose access to this team's resources.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!confirmed) return;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setRemovingMemberId(memberId);

    try {
      const res = await fetch(
        `/api/v1/teams/${teamId}/members?memberId=${memberId}`,
        {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to remove member");
      }

      toast.success("Member removed");
      membersFetchedRef.current = false;
      fetchTeam();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleDeleteTeam() {
    const confirmed = await confirm({
      title: "Delete this team?",
      description:
        "This will permanently delete the team and remove all member assignments.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;

    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/teams/${teamId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Team deleted");
      router.push("/teams");
    } catch {
      toast.error("Failed to delete team");
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

  const teamColor = team.color || "#6b7280";
  const teamMemberIds = new Set(team.members.map((m) => m.memberId));
  const availableMembers = orgMembers.filter(
    (m) => !teamMemberIds.has(m.id)
  );

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 mt-0.5"
            onClick={() => router.push("/teams")}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="size-3.5 rounded-full shrink-0 ring-2 ring-background"
                style={{ backgroundColor: teamColor }}
              />
              <h1 className="text-lg font-semibold truncate">{team.name}</h1>
              <Badge
                variant="outline"
                className="text-[10px] shrink-0"
              >
                {team.members.length}{" "}
                {team.members.length === 1 ? "member" : "members"}
              </Badge>
            </div>
            {team.description && (
              <p className="mt-1 text-sm text-muted-foreground ml-6">
                {team.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={openEdit}
          >
            <Pencil className="size-3" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive"
            onClick={handleDeleteTeam}
          >
            <Trash2 className="size-3" />
            Delete
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Members
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {team.members.length}
          </p>
        </div>
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: `${teamColor}33`,
            backgroundColor: `${teamColor}08`,
          }}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <span
              className="size-3 rounded-full"
              style={{ backgroundColor: teamColor }}
            />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Team Color
            </span>
          </div>
          <p className="mt-2 text-sm font-mono font-medium">{teamColor}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="size-4" />
            <span className="text-[11px] font-medium uppercase tracking-wide">
              Contacts
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums">
            {team.members.filter((m) => m.email).length}
          </p>
        </div>
      </div>

      {/* Members section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            Team Members
          </p>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              >
                <UserPlus className="size-3" />
                Add Member
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command shouldFilter={!loadingMembers}>
                <CommandInput placeholder="Search members..." />
                <CommandList>
                  {loadingMembers ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        <div className="flex flex-col items-center gap-1.5 py-2">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="text-muted-foreground text-sm">
                            No available members
                          </span>
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {availableMembers.map((member) => (
                          <CommandItem
                            key={member.id}
                            value={`${member.name} ${member.email}`}
                            disabled={addingMemberId === member.id}
                            onSelect={() => handleAddMember(member.id)}
                            className="gap-2.5 py-2"
                          >
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                              {getInitials(member.name)}
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-sm font-medium truncate">
                                {member.name || "Unnamed"}
                              </span>
                              {member.email && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {member.email}
                                </span>
                              )}
                            </div>
                            {addingMemberId === member.id && (
                              <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground shrink-0" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {team.members.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium">No members yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add members to this team to get started.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            {team.members.map((member, i) => (
              <div
                key={member.id}
                className={cn(
                  "group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/20",
                  i < team.members.length - 1 && "border-b"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: teamColor }}
                  >
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {member.name || "Unnamed"}
                    </p>
                    {member.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {member.email}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={removingMemberId === member.memberId}
                  onClick={() => handleRemoveMember(member.memberId)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Team</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Team name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`size-7 rounded-full transition-all ${
                      editColor === c
                        ? "ring-2 ring-offset-2 ring-primary"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={editSaving || !editName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </ContentReveal>
  );
}
