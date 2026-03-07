"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Users, MoreHorizontal, Shield, ShieldCheck, User, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface Member {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
}

const ROLE_ICONS = {
  owner: Shield,
  admin: ShieldCheck,
  member: User,
};

const ROLE_COLORS = {
  owner: "border-purple-200 bg-purple-50 text-purple-700",
  admin: "border-blue-200 bg-blue-50 text-blue-700",
  member: "",
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);

  function fetchMembers() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/members", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.members) setMembers(data.members);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  async function invite() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Member added");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(memberId: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || actionMemberId) return;
    setActionMemberId(memberId);
    try {
      const res = await fetch(`/api/v1/members/${memberId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Member removed");
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally { setActionMemberId(null); }
  }

  async function changeRole(memberId: string, role: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || actionMemberId) return;
    setActionMemberId(memberId);
    try {
      const res = await fetch(`/api/v1/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Role updated");
      fetchMembers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally { setActionMemberId(null); }
  }

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const adminCount = members.filter((m) => m.role === "admin").length;
  const memberCount = members.filter((m) => m.role === "member").length;

  return (
    <BlurReveal className="space-y-10">
      {/* Header */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Team members</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            Manage who has access to this organization and their roles.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          {/* Stats + action */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {members.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[12px] text-muted-foreground">
                <span>{members.length} total</span>
                <span className="text-border">|</span>
                <span>{ownerCount} owner{ownerCount !== 1 ? "s" : ""}</span>
                <span className="text-border">|</span>
                <span>{adminCount} admin{adminCount !== 1 ? "s" : ""}</span>
                <span className="text-border">|</span>
                <span>{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
              </div>
            ) : (
              <div />
            )}
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add Member
            </Button>
          </div>

          {/* Member list */}
          {!loading && members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members"
              description="Invite team members to collaborate."
            />
          ) : (
            <div className="divide-y rounded-lg border">
              {members.map((m) => {
                const RoleIcon = ROLE_ICONS[m.role];
                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs">
                          {(m.userName || m.userEmail)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {m.userName || m.userEmail}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.userEmail}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={ROLE_COLORS[m.role]}>
                        <RoleIcon className="mr-1 size-3" />
                        {m.role}
                      </Badge>
                      {m.role !== "owner" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" disabled={actionMemberId === m.id}>
                              {actionMemberId === m.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                changeRole(
                                  m.id,
                                  m.role === "admin" ? "member" : "admin"
                                )
                              }
                              disabled={actionMemberId !== null}
                            >
                              Make {m.role === "admin" ? "member" : "admin"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => removeMember(m.id)}
                              className="text-red-600"
                              disabled={actionMemberId !== null}
                            >
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="h-px bg-border" />

      {/* Roles explanation */}
      <section className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
        <div className="shrink-0">
          <p className="text-sm font-medium">Roles</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            What each role can do within the organization.
          </p>
        </div>
        <div className="min-w-0 grid gap-px overflow-hidden rounded-lg border border-border bg-border grid-cols-1 sm:grid-cols-3">
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <Shield className="size-3.5 text-purple-600" />
              <p className="text-[13px] font-medium">Owner</p>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Full access. Manage billing, members, and all settings. Cannot be removed.
            </p>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-blue-600" />
              <p className="text-[13px] font-medium">Admin</p>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              Manage members, create and edit all records. Cannot access billing.
            </p>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-muted-foreground" />
              <p className="text-[13px] font-medium">Member</p>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              View and create records. Cannot manage members or settings.
            </p>
          </div>
        </div>
      </section>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={invite}
              disabled={!inviteEmail || saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? "Adding..." : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BlurReveal>
  );
}
