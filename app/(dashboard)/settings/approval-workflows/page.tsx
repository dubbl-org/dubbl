"use client";

import { useState } from "react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useApi } from "@/lib/query/use-api";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { centsToDecimal, decimalToCents, formatMoney } from "@/lib/money";
import {
  APPROVAL_CONDITION_FIELDS,
  type ApprovalConditionField,
  type ApprovalEntityType,
} from "@/lib/approvals/select";

/** One row of GET /api/v1/members. */
interface OrgMember {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  role: string;
}

interface WorkflowStep {
  id: string;
  stepOrder: number;
  approverId: string;
  isRequired: boolean;
  approver?: { user?: { name: string | null; email: string } | null } | null;
}

type Operator = "eq" | "neq" | "gt" | "lt" | "gte" | "lte";

/** A condition as stored: money values are integer cents, as strings. */
interface Condition {
  field: string;
  operator: Operator;
  value: string;
}

interface Workflow {
  id: string;
  name: string;
  entityType: ApprovalEntityType;
  conditions: Condition[];
  isActive: boolean;
  steps: WorkflowStep[];
  createdAt: string;
}

const ENTITY_TYPES: { value: ApprovalEntityType; label: string; plural: string }[] = [
  { value: "bill", label: "Bill", plural: "bills" },
  { value: "expense", label: "Expense", plural: "expense claims" },
  { value: "invoice", label: "Invoice", plural: "invoices" },
  { value: "journal_entry", label: "Journal Entry", plural: "journal entries" },
  { value: "purchase_order", label: "Purchase Order", plural: "purchase orders" },
];

const OPERATORS: { value: Operator; label: string; symbol: string }[] = [
  { value: "eq", label: "equals", symbol: "is" },
  { value: "neq", label: "not equals", symbol: "is not" },
  { value: "gt", label: "greater than", symbol: "is over" },
  { value: "gte", label: "greater or equal", symbol: "is at least" },
  { value: "lt", label: "less than", symbol: "is under" },
  { value: "lte", label: "less or equal", symbol: "is at most" },
];

// What happens once a workflow applies, per record type (shown in the drawer).
const ENTITY_HINTS: Record<ApprovalEntityType, string> = {
  bill: "When a bill is submitted for approval, each step approves in turn. The bill is added to your books after the last step.",
  expense: "When an expense claim is submitted, each step approves in turn. The claim is approved and booked after the last step.",
  invoice: "When an invoice is submitted for approval, each step approves in turn. It can be sent after the last step.",
  journal_entry: "Matching draft journal entries can't be finalized until every step has approved them.",
  purchase_order: "Matching draft purchase orders can't be sent until every step has approved them.",
};

function entityTypeLabel(t: string) {
  return ENTITY_TYPES.find((e) => e.value === t)?.label ?? t;
}

function entityPlural(t: string) {
  return ENTITY_TYPES.find((e) => e.value === t)?.plural ?? `${t}s`;
}

function fieldDef(entityType: ApprovalEntityType, field: string): ApprovalConditionField | undefined {
  return APPROVAL_CONDITION_FIELDS[entityType]?.find((f) => f.field === field);
}

function operatorsFor(field: ApprovalConditionField | undefined) {
  return field?.kind === "text" ? OPERATORS.filter((o) => o.value === "eq" || o.value === "neq") : OPERATORS;
}

