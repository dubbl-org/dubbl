"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2, Bell, GitBranch, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  isActive: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
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

export default function WorkflowsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger: "invoice_created" });

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  async function fetchWorkflows() {
    try {
      const res = await fetch("/api/v1/workflows", { headers: getHeaders() });
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkflows();
  }, []);

  async function createWorkflow() {
    if (!form.name.trim()) return;
    await fetch("/api/v1/workflows", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        trigger: form.trigger,
      }),
    });
    setShowCreate(false);
    setForm({ name: "", description: "", trigger: "invoice_created" });
    await fetchWorkflows();
    toast.success("Workflow created");
  }

  async function toggleWorkflow(id: string) {
    await fetch(`/api/v1/workflows/${id}/toggle`, {
      method: "POST",
      headers: getHeaders(),
    });
    setWorkflows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isActive: !w.isActive } : w)),
    );
  }

  async function deleteWorkflow(id: string) {
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
        await fetchWorkflows();
        toast.success("Workflow deleted");
      },
    });
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Workflow Automation</h2>
            <p className="text-sm text-muted-foreground">
              Automate actions when events occur in your organization.
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="size-3" /> New Workflow
          </Button>
        </div>

        {workflows.length === 0 ? (
          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start pt-4">
            {/* Left: mock workflow example */}
            <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
              <div className="bg-muted/30 px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Example workflow
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
                    <Zap className="size-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Notify on overdue invoices</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="size-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[11px] text-muted-foreground">Active · 24 runs</p>
                    </div>
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="space-y-3">
                  <div className="rounded-lg bg-violet-50/50 dark:bg-violet-950/20 border border-violet-200/50 dark:border-violet-900/30 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">Trigger</p>
                    <p className="text-sm mt-0.5">Invoice becomes overdue</p>
                  </div>
                  <div className="rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Condition</p>
                    <p className="text-sm mt-0.5">Amount greater than $500</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30 px-3 py-2.5">
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Action</p>
                    <p className="text-sm mt-0.5">Send notification to finance team</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: benefits */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                What you can automate
              </p>
              {[
                {
                  title: "Event triggers",
                  desc: "React to invoices, payments, inventory changes, deal updates, and payroll events.",
                  icon: GitBranch,
                  color: "border-l-violet-400",
                },
                {
                  title: "Smart notifications",
                  desc: "Send alerts to the right people when conditions are met. Never miss an overdue invoice.",
                  icon: Bell,
                  color: "border-l-amber-400",
                },
                {
                  title: "Conditional logic",
                  desc: "Set field-level conditions to control exactly when workflows fire.",
                  icon: Repeat,
                  color: "border-l-emerald-400",
                },
                {
                  title: "Dry-run testing",
                  desc: "Test your workflow with sample data before enabling it in production.",
                  icon: Zap,
                  color: "border-l-blue-400",
                },
              ].map(({ title, desc, icon: Icon, color }) => (
                <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">{title}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 ml-[22px]">{desc}</p>
                </div>
              ))}

              <div className="pt-2">
                <Button
                  className="bg-violet-600 hover:bg-violet-700"
                  onClick={() => setShowCreate(true)}
                >
                  <Plus className="mr-2 size-4" />
                  Create your first workflow
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="flex items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <button
                  className="shrink-0"
                  onClick={() => toggleWorkflow(wf.id)}
                  title={wf.isActive ? "Disable" : "Enable"}
                >
                  {wf.isActive ? (
                    <ToggleRight className="size-5 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="size-5 text-muted-foreground" />
                  )}
                </button>

                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => router.push(`/settings/workflows/${wf.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{wf.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {TRIGGERS.find((t) => t.value === wf.trigger)?.label || wf.trigger}
                    </Badge>
                    {!wf.isActive && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                        Disabled
                      </Badge>
                    )}
                  </div>
                  {wf.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{wf.description}</p>
                  )}
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {wf.triggerCount} runs
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-red-600"
                    onClick={() => deleteWorkflow(wf.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="e.g. Notify on overdue invoices"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="text-sm min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Trigger</Label>
              <Select
                value={form.trigger}
                onValueChange={(v) => setForm({ ...form, trigger: v })}
              >
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
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={createWorkflow} disabled={!form.name.trim()}>
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </ContentReveal>
  );
}
