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
  Play,
  ToggleLeft,
} from "lucide-react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface BankRule {
  id: string;
  name: string;
  priority: number;
  matchField: string;
  matchType: string;
  matchValue: string;
  accountId: string | null;
  contactId: string | null;
  taxRateId: string | null;
  autoReconcile: boolean;
  isActive: boolean;
  createdAt: string;
  account?: { id: string; name: string } | null;
  contact?: { id: string; name: string } | null;
}

interface AccountOption {
  id: string;
  name: string;
}

interface ContactOption {
  id: string;
  name: string;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  contains: "contains",
  equals: "equals",
  starts_with: "starts with",
  ends_with: "ends with",
};

export default function BankRulesPage() {
  const [rules, setRules] = useState<BankRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BankRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(0);
  const [matchField, setMatchField] = useState("description");
  const [matchType, setMatchType] = useState("contains");
  const [matchValue, setMatchValue] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [autoReconcile, setAutoReconcile] = useState(false);

  // Select options
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);

  const fetchRules = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    fetch("/api/v1/bank-rules", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => setRules(data.rules || []))
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
      .then((data) => setContacts(data.contacts || []));
  }, []);

  useEffect(() => {
    fetchRules();
    fetchOptions();
  }, [fetchRules, fetchOptions]);

  const resetForm = () => {
    setName("");
    setPriority(0);
    setMatchField("description");
    setMatchType("contains");
    setMatchValue("");
    setAccountId("");
    setContactId("");
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
    setMatchField(rule.matchField);
    setMatchType(rule.matchType);
    setMatchValue(rule.matchValue);
    setAccountId(rule.accountId || "");
    setContactId(rule.contactId || "");
    setAutoReconcile(rule.autoReconcile);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId || !name.trim() || !matchValue.trim()) return;
    setSaving(true);

    const url = editingRule
      ? `/api/v1/bank-rules/${editingRule.id}`
      : "/api/v1/bank-rules";
    const method = editingRule ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: name.trim(),
          priority,
          matchField,
          matchType,
          matchValue: matchValue.trim(),
          accountId: accountId || null,
          contactId: contactId || null,
          autoReconcile,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
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
      method: "PUT",
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
        toast.info("No suggestions found. Categorize more transactions first.");
      } else {
        toast.success(`Found ${count} rule suggestion${count === 1 ? "" : "s"}`);
      }
    } catch {
      toast.error("Failed to get suggestions");
    }
  };

  const handleApplyRules = async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    toast.info("Applying rules to uncategorized transactions...");

    try {
      const res = await fetch("/api/v1/bank-rules/apply", {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });

      if (!res.ok) {
        toast.error("Failed to apply rules");
        return;
      }

      const data = await res.json();
      toast.success(
        `Matched ${data.matched} transaction${data.matched === 1 ? "" : "s"}, updated ${data.updated}`
      );
    } catch {
      toast.error("Failed to apply rules");
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
              Auto-categorize imported bank transactions with matching rules.
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
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={openCreate}
            >
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
            description="Create rules to automatically categorize imported bank transactions based on description or reference patterns."
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
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-4 px-4 py-3"
              >
                {/* Name + match info */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{rule.name}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {rule.matchField} {MATCH_TYPE_LABELS[rule.matchType] || rule.matchType} &quot;{rule.matchValue}&quot;
                    </code>
                    {rule.account && (
                      <Badge variant="secondary" className="text-xs">
                        {rule.account.name}
                      </Badge>
                    )}
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
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingRule ? "Edit Rule" : "New Bank Rule"}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stripe Payouts"
              />
            </div>

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

            <div className="space-y-2">
              <Label>Match Field</Label>
              <Select value={matchField} onValueChange={setMatchField}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">Description</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Match Type</Label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="equals">Equals</SelectItem>
                  <SelectItem value="starts_with">Starts with</SelectItem>
                  <SelectItem value="ends_with">Ends with</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Match Value</Label>
              <Input
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                placeholder="e.g. STRIPE PAYOUT"
              />
            </div>

            <div className="space-y-2">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Contact</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-reconcile</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically reconcile matching transactions
                </p>
              </div>
              <Switch
                checked={autoReconcile}
                onCheckedChange={setAutoReconcile}
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim() || !matchValue.trim()}
            >
              {saving ? "Saving..." : editingRule ? "Update" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
