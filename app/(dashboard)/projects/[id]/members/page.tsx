"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/lib/query/use-api";
import { Plus, Trash2, Users, Loader2, UsersRound, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useProject, projectFetch, errorText, type ProjectMemberData } from "../project-context";
import { useConfirm } from "@/lib/hooks/use-confirm";

const ROLE_HELP: Record<string, string> = {
  manager: "Full project access: settings, members, milestones, invoicing and deleting tasks.",
  contributor: "Can create and edit tasks, log time and add notes. Can't change settings, members, milestones or invoicing.",
  viewer: "Read-only access to project data.",
};

/** Cents to the dollars string a CurrencyInput expects ("" when unset). */
function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
function inputToCents(v: string): number | null {
  return v.trim() === "" ? null : Math.round(parseFloat(v) * 100);
}

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

interface OrgMember {
  id: string;
  userName: string | null;
  userEmail: string;
}

export default function MembersPage() {
  const { project: proj, orgId, projectId, canManage } = useProject();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [costRate, setCostRate] = useState("");
  // Edit an existing project member's role and rates.
  const [editing, setEditing] = useState<ProjectMemberData | null>(null);
  const [editRole, setEditRole] = useState("contributor");
  const [editHourlyRate, setEditHourlyRate] = useState("");
  const [editCostRate, setEditCostRate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("none");
  const [selectedRole, setSelectedRole] = useState("contributor");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hourlyRate, setHourlyRate] = useState("");

  // Team assignments
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("none");
  const [selectedTeamRole, setSelectedTeamRole] = useState("contributor");
  const [savingTeam, setSavingTeam] = useState(false);
  const [removingTeamId, setRemovingTeamId] = useState<string | null>(null);

  const { data: teamAssignmentsData } = useApi<{ assignments?: TeamAssignment[] }>(`/api/v1/projects/${projectId}/team-assignments`);
  const teamAssignments = teamAssignmentsData?.assignments ?? [];

  const { data: orgTeamsData } = useApi<{ data?: OrgTeam[] }>(addTeamOpen && "/api/v1/teams?limit=100");
  const orgTeams = orgTeamsData?.data ?? [];

  const { data: orgMembersData } = useApi<{ members?: OrgMember[]; data?: OrgMember[] }>(addOpen && "/api/v1/members");
  const orgMembers = orgMembersData?.members ?? orgMembersData?.data ?? [];

  async function handleAddTeam() {
    if (!orgId || selectedTeamId === "none") return;
    setSavingTeam(true);
    try {
      const data = await projectFetch<{ addedMembers?: number }>(orgId, `/api/v1/projects/${projectId}/team-assignments`, {
        method: "POST",
        body: { teamId: selectedTeamId, defaultRole: selectedTeamRole },
      });
      const added: number = data.addedMembers ?? 0;
      toast.success(added > 0 ? `Team assigned, ${added} ${added === 1 ? "person" : "people"} added` : "Team assigned");
      setAddTeamOpen(false);
      setSelectedTeamId("none");
      setSelectedTeamRole("contributor");
    } catch (err) { toast.error(errorText(err, "Failed to assign team")); }
    finally { setSavingTeam(false); }
  }

  async function removeTeam(a: TeamAssignment) {
    if (!orgId || removingTeamId) return;
    const ok = await confirm({
      title: `Remove ${a.team.name} from this project?`,
      description: "People who joined the project only through this team are removed from it.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemovingTeamId(a.teamId);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/team-assignments?teamId=${a.teamId}`, { method: "DELETE" });
      toast.success("Team removed");
    } catch (err) { toast.error(errorText(err, "Failed to remove team")); }
    finally { setRemovingTeamId(null); }
  }

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
      await projectFetch(orgId, `/api/v1/projects/${projectId}/members`, {
        method: "POST",
        body: {
          memberId: selectedMemberId,
          role: selectedRole,
          hourlyRate: inputToCents(hourlyRate) ?? undefined,
          costRate: inputToCents(costRate) ?? undefined,
        },
      });
      toast.success("Member added");
      setAddOpen(false);
      setSelectedMemberId("none"); setSelectedRole("contributor"); setHourlyRate(""); setCostRate("");
    } catch (err) { toast.error(errorText(err, "Failed to add member")); }
    finally { setSaving(false); }
  }

  function openEdit(m: ProjectMemberData) {
    setEditing(m);
    setEditRole(m.role);
    setEditHourlyRate(centsToInput(m.hourlyRate));
    setEditCostRate(centsToInput(m.costRate));
  }

  async function handleSaveEdit() {
    if (!orgId || !editing) return;
    setEditSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/members`, {
        method: "PATCH",
        body: {
          memberId: editing.member.id,
          role: editRole,
          hourlyRate: inputToCents(editHourlyRate),
          costRate: inputToCents(editCostRate),
        },
      });
      toast.success("Member updated");
      setEditing(null);
    } catch (err) { toast.error(errorText(err, "Failed to update member")); }
    finally { setEditSaving(false); }
  }

  async function removeMember(m: ProjectMemberData) {
    if (!orgId || removingId) return;
    const ok = await confirm({
      title: `Remove ${m.member.user.name || m.member.user.email} from this project?`,
      description: "Their logged time stays on the project. They keep access to the organization.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemovingId(m.member.id);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/members?memberId=${m.member.id}`, { method: "DELETE" });
      toast.success("Member removed");
      if (editing?.member.id === m.member.id) setEditing(null);
    } catch (err) { toast.error(errorText(err, "Failed to remove member")); }
    finally { setRemovingId(null); }
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
          {canManage && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setAddTeamOpen(true)}>
              <Plus className="size-3" />
              Assign Team
            </Button>
          )}
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
                  {canManage && <button
                    onClick={() => removeTeam(a)}
                    disabled={removingTeamId === a.teamId}
                    title="Remove team"
                    className={cn(
                      "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity absolute top-3 right-3",
                      removingTeamId === a.teamId && "opacity-100 pointer-events-none"
                    )}
                  >
                    {removingTeamId === a.teamId ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                  </button>}
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
                <p className="text-[11px] text-muted-foreground">Team members join the project with this role. People already on the project keep their current role.</p>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddTeamOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTeam} disabled={savingTeam || selectedTeamId === "none"} className="bg-brand-600 hover:bg-brand-700">
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
        {canManage && (
          <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />Add Member
          </Button>
        )}
      </div>

      {/* Add Member Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
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
                  <span className="text-muted-foreground ml-2">{ROLE_HELP.manager}</span>
                </div>
                <div className="px-4 py-3">
                  <span className="font-medium">Contributor</span>
                  <span className="text-muted-foreground ml-2">{ROLE_HELP.contributor}</span>
                </div>
                <div className="px-4 py-3">
                  <span className="font-medium">Viewer</span>
                  <span className="text-muted-foreground ml-2">{ROLE_HELP.viewer}</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Compensation</p>
              <div className="space-y-2">
                <Label>Billing Rate per hour (optional)</Label>
                <CurrencyInput prefix="$" value={hourlyRate} onChange={setHourlyRate} />
                <p className="text-[11px] text-muted-foreground">What the client is billed for this person&apos;s time. Leave empty to use the project rate.</p>
              </div>
              <div className="space-y-2">
                <Label>Cost Rate per hour (optional)</Label>
                <CurrencyInput prefix="$" value={costRate} onChange={setCostRate} />
                <p className="text-[11px] text-muted-foreground">What this person&apos;s time costs you. Used for project profitability.</p>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || selectedMemberId === "none"} className="bg-brand-600 hover:bg-brand-700">
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
            <div key={m.id} className={cn("rounded-lg border bg-card p-4 group hover:border-brand-200 transition-colors relative", canManage && "cursor-pointer")} onClick={() => canManage && openEdit(m)}>
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{m.member.user.name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{m.member.user.email}</p>
                  <Badge variant="outline" className={cn("text-[9px] h-4 mt-1.5 capitalize", roleColors[m.role])}>
                    {m.role}
                  </Badge>
                  {m.hourlyRate != null && (
                    <span className="text-[10px] font-mono text-muted-foreground mt-0.5 block">Bills {formatMoney(m.hourlyRate)}/hr</span>
                  )}
                  {m.costRate != null && (
                    <span className="text-[10px] font-mono text-muted-foreground block">Costs {formatMoney(m.costRate)}/hr</span>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(m); }} className="text-muted-foreground hover:text-foreground" title="Edit role and rates">
                      <Pencil className="size-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removeMember(m); }} disabled={removingId === m.member.id} className="text-muted-foreground hover:text-red-600" title="Remove from project">
                      {removingId === m.member.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                    </button>
                  </div>
                )}
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
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{ROLE_HELP.manager}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[13px] font-medium">Contributor</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{ROLE_HELP.contributor}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-[13px] font-medium">Viewer</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{ROLE_HELP.viewer}</p>
            </div>
          </div>
        </>
      )}
      </div>

      {/* Edit member sheet */}
      <Sheet open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Pencil className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">{editing?.member.user.name || editing?.member.user.email}</SheetTitle>
                <SheetDescription>Change this person&apos;s project role and rates.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{ROLE_HELP[editRole]}</p>
            </div>
            <div className="h-px bg-border" />
            <div className="space-y-2">
              <Label>Billing Rate per hour</Label>
              <CurrencyInput prefix="$" value={editHourlyRate} onChange={setEditHourlyRate} />
              <p className="text-[11px] text-muted-foreground">Used for new time this person logs. Leave empty to use the project rate. Time already logged keeps its rate.</p>
            </div>
            <div className="space-y-2">
              <Label>Cost Rate per hour</Label>
              <CurrencyInput prefix="$" value={editCostRate} onChange={setEditCostRate} />
              <p className="text-[11px] text-muted-foreground">What this person&apos;s time costs you. Used for project profitability.</p>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            {editing && (
              <Button type="button" variant="ghost" size="sm" className="mr-auto text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => removeMember(editing)}>
                <Trash2 className="size-3.5" />Remove from project
              </Button>
            )}
            <Button type="button" variant="outline" className={editing ? "" : "ml-auto"} onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving} className="bg-brand-600 hover:bg-brand-700">
              {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </div>
  );
}
