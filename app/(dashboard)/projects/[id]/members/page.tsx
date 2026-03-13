"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, Loader2, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useProject } from "../project-context";

const roleColors: Record<string, string> = {
  manager: "bg-purple-50 text-purple-700 border-purple-200",
  contributor: "bg-blue-50 text-blue-700 border-blue-200",
  viewer: "bg-gray-100 text-gray-600",
};

interface TeamAssignment {
  id: string;
  teamId: string;
  defaultRole: string;
  team: {
    id: string;
    name: string;
    color: string;
    members: { id: string; member: { id: string; user: { name: string | null; email: string } } }[];
  };
}

interface OrgTeam {
  id: string;
  name: string;
  color: string;
  _count?: { members: number };
}

export default function MembersPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; userName: string | null; userEmail: string }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("none");
  const [selectedRole, setSelectedRole] = useState("contributor");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState("");

  // Team assignments
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("none");
  const [selectedTeamRole, setSelectedTeamRole] = useState("contributor");
  const [savingTeam, setSavingTeam] = useState(false);
  const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

  const fetchTeamAssignments = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/team-assignments`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.assignments) setTeamAssignments(data.assignments);
    } catch { /* ignore */ }
  }, [orgId, projectId]);

  useEffect(() => {
    fetchTeamAssignments();
  }, [fetchTeamAssignments]);

  useEffect(() => {
    if (!orgId || !addTeamOpen) return;
    fetch("/api/v1/teams?limit=100", { headers: { "x-organization-id": orgId } })
      .then(r => r.json())
      .then(data => {
        if (data.data) setOrgTeams(data.data);
      })
      .catch(() => {});
  }, [orgId, addTeamOpen]);

  async function handleAddTeam() {
    if (!orgId || selectedTeamId === "none") return;
    setSavingTeam(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/team-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ teamId: selectedTeamId, defaultRole: selectedTeamRole }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      toast.success("Team assigned");
      setAddTeamOpen(false);
      setSelectedTeamId("none");
      setSelectedTeamRole("contributor");
      fetchTeamAssignments();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSavingTeam(false); }
  }

  async function removeTeam(teamId: string) {
    if (!orgId || removingTeamId) return;
    setRemovingTeamId(teamId);
    try {
      await fetch(`/api/v1/projects/${projectId}/team-assignments?teamId=${teamId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      toast.success("Team removed");
      fetchTeamAssignments();
    } finally { setRemovingTeamId(null); }
  }

  useEffect(() => {
    if (!orgId || !addOpen) return;
    fetch("/api/v1/members", { headers: { "x-organization-id": orgId } })
      .then(r => r.json())
      .then(data => {
        if (data.members) setOrgMembers(data.members);
        else if (data.data) setOrgMembers(data.data);
      })
      .catch(() => {});
  }, [orgId, addOpen]);

  if (!proj) return null;

  const members = proj.members;
  const existingMemberIds = new Set(members.map(m => m.member.id));
  const availableMembers = orgMembers.filter(m => !existingMemberIds.has(m.id));

  const managers = members.filter(m => m.role === "manager");
  const contributors = members.filter(m => m.role === "contributor");
  const viewers = members.filter(m => m.role === "viewer");

  async function handleAdd() {
    if (!orgId || selectedMemberId === "none") return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ memberId: selectedMemberId, role: selectedRole, hourlyRate: hourlyRate ? Math.round(parseFloat(hourlyRate) * 100) : undefined }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      toast.success("Member added");
      setAddOpen(false);
      setSelectedMemberId("none"); setSelectedRole("contributor"); setHourlyRate("");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function removeMember(memberId: string) {
    if (!orgId || removingId) return;
    setRemovingId(memberId);
    try {
      await fetch(`/api/v1/projects/${projectId}/members?memberId=${memberId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
      toast.success("Member removed");
      refresh();
    } finally { setRemovingId(null); }
  }

  const assignedTeamIds = new Set(teamAssignments.map(a => a.teamId));
  const availableTeams = orgTeams.filter(t => !assignedTeamIds.has(t.id));

  return (
    <div className="space-y-8">
      {/* Team assignments */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Teams</h3>
            {teamAssignments.length > 0 && (
              <span className="text-[12px] text-muted-foreground">{teamAssignments.length} assigned</span>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setAddTeamOpen(true)}>
            <Plus className="size-3" />
            Assign Team
          </Button>
        </div>

        {teamAssignments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <UsersRound className="mx-auto size-7 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">No teams assigned</p>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">Assign an organization team to give all its members access.</p>
          </div>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {teamAssignments.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-4 group hover:border-blue-200 dark:hover:border-blue-800 transition-colors relative">
                <div className="flex items-start gap-3">
                  <div
                    className="size-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 text-white"
                    style={{ backgroundColor: a.team.color }}
                  >
                    {a.team.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{a.team.name}</p>
                    <p className="text-[11px] text-muted-foreground">{a.team.members.length} member{a.team.members.length !== 1 ? "s" : ""}</p>
                    <Badge variant="outline" className={cn("text-[9px] h-4 mt-1.5 capitalize", roleColors[a.defaultRole])}>
                      {a.defaultRole}
                    </Badge>
                  </div>
                  <button
                    onClick={() => removeTeam(a.teamId)}
                    disabled={removingTeamId === a.teamId}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity absolute top-3 right-3",
                      removingTeamId === a.teamId && "opacity-100 pointer-events-none"
                    )}
                  >
                    {removingTeamId === a.teamId ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign team sheet */}
      <Sheet open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <UsersRound className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Assign Team</SheetTitle>
                <SheetDescription>Add an organization team to this project. All team members will get access.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select Team</p>
              <div className="space-y-2">
                <Label>Team</Label>
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger><SelectValue placeholder="Select team..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Select team...</SelectItem>
                    {availableTeams.length === 0 && <div className="py-2 px-3 text-sm text-muted-foreground">All teams already assigned</div>}
                    {availableTeams.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Default Role</p>
              <div className="space-y-2">
                <Label>Role for team members</Label>
                <Select value={selectedTeamRole} onValueChange={setSelectedTeamRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">All members of this team will get this role on the project.</p>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddTeamOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTeam} disabled={savingTeam || selectedTeamId === "none"} className="bg-emerald-600 hover:bg-emerald-700">
              {savingTeam ? "Assigning..." : "Assign Team"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <div className="h-px bg-border" />

      {/* Individual members */}
      <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 sm:gap-3 text-[12px] text-muted-foreground flex-wrap">
          <span>{members.length} total</span>
          {managers.length > 0 && <><span className="text-border">|</span><span>{managers.length} manager{managers.length !== 1 ? "s" : ""}</span></>}
          {contributors.length > 0 && <><span className="text-border">|</span><span>{contributors.length} contributor{contributors.length !== 1 ? "s" : ""}</span></>}
          {viewers.length > 0 && <><span className="text-border">|</span><span>{viewers.length} viewer{viewers.length !== 1 ? "s" : ""}</span></>}
        </div>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />Add Member
        </Button>
      </div>

      {/* Add Member Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Users className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Add Team Member</SheetTitle>
                <SheetDescription>Add an organization member to this project.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select Member</p>
              <div className="space-y-2">
                <Label>Member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Select member...</SelectItem>
                    {availableMembers.length === 0 && <div className="py-2 px-3 text-sm text-muted-foreground">All members already added</div>}
                    {availableMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.userName || m.userEmail}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Permissions</p>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg border divide-y text-[12px]">
                <div className="px-4 py-3">
                  <span className="font-medium">Manager</span>
                  <span className="text-muted-foreground ml-2">Full project access. Can manage tasks, time, milestones, and members.</span>
                </div>
                <div className="px-4 py-3">
                  <span className="font-medium">Contributor</span>
                  <span className="text-muted-foreground ml-2">Can create tasks, log time, and add notes. Cannot manage members.</span>
                </div>
                <div className="px-4 py-3">
                  <span className="font-medium">Viewer</span>
                  <span className="text-muted-foreground ml-2">Read-only access to project data.</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compensation</p>
              <div className="space-y-2">
                <Label>Hourly Rate (optional)</Label>
                <CurrencyInput prefix="$" value={hourlyRate} onChange={setHourlyRate} />
                <p className="text-[11px] text-muted-foreground">Override the project-level hourly rate for this member.</p>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || selectedMemberId === "none"} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <Users className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No team members assigned</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <div key={m.id} className="rounded-lg border bg-card p-4 group hover:border-emerald-200 transition-colors relative">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{m.member.user.name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{m.member.user.email}</p>
                  <Badge variant="outline" className={cn("text-[9px] h-4 mt-1.5 capitalize", roleColors[m.role])}>
                    {m.role}
                  </Badge>
                  {m.hourlyRate && (
                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5 block">{formatMoney(m.hourlyRate)}/hr</span>
                  )}
                </div>
                <button onClick={() => removeMember(m.member.id)} disabled={removingId === m.member.id} className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity absolute top-3 right-3", removingId === m.member.id && "opacity-100 pointer-events-none")}>
                  {removingId === m.member.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {members.length > 0 && (
        <>
          <div className="h-px bg-border mt-6" />
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border grid-cols-1 sm:grid-cols-3 mt-4">
            <div className="bg-card p-4">
              <p className="text-[13px] font-medium">Manager</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Full project access. Can manage tasks, time, milestones, and members.</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[13px] font-medium">Contributor</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Can create tasks, log time, and add notes. Cannot manage members.</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[13px] font-medium">Viewer</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Read-only access. Can view project data but cannot make changes.</p>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