export default function ApprovalWorkflowsPage() {
  useDocumentTitle("Settings · Approvals");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: workflowsData, loading } = useApi<{ data?: Workflow[] }>("/api/v1/approval-workflows?limit=100");
  const workflows = workflowsData?.data ?? [];
  const { data: membersData } = useApi<{ members?: OrgMember[] }>("/api/v1/members");
  const members = membersData?.members ?? [];
  const { data: orgData } = useApi<{ organization?: { defaultCurrency?: string } }>("/api/v1/organization");
  const currency = orgData?.organization?.defaultCurrency || "USD";
  const currencySymbol =
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? "";

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state. Money condition values are edited as decimals ("5000.00") and
  // converted to integer cents on save.
  const [name, setName] = useState("");
  const [entityType, setEntityType] = useState<ApprovalEntityType>("bill");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [steps, setSteps] = useState<{ approverId: string; isRequired: boolean }[]>([]);

  function headers() {
    return { "x-organization-id": localStorage.getItem("activeOrgId") ?? "" };
  }

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
    setConditions(
      (w.conditions ?? []).map((c) =>
        fieldDef(w.entityType, c.field)?.kind === "money"
          ? { ...c, value: centsToDecimal(Number(c.value)) }
          : { ...c }
      )
    );
    setSteps(w.steps.map((s) => ({ approverId: s.approverId, isRequired: s.isRequired })));
    setSheetOpen(true);
  }

  function changeEntityType(next: ApprovalEntityType) {
    setEntityType(next);
    // Drop conditions on fields the new record type doesn't have.
    setConditions((prev) => prev.filter((c) => fieldDef(next, c.field)));
  }

  // Conditions helpers
  function addCondition() {
    setConditions([...conditions, { field: "total", operator: "gt", value: "" }]);
  }

  function removeCondition(i: number) {
    setConditions(conditions.filter((_, idx) => idx !== i));
  }

  function updateCondition(i: number, patch: Partial<Condition>) {
    setConditions(
      conditions.map((c, idx) => {
        if (idx !== i) return c;
        const next = { ...c, ...patch };
        // Switching between a money and a text field resets the value and
        // keeps the operator valid for the new field.
        if (patch.field && patch.field !== c.field) {
          const def = fieldDef(entityType, patch.field);
          if (def?.kind !== fieldDef(entityType, c.field)?.kind) next.value = "";
          if (!operatorsFor(def).some((o) => o.value === next.operator)) next.operator = "eq";
        }
        return next;
      })
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

  function updateStep(i: number, patch: Partial<{ approverId: string; isRequired: boolean }>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  const conditionsComplete = conditions.every((c) => c.field && c.value.trim() !== "");
  const canSave =
    !!name.trim() && steps.length > 0 && steps.every((s) => s.approverId) && conditionsComplete && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const url = editingWorkflow
        ? `/api/v1/approval-workflows/${editingWorkflow.id}`
        : "/api/v1/approval-workflows";
      const res = await fetch(url, {
        method: editingWorkflow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({
          name: name.trim(),
          entityType,
          conditions: conditions.map((c) =>
            fieldDef(entityType, c.field)?.kind === "money"
              ? { ...c, value: String(decimalToCents(c.value)) }
              : { ...c, value: c.value.trim().toUpperCase() }
          ),
          steps,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSheetOpen(false);
      toast.success(editingWorkflow ? "Workflow updated" : "Workflow created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save workflow");
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
      toast.success(w.isActive ? "Workflow deactivated" : "Workflow activated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle workflow");
    }
  }

  async function deleteWorkflow(w: Workflow) {
    await confirm({
      title: `Delete "${w.name}"?`,
      description:
        "New records won't use this workflow any more. Anything already waiting for approval keeps its current approvers.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/approval-workflows/${w.id}`, {
            method: "DELETE",
            headers: headers(),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          toast.success("Workflow deleted");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to delete workflow");
        }
      },
    });
  }

  function memberLabel(m: OrgMember) {
    return m.userName || m.userEmail;
  }

  function approverName(s: WorkflowStep) {
    const m = members.find((x) => x.id === s.approverId);
    return m ? memberLabel(m) : s.approver?.user?.name || s.approver?.user?.email || "Unknown member";
  }

  function describeCondition(type: ApprovalEntityType, c: Condition) {
    const def = fieldDef(type, c.field);
    const op = OPERATORS.find((o) => o.value === c.operator)?.symbol ?? c.operator;
    const value = def?.kind === "money" ? formatMoney(Number(c.value), currency) : c.value;
    return `${def?.label ?? c.field} ${op} ${value}`;
  }

  // Group workflows by entity type, in a fixed order
  const grouped = ENTITY_TYPES.map((t) => ({
    type: t.value,
    items: workflows.filter((w) => w.entityType === t.value),
  })).filter((g) => g.items.length > 0);

  const fields = APPROVAL_CONDITION_FIELDS[entityType];

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Approval Workflows</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Choose who has to approve bills, expenses, invoices, journal entries and purchase orders, and in what
            order.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="bg-brand-600 hover:bg-brand-700">
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
          description="Create a workflow to require one or more people to approve bills, expenses, invoices, journal entries or purchase orders."
        />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            When more than one active workflow matches a record, the one with the most conditions is used. If that&apos;s a
            tie, the oldest one is used.
          </p>
          {grouped.map(({ type, items }) => (
            <div key={type}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {entityTypeLabel(type)}
              </h3>
              <div className="divide-y rounded-lg border">
                {items.map((w) => (
                  <div key={w.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{w.name}</p>
                        <Badge variant={w.isActive ? "default" : "secondary"} className="text-[10px]">
                          {w.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {w.steps.length} step{w.steps.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {w.conditions.length > 0
                          ? `When ${w.conditions.map((c) => describeCondition(w.entityType, c)).join(" and ")}`
                          : `Every ${entityTypeLabel(w.entityType).toLowerCase()}`}
                        {w.steps.length > 0 && ` · ${w.steps.map(approverName).join(", then ")}`}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Workflow actions">
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
                        <DropdownMenuItem onClick={() => deleteWorkflow(w)} className="text-red-600">
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
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingWorkflow ? "Edit Workflow" : "Create Workflow"}</SheetTitle>
            <SheetDescription>{ENTITY_HINTS[entityType]}</SheetDescription>
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
              <Label>Applies to</Label>
              <Select value={entityType} onValueChange={(v) => changeEntityType(v as ApprovalEntityType)}>
                <SelectTrigger className="w-full">
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
                <Button type="button" variant="ghost" size="sm" onClick={addCondition} className="h-7 text-xs">
                  <Plus className="mr-1 size-3" />
                  Add condition
                </Button>
              </div>
              {conditions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No conditions, so this workflow applies to all {entityPlural(entityType)}.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  All conditions must match. Amounts are compared in each record&apos;s own currency.
                </p>
              )}
              {conditions.map((c, i) => {
                const def = fieldDef(entityType, c.field);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <Select value={c.field} onValueChange={(v) => updateCondition(i, { field: v })}>
                      <SelectTrigger className="w-[110px] shrink-0">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.field} value={f.field}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.operator}
                      onValueChange={(v) => updateCondition(i, { operator: v as Operator })}
                    >
                      <SelectTrigger className="w-[150px] shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operatorsFor(def).map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {def?.kind === "text" ? (
                      <Input
                        value={c.value}
                        onChange={(e) => updateCondition(i, { value: e.target.value.toUpperCase() })}
                        placeholder={currency}
                        maxLength={3}
                        className="min-w-0 flex-1"
                      />
                    ) : (
                      <CurrencyInput
                        value={c.value}
                        onChange={(v) => updateCondition(i, { value: v })}
                        prefix={currencySymbol}
                        placeholder="0.00"
                        className="min-w-0 flex-1"
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCondition(i)}
                      className="size-8 shrink-0 text-red-500"
                      aria-label="Remove condition"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Approval Steps</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addStep} className="h-7 text-xs">
                  <Plus className="mr-1 size-3" />
                  Add Step
                </Button>
              </div>
              {steps.length === 0 ? (
                <p className="text-xs text-muted-foreground">At least one approval step is required.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Approvers act in this order. Each one is notified when it&apos;s their turn.
                </p>
              )}
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                  <span className="w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">{i + 1}</span>
                  <Select value={s.approverId} onValueChange={(v) => updateStep(i, { approverId: v })}>
                    <SelectTrigger className="min-w-0 flex-1">
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
                      aria-label="Move step up"
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
                      aria-label="Move step down"
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-red-500"
                      onClick={() => removeStep(i)}
                      aria-label="Remove step"
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
            <Button onClick={save} disabled={!canSave} className="bg-brand-600 hover:bg-brand-700">
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingWorkflow ? "Save" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </ContentReveal>
  );
}
