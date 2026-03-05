"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useProject } from "../project-context";

const roleColors: Record<string, string> = {
  manager: "bg-purple-50 text-purple-700 border-purple-200",
  contributor: "bg-blue-50 text-blue-700 border-blue-200",
  viewer: "bg-gray-100 text-gray-600",
};

export default function MembersPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; user: { name: string | null; email: string } }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState("contributor");

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
    if (!orgId || !selectedMemberId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ memberId: selectedMemberId, role: selectedRole }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      toast.success("Member added");
      setAddOpen(false);
      setSelectedMemberId(""); setSelectedRole("contributor");
      refresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function removeMember(memberId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/members?memberId=${memberId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
    toast.success("Member removed");
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* Stats + action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <span>{members.length} total</span>
          {managers.length > 0 && <><span className="text-border">|</span><span>{managers.length} manager{managers.length !== 1 ? "s" : ""}</span></>}
          {contributors.length > 0 && <><span className="text-border">|</span><span>{contributors.length} contributor{contributors.length !== 1 ? "s" : ""}</span></>}
          {viewers.length > 0 && <><span className="text-border">|</span><span>{viewers.length} viewer{viewers.length !== 1 ? "s" : ""}</span></>}
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="mr-1.5 size-3.5" />Add Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 && <div className="py-2 px-3 text-sm text-muted-foreground">All members already added</div>}
                    {availableMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.user.name || m.user.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={saving || !selectedMemberId} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <Users className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No team members assigned</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                </div>
                <button onClick={() => removeMember(m.member.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity absolute top-3 right-3">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Role descriptions */}
      {members.length > 0 && (
        <>
          <div className="h-px bg-border mt-6" />
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 mt-4">
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
  );
}
