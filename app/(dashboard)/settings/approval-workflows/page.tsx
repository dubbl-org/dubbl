"use client";

import { useState, useEffect } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CheckCircle2,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface OrgMember {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string };
}

interface WorkflowStep {
  id: string;
  stepOrder: number;
  approverId: string;
  isRequired: boolean;
  approver: OrgMember;
}

interface Condition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte";
  value: string;
}

interface Workflow {
  id: string;
  name: string;
  entityType: string;
  conditions: Condition[];
  isActive: boolean;
  steps: WorkflowStep[];
  createdAt: string;
}

const ENTITY_TYPES = [
  { value: "bill", label: "Bill" },
  { value: "expense", label: "Expense" },
  { value: "invoice", label: "Invoice" },
  { value: "journal_entry", label: "Journal Entry" },
  { value: "purchase_order", label: "Purchase Order" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "gte", label: "greater or equal" },
  { value: "lte", label: "less or equal" },
];

function entityTypeLabel(t: string) {
  return ENTITY_TYPES.find((e) => e.value === t)?.label ?? t;
}

export default function ApprovalWorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState("bill");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [steps, setSteps] = useState<
    { approverId: string; isRequired: boolean }[]
  >([]);

  function orgId() {
    return localStorage.getItem("activeOrgId") ?? "";
  }

  function headers() {
    return { "x-organization-id": orgId() };
  }

  async function fetchWorkflows() {
    try {
      const res = await fetch("/api/v1/approval-workflows?limit=100", {
        headers: headers(),
      });
      const data = await res.json();
      if (data.data) setWorkflows(data.data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMembers() {
    try {
      const res = await fetch("/api/v1/members?limit=200", {
        headers: headers(),
      });
      const data = await res.json();
      if (data.data) setMembers(data.data);
      else if (data.members) setMembers(data.members);
    } catch {
      // Non-critical
    }
  }

  useEffect(() => {
    fetchWorkflows();
    fetchMembers();
  }, []);

  function openCreate() {
    setEditingWorkflow(null);
    setName("");
    setEntityType("bill");
    setConditions([]);
    setSteps([]);
    setSheetOpen(true);
  }

  function openEdit(w: Workflow) {
    setEditingWorkflow(w);
    setName(w.name);
    setEntityType(w.entityType);
    setConditions([...(w.conditions ?? [])]);
    setSteps(
      w.steps.map((s) => ({
        approverId: s.approverId,
        isRequired: s.isRequired,
      }))
    );
    setSheetOpen(true);
  }

  // Conditions helpers
  function addCondition() {
    setConditions([...conditions, { field: "", operator: "eq", value: "" }]);
  }

  function removeCondition(i: number) {
    setConditions(conditions.filter((_, idx) => idx !== i));
  }

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions(
      conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }

  // Steps helpers
  function addStep() {
    setSteps([...steps, { approverId: "", isRequired: true }]);
  }

  function removeStep(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  function moveStep(i: number, dir: -1 | 1) {
    const next = [...steps];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setSteps(next);
  }

  function updateStep(
    i: number,
    patch: Partial<{ approverId: string; isRequired: boolean }>
  ) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function save() {
    if (!name || steps.length === 0 || steps.some((s) => !s.approverId)) return;
    setSaving(true);
    try {
      const url = editingWorkflow
        ? `/api/v1/approval-workflows/${editingWorkflow.id}`
        : "/api/v1/approval-workflows";
      const res = await fetch(url, {
        method: editingWorkflow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({
          name,
          entityType,
          conditions: conditions.filter((c) => c.field),
          steps,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSheetOpen(false);
      await fetchWorkflows();
      toast.success(editingWorkflow ? "Workflow updated" : "Workflow created");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save workflow"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(w: Workflow) {
    try {
      const res = await fetch(`/api/v1/approval-workflows/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchWorkflows();
      toast.success(w.isActive ? "Workflow deactivated" : "Workflow activated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle workflow"
      );
    }
  }

  async function deleteWorkflow(id: string) {
    try {
      const res = await fetch(`/api/v1/approval-workflows/${id}`, {
        method: "DELETE",
        headers: headers(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchWorkflows();
      toast.success("Workflow deleted");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete workflow"
      );
    }
  }

  function memberLabel(m: OrgMember) {
    return m.user.name ?? m.user.email;
  }

  // Group workflows by entity type
  const grouped = workflows.reduce<Record<string, Workflow[]>>((acc, w) => {
    (acc[w.entityType] ??= []).push(w);
    return acc;
  }, {});

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Approval Workflows
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Configure multi-step approval workflows for bills, expenses,
            invoices, and more.
          </p>
        </div>
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1.5 size-3.5" />
          Create Workflow
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No approval workflows"
          description="Create workflows to require approvals before bills, expenses, or invoices are processed."
        />
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, wfs]) => (
            <div key={type}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entityTypeLabel(type)}
              </h3>
              <div className="divide-y rounded-lg border">
                {wfs.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{w.name}</p>
                        <Badge
                          variant={w.isActive ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {w.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {w.steps.length} step{w.steps.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {w.conditions.length > 0 && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {w.conditions.length} condition
                          {w.conditions.length !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(w)}>
                          <Pencil className="mr-2 size-3.5" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(w)}>
                          <ToggleLeft className="mr-2 size-3.5" />
                          {w.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => deleteWorkflow(w.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingWorkflow ? "Edit Workflow" : "Create Workflow"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 px-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. High-value bill approval"
              />
            </div>

            {/* Entity Type */}
            <div className="space-y-2">
              <Label>Entity Type</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value}>
                      {et.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conditions</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addCondition}
                  className="h-7 text-xs"
                >
                  <Plus className="mr-1 size-3" />
                  Add
                </Button>
              </div>
              {conditions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No conditions - workflow will apply to all{" "}
                  {entityTypeLabel(entityType).toLowerCase()}s.
                </p>
              )}
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={c.field}
                    onChange={(e) =>
                      updateCondition(i, { field: e.target.value })
                    }
                    placeholder="field"
                    className="flex-1"
                  />
                  <Select
                    value={c.operator}
                    onValueChange={(v) =>
                      updateCondition(i, {
                        operator: v as Condition["operator"],
                      })
                    }
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          {op.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.value}
                    onChange={(e) =>
                      updateCondition(i, { value: e.target.value })
                    }
                    placeholder="value"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCondition(i)}
                    className="size-8 shrink-0 text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Approval Steps</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addStep}
                  className="h-7 text-xs"
                >
                  <Plus className="mr-1 size-3" />
                  Add Step
                </Button>
              </div>
              {steps.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  At least one approval step is required.
                </p>
              )}
              {steps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border p-2"
                >
                  <span className="shrink-0 text-xs font-medium text-muted-foreground w-6 text-center">
                    {i + 1}
                  </span>
                  <Select
                    value={s.approverId}
                    onValueChange={(v) => updateStep(i, { approverId: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {memberLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-red-500"
                      onClick={() => removeStep(i)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={
                !name ||
                steps.length === 0 ||
                steps.some((s) => !s.approverId) ||
                saving
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {editingWorkflow ? "Update" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
