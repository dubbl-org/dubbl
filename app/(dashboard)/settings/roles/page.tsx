"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, MoreHorizontal, Loader2, Trash2, Pencil } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
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
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
  createdAt: string;
}

const PERMISSION_CATEGORIES: Record<string, string[]> = {
  "General": ["view:data"],
  "Accounting": ["create:entries", "edit:entries", "post:entries", "void:entries", "manage:accounts", "manage:recurring", "manage:period-lock"],
  "Invoicing": ["manage:invoices", "approve:invoices", "manage:credit-notes", "manage:debit-notes"],
  "Bills": ["manage:bills", "approve:bills"],
  "Banking": ["manage:banking", "manage:bank-rules"],
  "Contacts": ["manage:contacts"],
  "Payments": ["manage:payments"],
  "Expenses": ["manage:expenses", "approve:expenses"],
  "Inventory": ["manage:inventory"],
  "Payroll": ["manage:payroll", "approve:payroll", "manage:timesheets", "manage:leave", "manage:contractors", "view:payslips", "manage:compensation", "manage:tax-config", "manage:shifts", "self-service:payroll", "view:payroll-reports"],
  "Projects": ["manage:projects"],
  "Assets": ["manage:assets"],
  "Budgets": ["manage:budgets"],
  "Tax": ["manage:tax-rates"],
  "Cost Centers": ["manage:cost-centers"],
  "Admin": ["manage:teams", "invite:members", "change:roles", "remove:members", "manage:api-keys", "view:audit-log"],
  "Owner": ["manage:billing", "delete:organization"],
};

function formatPermission(p: string) {
  return p.replace(":", " ").replace(/-/g, " ");
}

export default function RolesPage() {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function fetchRoles() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/roles", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.roles) setRoles(data.roles);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoles();
  }, []);

  function openCreate() {
    setEditingRole(null);
    setName("");
    setDescription("");
    setSelectedPermissions([]);
    setSheetOpen(true);
  }

  function openEdit(role: CustomRole) {
    setEditingRole(role);
    setName(role.name);
    setDescription(role.description || "");
    setSelectedPermissions([...role.permissions]);
    setSheetOpen(true);
  }

  function togglePermission(perm: string) {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  }

  function toggleCategory(perms: string[]) {
    const allSelected = perms.every((p) => selectedPermissions.includes(p));
    if (allSelected) {
      setSelectedPermissions((prev) => prev.filter((p) => !perms.includes(p)));
    } else {
      setSelectedPermissions((prev) => [...new Set([...prev, ...perms])]);
    }
  }

  async function save() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !name || selectedPermissions.length === 0) return;
    setSaving(true);
    try {
      const url = editingRole
        ? `/api/v1/roles/${editingRole.id}`
        : "/api/v1/roles";
      const res = await fetch(url, {
        method: editingRole ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ name, description: description || null, permissions: selectedPermissions }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSheetOpen(false);
      await fetchRoles();
      toast.success(editingRole ? "Role updated" : "Role created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(id: string) {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/roles/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchRoles();
      toast.success("Role deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete role");
    }
  }

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Custom Roles</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Create roles with specific permissions for fine-grained access control.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-1.5 size-3.5" />
          Create Role
        </Button>
      </div>

      {!loading && roles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No custom roles"
          description="Create custom roles to assign specific permissions to team members."
        />
      ) : (
        <div className="divide-y rounded-lg border">
          {roles.map((role) => (
            <div key={role.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{role.name}</p>
                  {role.isSystem && (
                    <Badge variant="secondary" className="text-[10px]">System</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
                {role.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {role.permissions.length} permission{role.permissions.length !== 1 ? "s" : ""}
                </p>
              </div>
              {!role.isSystem && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(role)}>
                      <Pencil className="mr-2 size-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteRole(role.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="mr-2 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRole ? "Edit Role" : "Create Role"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Bookkeeper"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>
            <div className="space-y-3">
              <Label>Permissions</Label>
              {Object.entries(PERMISSION_CATEGORIES).map(([category, perms]) => {
                const allSelected = perms.every((p) => selectedPermissions.includes(p));
                const someSelected = perms.some((p) => selectedPermissions.includes(p));
                return (
                  <div key={category} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Checkbox
                        checked={allSelected}
                        ref={(el) => {
                          if (el) {
                            (el as unknown as HTMLInputElement).indeterminate = someSelected && !allSelected;
                          }
                        }}
                        onCheckedChange={() => toggleCategory(perms)}
                      />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {category}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 pl-6">
                      {perms.map((perm) => (
                        <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={selectedPermissions.includes(perm)}
                            onCheckedChange={() => togglePermission(perm)}
                          />
                          <span className="capitalize">{formatPermission(perm)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button
              onClick={save}
              disabled={!name || selectedPermissions.length === 0 || saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingRole ? "Update" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
