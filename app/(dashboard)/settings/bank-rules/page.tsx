"use client";

import { useState, useEffect, useCallback } from "react";
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
  ListFilter,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  X,
  ToggleLeft,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// Sentinel used for "no selection" Select items — Radix forbids empty-string values.
const NONE = "__none__";

type ConditionField =
  | "description"
  | "reference"
  | "amount"
  | "payee"
  | "counterparty";
type ConditionOp =
  | "contains"
  | "equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "lt"
  | "between";

interface RuleCondition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

interface SplitAllocation {
  accountId: string;
  percent?: number;
  amount?: number;
  taxRateId?: string;
}

interface BankRule {
  id: string;
  name: string;
  priority: number;
  matchField: string;
  matchType: string;
  matchValue: string;
  conditions?: RuleCondition[] | null;
  matchAll: boolean;
  splitAllocations?: SplitAllocation[] | null;
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  autoReconcile: boolean;
  isActive: boolean;
  createdAt: string;
}

interface AccountOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  name: string;
}

interface TaxRateOption {
  id: string;
  name: string;
}

// Plain-language labels for the things a transaction can be matched on.
const FIELD_LABELS: Record<ConditionField, string> = {
  description: "Description",
  reference: "Reference",
  amount: "Amount",
  payee: "Payee",
  counterparty: "Other party",
};

// Operators available for text fields.
const TEXT_OPS: { value: ConditionOp; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "is exactly" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
];

// Operators available for the amount field.
const AMOUNT_OPS: { value: ConditionOp; label: string }[] = [
  { value: "equals", label: "is exactly" },
  { value: "gt", label: "is more than" },
  { value: "lt", label: "is less than" },
  { value: "between", label: "is between" },
];

const AMOUNT_FIELDS: ConditionField[] = ["amount"];

function isAmountField(field: ConditionField) {
  return AMOUNT_FIELDS.includes(field);
}

function opsForField(field: ConditionField) {
  return isAmountField(field) ? AMOUNT_OPS : TEXT_OPS;
}

