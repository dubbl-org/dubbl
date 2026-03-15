"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, X, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface Action {
  type: string;
  config: Record<string, unknown>;
}

interface LogEntry {
  id: string;
  triggeredByType: string;
  triggeredById: string;
  status: string;
  executedAt: string;
}

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: Condition[];
  actions: Action[];
  isActive: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  logs?: LogEntry[];
}

const TRIGGERS = [
  { value: "invoice_created", label: "Invoice Created" },
  { value: "invoice_overdue", label: "Invoice Overdue" },
  { value: "payment_received", label: "Payment Received" },
  { value: "contact_created", label: "Contact Created" },
  { value: "inventory_low", label: "Inventory Low" },
  { value: "deal_stage_changed", label: "Deal Stage Changed" },
  { value: "payroll_processed", label: "Payroll Processed" },
];

const OPERATORS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "gte", label: "at least" },
  { value: "lte", label: "at most" },
  { value: "contains", label: "contains" },
];

const ACTIONS = [
  { value: "send_notification", label: "Send Notification" },
  { value: "send_email", label: "Send Email" },
  { value: "create_task", label: "Create Task" },
  { value: "update_field", label: "Update Field" },
  { value: "move_deal_stage", label: "Move Deal Stage" },
  { value: "create_invoice", label: "Create Invoice" },
];

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("invoice_created");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [testResult, setTestResult] = useState<{ matches: boolean } | null>(null);
  const [testData, setTestData] = useState("{}");
  useDocumentTitle("Settings · Workflow Details");

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchWorkflow() {
    fetch(`/api/v1/workflows/${id}`, { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (data.workflow) {
          const w = data.workflow;
          setWf(w);
          setName(w.name);
          setDescription(w.description || "");
          setTrigger(w.trigger);
          setConditions(w.conditions || []);
          setActions(w.actions || []);
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchWorkflow();
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/v1/workflows/${id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ name, description: description || null, trigger, conditions, actions }),
      });
      toast.success("Workflow saved");
      fetchWorkflow();
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    try {
      const sampleData = JSON.parse(testData);
      const res = await fetch("/api/v1/workflows/test", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ conditions, sampleData }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      toast.error("Invalid JSON in test data");
    }
  }

  async function deleteWorkflow() {
    await confirm({
      title: "Delete workflow?",
      description: "This workflow will be permanently removed.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/workflows/${id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        toast.success("Workflow deleted");
        router.push("/settings/workflows");
      },
    });
  }

  function addCondition() {
    setConditions([...conditions, { field: "", operator: "eq", value: "" }]);
  }

  function updateCondition(idx: number, patch: Partial<Condition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCondition(idx: number) {
    setConditions(conditions.filter((_, i) => i !== idx));
  }

  function addAction() {
    setActions([...actions, { type: "send_notification", config: {} }]);
  }

  function updateAction(idx: number, type: string) {
    setActions(actions.map((a, i) => (i === idx ? { ...a, type } : a)));
  }

  function removeAction(idx: number) {
    setActions(actions.filter((_, i) => i !== idx));
  }

  if (loading) return <BrandLoader />;
  if (!wf) return <div className="py-20 text-center text-sm text-muted-foreground">Workflow not found</div>;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => router.push("/settings/workflows")}>
              <ArrowLeft className="size-4" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold">{wf.name}</h2>
              <p className="text-xs text-muted-foreground">
                {wf.triggerCount} runs
                {wf.lastTriggeredAt && ` · Last: ${new Date(wf.lastTriggeredAt).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 text-red-600"
              onClick={deleteWorkflow}
            >
              <Trash2 className="size-3" /> Delete
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Config */}
          <div className="space-y-5">
            {/* Basic Info */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">Basic Info</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="text-sm min-h-[50px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Trigger</Label>
                  <Select value={trigger} onValueChange={setTrigger}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Conditions */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Conditions</h3>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addCondition}>
                  <Plus className="size-3" /> Add
                </Button>
              </div>
              {conditions.length === 0 && (
                <p className="text-xs text-muted-foreground">No conditions - workflow will always match.</p>
              )}
              <div className="space-y-2">
                {conditions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="field"
                      value={c.field}
                      onChange={(e) => updateCondition(i, { field: e.target.value })}
                      className="h-7 text-xs flex-1"
                    />
                    <Select value={c.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                      <SelectTrigger className="h-7 text-xs w-28">
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
                      placeholder="value"
                      value={c.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      className="h-7 text-xs flex-1"
                    />
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeCondition(i)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Actions</h3>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addAction}>
                  <Plus className="size-3" /> Add
                </Button>
              </div>
              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground">No actions configured.</p>
              )}
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium shrink-0">
                      {i + 1}
                    </div>
                    <Select value={a.type} onValueChange={(v) => updateAction(i, v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTIONS.map((act) => (
                          <SelectItem key={act.value} value={act.value}>
                            {act.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeAction(i)}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Test + Logs */}
          <div className="space-y-5">
            {/* Test */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">Dry Run</h3>
              <div className="space-y-1.5">
                <Label className="text-xs">Sample Data (JSON)</Label>
                <Textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  className="text-xs font-mono min-h-[80px]"
                  placeholder='{ "amount": 500, "status": "overdue" }'
                />
              </div>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={runTest}>
                <Play className="size-3" /> Test
              </Button>
              {testResult && (
                <div className="text-xs">
                  {testResult.matches ? (
                    <Badge className="bg-emerald-100 text-emerald-700">Conditions Match</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700">Conditions Not Met</Badge>
                  )}
                </div>
              )}
            </div>

            {/* Execution Log */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">Execution Log</h3>
              {(!wf.logs || wf.logs.length === 0) ? (
                <p className="text-xs text-muted-foreground">No executions yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {wf.logs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-xs rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[9px] ${
                            log.status === "success"
                              ? "text-emerald-600 border-emerald-200"
                              : log.status === "skipped"
                                ? "text-yellow-600 border-yellow-200"
                                : "text-red-600 border-red-200"
                          }`}
                        >
                          {log.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          {log.triggeredByType} · {log.triggeredById.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(log.executedAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmDialog}
    </ContentReveal>
  );
}
