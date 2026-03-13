"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Users, MoreHorizontal, Shield, ShieldCheck, User, Loader2, CalendarDays, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { ContentReveal } from "@/components/ui/content-reveal";

interface CustomRole {
  id: string;
  name: string;
}

interface Member {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  role: "owner" | "admin" | "member";
  customRoleId: string | null;
  customRoleName?: string | null;
  createdAt: string;
}

interface Capacity {
  current: number;
  max: number | null;
  plan: string;
  seatCount: number;
  status: string;
  canInvite: boolean;
  reason: string | null;
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
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [actionMemberId, setActionMemberId] = useState<string | null>(null);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  async function fetchMembers() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    try {
      const [membersRes, rolesRes, capacityRes] = await Promise.all([
        fetch("/api/v1/members", { headers: { "x-organization-id": orgId } }),
        fetch("/api/v1/roles", { headers: { "x-organization-id": orgId } }),
        fetch("/api/v1/members/capacity", { headers: { "x-organization-id": orgId } }),
      ]);
      const membersData = await membersRes.json();
      const rolesData = await rolesRes.json();
      const capacityData = await capacityRes.json();
      if (membersData.members) setMembers(membersData.members);
      if (rolesData.roles) setCustomRoles(rolesData.roles);
      if (capacityData.current !== undefined) setCapacity(capacityData);
    } finally {
      setLoading(false);
    }
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
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      await fetchMembers();
      toast.success("Member added");
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
      await fetchMembers();
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    } finally { setActionMemberId(null); }
  }

  async function assignCustomRole(memberId: string, customRoleId: string | null) {
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
        body: JSON.stringify({ customRoleId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchMembers();
      toast.success(customRoleId ? "Custom role assigned" : "Custom role removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign role");
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
      await fetchMembers();
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally { setActionMemberId(null); }
  }

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const adminCount = members.filter((m) => m.role === "admin").length;
  const memberCount = members.filter((m) => m.role === "member").length;

  const isBillingBad = capacity && (capacity.status === "past_due" || capacity.status === "incomplete");
  const isAtLimit = capacity && !capacity.canInvite && !isBillingBad;
  const usagePercent = capacity && capacity.max ? Math.min((capacity.current / capacity.max) * 100, 100) : 0;

  return (
    <ContentReveal className="space-y-6">
      {/* Billing warning banner */}
      {isBillingBad && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <AlertTriangle className="size-4 text-red-600 dark:text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">Billing past due</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Update your payment method to continue inviting members.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs border-red-200 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300"
            onClick={() => router.push("/settings/billing")}
          >
            Update Billing
            <ArrowUpRight className="ml-1 size-3" />
          </Button>
        </div>
      )}

      {/* Seat usage + stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Users className="size-3 text-muted-foreground" />
            Seats Used
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {capacity ? capacity.current : members.length}
            {capacity?.max && (
              <span className="text-sm font-normal text-muted-foreground">
                {" / "}{capacity.max}
              </span>
            )}
            {capacity && !capacity.max && (
              <span className="text-sm font-normal text-muted-foreground"> / unlimited</span>
            )}
          </p>
          {capacity?.max && (
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usagePercent}%`,
                  backgroundColor: usagePercent >= 100 ? "#ef4444" : usagePercent >= 80 ? "#f59e0b" : "#10b981",
                }}
              />
            </div>
          )}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Shield className="size-3 text-purple-500" />
            {ownerCount === 1 ? "Owner" : "Owners"}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-purple-600 dark:text-purple-400">
            {ownerCount}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-blue-500" />
            {adminCount === 1 ? "Admin" : "Admins"}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {adminCount}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <User className="size-3 text-muted-foreground" />
            {memberCount === 1 ? "Member" : "Members"}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {memberCount}
          </p>
        </div>
      </div>

      {/* At-limit banner */}
      {isAtLimit && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Member limit reached</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {capacity?.reason || "Upgrade your plan to add more members."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 text-xs border-amber-200 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300"
            onClick={() => router.push("/settings/billing")}
          >
            Upgrade
            <ArrowUpRight className="ml-1 size-3" />
          </Button>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Team</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Manage who has access to this organization and their roles.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setInviteOpen(true)}
          disabled={capacity ? !capacity.canInvite : false}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
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
            const joinDate = new Date(m.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            return (
              <div
                key={m.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Left: avatar + name/email */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="text-xs">
                      {(m.userName || m.userEmail)[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.userName || m.userEmail}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.userEmail}
                    </p>
                  </div>
                </div>

                {/* Right: role badge, join date, actions */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <Badge variant="outline" className={ROLE_COLORS[m.role]}>
                    <RoleIcon className="mr-1 size-3" />
                    {m.customRoleName || m.role}
                  </Badge>
                  <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                    <CalendarDays className="size-3" />
                    {joinDate}
                  </span>
                  {m.role !== "owner" ? (
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
                        {customRoles.length > 0 && customRoles.map((cr) => (
                          <DropdownMenuItem
                            key={cr.id}
                            onClick={() => assignCustomRole(m.id, cr.id)}
                            disabled={actionMemberId !== null}
                          >
                            Assign: {cr.name}
                          </DropdownMenuItem>
                        ))}
                        {m.customRoleId && (
                          <DropdownMenuItem
                            onClick={() => assignCustomRole(m.id, null)}
                            disabled={actionMemberId !== null}
                          >
                            Remove custom role
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => removeMember(m.id)}
                          className="text-red-600"
                          disabled={actionMemberId !== null}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div className="size-8" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Roles explanation - 3 cards in a row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-purple-600" />
            <p className="text-[13px] font-medium">Owner</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Full access. Manage billing, members, and all settings. Cannot be removed.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-blue-600" />
            <p className="text-[13px] font-medium">Admin</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            Manage members, create and edit all records. Cannot access billing.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground" />
            <p className="text-[13px] font-medium">Member</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            View and create records. Cannot manage members or settings.
          </p>
        </div>
      </div>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Add Member</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            {/* Seat info in invite sheet */}
            {capacity && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  {capacity.current} of {capacity.max ?? "unlimited"} seats used
                  <span className="ml-1 capitalize">({capacity.plan} plan)</span>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
              <p className="text-[11px] text-muted-foreground">
                The user must have a dubbl account before they can be invited.
              </p>
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
          <SheetFooter>
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
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