// Convert a dollars string (what the user types) to integer cents (what the API
// stores). Returns null if it can't be parsed.
function dollarsToCents(input: string): number | null {
  const n = Number(input.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// A short human summary of a saved rule for the list row.
function summarizeRule(
  rule: BankRule,
  accounts: AccountOption[],
  taxRates: TaxRateOption[],
  contacts: ContactOption[]
): { match: string; actions: string[] } {
  const conds =
    rule.conditions && rule.conditions.length > 0
      ? rule.conditions
      : ([
          {
            field: (rule.matchField as ConditionField) || "description",
            op: (rule.matchType as ConditionOp) || "contains",
            value: rule.matchValue,
          },
        ] as RuleCondition[]);

  const joiner = rule.matchAll ? " AND " : " OR ";
  const match = conds
    .map((c) => {
      const fieldLabel = FIELD_LABELS[c.field] ?? c.field;
      const opLabel =
        opsForField(c.field).find((o) => o.value === c.op)?.label ?? c.op;
      let val = c.value;
      if (isAmountField(c.field)) {
        if (c.op === "between") {
          const [a, b] = c.value.split(",");
          val = `${a} and ${b}`;
        }
      }
      return `${fieldLabel} ${opLabel} "${val}"`;
    })
    .join(joiner);

  const actions: string[] = [];
  if (rule.splitAllocations && rule.splitAllocations.length > 0) {
    actions.push(`Split across ${rule.splitAllocations.length} accounts`);
  } else if (rule.accountId) {
    actions.push(
      accounts.find((a) => a.id === rule.accountId)?.name ?? "Assigned category"
    );
  }
  if (rule.taxRateId) {
    actions.push(taxRates.find((t) => t.id === rule.taxRateId)?.name ?? "Tax");
  }
  if (rule.contactId) {
    actions.push(
      contacts.find((c) => c.id === rule.contactId)?.name ?? "Contact"
    );
  }
  return { match, actions };
}

const emptyCondition = (): RuleCondition => ({
  field: "description",
  op: "contains",
  value: "",
});

export default function BankRulesPage() {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BankRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [matchAll, setMatchAll] = useState(true);
  const [conditions, setConditions] = useState<RuleCondition[]>([
    emptyCondition(),
  ]);
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [taxRateId, setTaxRateId] = useState("");
  const [splits, setSplits] = useState<SplitAllocation[]>([]);
  const [useSplits, setUseSplits] = useState(false);
  const [autoReconcile, setAutoReconcile] = useState(false);

  // Select options
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);

  const fetchRules = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/bank-rules", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setRules(data.data || data.rules || []))
      .finally(() => setLoading(false));
  }, []);

  const fetchOptions = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []));

    fetch("/api/v1/contacts", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => setContacts(data.contacts || data.data || []));

    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => setTaxRates(data.taxRates || []));
  }, []);

  useEffect(() => {
    fetchRules();
    fetchOptions();
  }, [fetchRules, fetchOptions]);

  const resetForm = () => {
    setName("");
    setPriority(0);
    setMatchAll(true);
    setConditions([emptyCondition()]);
    setAccountId("");
    setContactId("");
    setTaxRateId("");
    setSplits([]);
    setUseSplits(false);
    setAutoReconcile(false);
  };

  const openCreate = () => {
    setEditingRule(null);
    resetForm();
    setSheetOpen(true);
  };

  const openEdit = (rule: BankRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setPriority(rule.priority);
    setMatchAll(rule.matchAll ?? true);

    // Prefer the multi-condition array; fall back to the legacy single match.
    if (rule.conditions && rule.conditions.length > 0) {
      setConditions(
        rule.conditions.map((c) => {
          if (isAmountField(c.field)) {
            if (c.op === "between") {
              const [a, b] = c.value.split(",");
              return {
                field: c.field,
                op: c.op,
                value: `${centsToDollars(Number(a) || 0)},${centsToDollars(
                  Number(b) || 0
                )}`,
              };
            }
            return {
              field: c.field,
              op: c.op,
              value: centsToDollars(Number(c.value) || 0),
            };
          }
          return c;
        })
      );
    } else {
      setConditions([
        {
          field: (rule.matchField as ConditionField) || "description",
          op: (rule.matchType as ConditionOp) || "contains",
          value: rule.matchValue || "",
        },
      ]);
    }

    setAccountId(rule.accountId || "");
    setContactId(rule.contactId || "");
    setTaxRateId(rule.taxRateId || "");
    if (rule.splitAllocations && rule.splitAllocations.length > 0) {
      setUseSplits(true);
      setSplits(rule.splitAllocations);
    } else {
      setUseSplits(false);
      setSplits([]);
    }
    setAutoReconcile(rule.autoReconcile);
    setSheetOpen(true);
  };

  // Condition editing helpers
  const updateCondition = (idx: number, patch: Partial<RuleCondition>) => {
    setConditions((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const next = { ...c, ...patch };
        // When the field switches between text and amount, keep the operator valid.
        if (patch.field) {
          const allowed = opsForField(patch.field).map((o) => o.value);
          if (!allowed.includes(next.op)) next.op = allowed[0];
        }
        return next;
      })
    );
  };

  const addCondition = () =>
    setConditions((prev) => [...prev, emptyCondition()]);

  const removeCondition = (idx: number) =>
    setConditions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );

  // Split editing helpers
  const addSplit = () =>
    setSplits((prev) => [...prev, { accountId: "", percent: undefined }]);
  const updateSplit = (idx: number, patch: Partial<SplitAllocation>) =>
    setSplits((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s))
    );
  const removeSplit = (idx: number) =>
    setSplits((prev) => prev.filter((_, i) => i !== idx));

  // Validate + serialize conditions to the API shape (amounts -> integer cents).
  const buildConditionsPayload = (): RuleCondition[] | null => {
    const out: RuleCondition[] = [];
    for (const c of conditions) {
      if (isAmountField(c.field)) {
        if (c.op === "between") {
          const [aRaw, bRaw] = c.value.split(",");
          const a = dollarsToCents(aRaw ?? "");
          const b = dollarsToCents(bRaw ?? "");
          if (a == null || b == null) return null;
          out.push({ field: c.field, op: c.op, value: `${a},${b}` });
        } else {
          const cents = dollarsToCents(c.value);
          if (cents == null || c.value.trim() === "") return null;
          out.push({ field: c.field, op: c.op, value: String(cents) });
        }
      } else {
        if (!c.value.trim()) return null;
        out.push({ field: c.field, op: c.op, value: c.value.trim() });
      }
    }
    return out;
  };

  const canSave =
    name.trim().length > 0 &&
    conditions.length > 0 &&
    conditions.every((c) =>
      c.op === "between"
        ? c.value.split(",").every((p) => p.trim() !== "")
        : c.value.trim() !== ""
    );

  const handleSave = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !name.trim()) return;

    const conditionsPayload = buildConditionsPayload();
    if (!conditionsPayload) {
      toast.error("Please fill in a value for every condition.");
      return;
    }

    let splitPayload: SplitAllocation[] | null = null;
    if (useSplits) {
      const cleaned = splits.filter((s) => s.accountId);
      if (cleaned.length === 0) {
        toast.error("Add at least one account to split across, or turn off splitting.");
        return;
      }
      splitPayload = cleaned.map((s) => ({
        accountId: s.accountId,
        ...(s.percent != null ? { percent: s.percent } : {}),
        ...(s.amount != null ? { amount: s.amount } : {}),
        ...(s.taxRateId ? { taxRateId: s.taxRateId } : {}),
      }));
    }

    setSaving(true);

    const url = editingRule
      ? `/api/v1/bank-rules/${editingRule.id}`
      : "/api/v1/bank-rules";
    const method = editingRule ? "PATCH" : "POST";

    const payload = {
      name: name.trim(),
      priority,
      // Keep the legacy first-condition mirror so older list rows still read.
      matchField: conditionsPayload[0].field,
      matchType: ["contains", "equals", "starts_with", "ends_with"].includes(
        conditionsPayload[0].op
      )
        ? conditionsPayload[0].op
        : "contains",
      matchValue: conditionsPayload[0].value || "-",
      conditions: conditionsPayload,
      matchAll,
      splitAllocations: useSplits ? splitPayload : null,
      accountId: useSplits ? null : accountId || null,
      contactId: contactId || null,
      taxRateId: useSplits ? null : taxRateId || null,
      autoReconcile,
    };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save rule");
        return;
      }

      toast.success(editingRule ? "Rule updated" : "Rule created");
      setSheetOpen(false);
      fetchRules();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const res = await fetch(`/api/v1/bank-rules/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });

    if (res.ok) {
      toast.success("Rule deleted");
      fetchRules();
    } else {
      toast.error("Failed to delete rule");
    }
  };

  const handleToggleActive = async (rule: BankRule) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const res = await fetch(`/api/v1/bank-rules/${rule.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": orgId,
      },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });

    if (res.ok) {
      toast.success(rule.isActive ? "Rule disabled" : "Rule enabled");
      fetchRules();
    } else {
      toast.error("Failed to update rule");
    }
  };

  const handleGetSuggestions = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    toast.info("Analyzing transactions for rule suggestions...");

    try {
      const res = await fetch("/api/v1/bank-rules/suggestions", {
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        toast.error("Failed to get suggestions");
        return;
      }

      const data = await res.json();
      const count = data.suggestions?.length ?? 0;
      if (count === 0) {
        toast.info(
          "No suggestions found. Assign more transactions to categories first."
        );
      } else {
        toast.success(
          `Found ${count} rule suggestion${count === 1 ? "" : "s"}`
        );
      }
    } catch {
      toast.error("Failed to get suggestions");
    }
  };

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bank Rules</h2>
            <p className="text-sm text-muted-foreground">
              Automatically sort imported bank transactions into the right
              category.
              {rules.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  {rules.length} rule{rules.length === 1 ? "" : "s"}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleGetSuggestions}
            >
              <Sparkles className="size-3.5" />
              Get Suggestions
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" />
              Add Rule
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <EmptyState
            icon={ListFilter}
            title="No bank rules yet"
            description="Create rules to automatically assign imported bank transactions to a category, based on words in their description, the amount, or who it was paid to."
          >
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 mt-3"
              onClick={openCreate}
            >
              <Plus className="size-3.5" />
              Create Rule
            </Button>
          </EmptyState>
        ) : (
          <div className="rounded-lg border divide-y">
            {rules.map((rule) => {
              const { match, actions } = summarizeRule(
                rule,
                accounts,
                taxRates,
                contacts
              );
              return (
                <div key={rule.id} className="flex items-center gap-4 px-4 py-3">
                  {/* Name + match info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{rule.name}</p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                        {match}
                      </code>
                      {actions.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {a}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Priority {rule.priority}</span>
                  </div>

                  {/* Active badge */}
                  <Badge
                    variant={rule.isActive ? "default" : "secondary"}
                    className={
                      rule.isActive
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : ""
                    }
                  >
                    {rule.isActive ? "Active" : "Inactive"}
                  </Badge>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(rule)}>
                        <Pencil className="mr-2 size-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(rule)}>
                        <ToggleLeft className="mr-2 size-3.5" />
                        {rule.isActive ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600"
                        onClick={() => handleDelete(rule.id)}
                      >
                        <Trash2 className="mr-2 size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>
              {editingRule ? "Edit Rule" : "New Bank Rule"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 py-4">
            <div className="space-y-2">
              <Label>Rule name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stripe Payouts"
              />
            </div>

            {/* WHEN — conditions */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  When a transaction matches
                </Label>
                {conditions.length > 1 && (
                  <Select
                    value={matchAll ? "all" : "any"}
                    onValueChange={(v) => setMatchAll(v === "all")}
                  >
                    <SelectTrigger className="h-7 w-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">all conditions</SelectItem>
                      <SelectItem value="any">any condition</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-3">
                {conditions.map((cond, idx) => {
                  const isAmount = isAmountField(cond.field);
                  return (
                    <div key={idx} className="space-y-2">
                      {idx > 0 && (
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {matchAll ? "and" : "or"}
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 grid-cols-2 gap-2">
                          {/* Field */}
                          <Select
                            value={cond.field}
                            onValueChange={(v) =>
                              updateCondition(idx, {
                                field: v as ConditionField,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                Object.keys(FIELD_LABELS) as ConditionField[]
                              ).map((f) => (
                                <SelectItem key={f} value={f}>
                                  {FIELD_LABELS[f]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Operator */}
                          <Select
                            value={cond.op}
                            onValueChange={(v) =>
                              updateCondition(idx, { op: v as ConditionOp })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {opsForField(cond.field).map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Value */}
                          {cond.op === "between" ? (
                            <div className="col-span-2 flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={cond.value.split(",")[0] ?? ""}
                                onChange={(e) =>
                                  updateCondition(idx, {
                                    value: `${e.target.value},${
                                      cond.value.split(",")[1] ?? ""
                                    }`,
                                  })
                                }
                                placeholder="Min"
                              />
                              <span className="text-xs text-muted-foreground">
                                to
                              </span>
                              <Input
                                type="number"
                                step="0.01"
                                value={cond.value.split(",")[1] ?? ""}
                                onChange={(e) =>
                                  updateCondition(idx, {
                                    value: `${
                                      cond.value.split(",")[0] ?? ""
                                    },${e.target.value}`,
                                  })
                                }
                                placeholder="Max"
                              />
                            </div>
                          ) : (
                            <Input
                              className="col-span-2"
                              type={isAmount ? "number" : "text"}
                              step={isAmount ? "0.01" : undefined}
                              value={cond.value}
                              onChange={(e) =>
                                updateCondition(idx, { value: e.target.value })
                              }
                              placeholder={
                                isAmount ? "Amount (e.g. 12.50)" : "Text to match"
                              }
                            />
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-muted-foreground"
                          disabled={conditions.length === 1}
                          onClick={() => removeCondition(idx)}
                          aria-label="Remove condition"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={addCondition}
              >
                <Plus className="size-3.5" />
                Add condition
              </Button>
            </div>

            {/* THEN — actions */}
            <div className="space-y-3 rounded-lg border p-3">
              <Label className="text-sm font-semibold">Then do this</Label>

              {/* Split toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Split across several categories</Label>
                  <p className="text-xs text-muted-foreground">
                    Divide each matching transaction by percentage or fixed
                    amount.
                  </p>
                </div>
                <Switch checked={useSplits} onCheckedChange={setUseSplits} />
              </div>

              {!useSplits ? (
                <>
                  <div className="space-y-2">
                    <Label>Assign to category / account</Label>
                    <Select
                      value={accountId || NONE}
                      onValueChange={(v) =>
                        setAccountId(v === NONE ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None</SelectItem>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tax rate (optional)</Label>
                    <Select
                      value={taxRateId || NONE}
                      onValueChange={(v) =>
                        setTaxRateId(v === NONE ? "" : v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No tax" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No tax</SelectItem>
                        {taxRates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {splits.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No splits yet. Add one or more categories below.
                    </p>
                  )}
                  {splits.map((s, idx) => (
                    <div
                      key={idx}
                      className="space-y-2 rounded-md border p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          Split {idx + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground"
                          onClick={() => removeSplit(idx)}
                          aria-label="Remove split"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                      <Select
                        value={s.accountId || NONE}
                        onValueChange={(v) =>
                          updateSplit(idx, {
                            accountId: v === NONE ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Select category</SelectItem>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Percent</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={s.percent ?? ""}
                            onChange={(e) =>
                              updateSplit(idx, {
                                percent:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                                amount: undefined,
                              })
                            }
                            placeholder="e.g. 50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Or fixed amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={
                              s.amount != null ? centsToDollars(s.amount) : ""
                            }
                            onChange={(e) => {
                              const cents = dollarsToCents(e.target.value);
                              updateSplit(idx, {
                                amount:
                                  e.target.value === "" || cents == null
                                    ? undefined
                                    : cents,
                                percent: undefined,
                              });
                            }}
                            placeholder="e.g. 12.50"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tax rate (optional)</Label>
                        <Select
                          value={s.taxRateId || NONE}
                          onValueChange={(v) =>
                            updateSplit(idx, {
                              taxRateId: v === NONE ? undefined : v,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="No tax" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>No tax</SelectItem>
                            {taxRates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={addSplit}
                  >
                    <Plus className="size-3.5" />
                    Add split
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Leave the last split blank on amount/percent and it absorbs
                    the remainder so the splits always add up to the full
                    transaction.
                  </p>
                </div>
              )}

              {/* Contact applies in both modes */}
              <div className="space-y-2">
                <Label>Link to a contact (optional)</Label>
                <Select
                  value={contactId || NONE}
                  onValueChange={(v) => setContactId(v === NONE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select contact" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Options */}
            <div className="space-y-4 rounded-lg border p-3">
              <Label className="text-sm font-semibold">Options</Label>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Higher priority rules are checked first.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label title="Marking as cleared moves no money — it just confirms the transaction matches your bank.">
                    Mark matching transactions as cleared
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Tick off matching transactions automatically. This moves no
                    money.
                  </p>
                </div>
                <Switch
                  checked={autoReconcile}
                  onCheckedChange={setAutoReconcile}
                />
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSave}>
              {saving ? "Saving..." : editingRule ? "Update" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
