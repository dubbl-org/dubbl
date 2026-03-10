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
          <div className="relative flex min-h-[calc(100vh-14rem)] flex-col">
            {/* Ghost workflow rows */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-2">
              <div className="w-full max-w-2xl space-y-2">
                {[true, false, true, false, true].map((active, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-muted/60 bg-card/40 p-4">
                    <div className={`size-5 rounded-full ${active ? "bg-emerald-200/30 dark:bg-emerald-800/20" : "bg-muted/40"}`} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 rounded bg-muted" style={{ width: `${(i + 4) * 20}px` }} />
                      <div className="h-2 w-16 rounded bg-muted/30" />
                    </div>
                    <div className="h-4 w-12 rounded border border-muted/40" />
                    <div className="h-2 w-10 rounded bg-muted/20" />
                  </div>
                ))}
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />
            </div>

            {/* Centered content */}
            <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-12 text-center">
              <div className="flex size-12 sm:size-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/50">
                <Zap className="size-6 sm:size-7 text-violet-600 dark:text-violet-400" />
              </div>
              <h2 className="mt-4 sm:mt-5 text-lg sm:text-xl font-semibold tracking-tight">Workflow Automation</h2>
              <p className="mt-2 max-w-md text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Automate repetitive tasks by connecting triggers to actions. Get notified, update records, and keep your team in sync without manual work.
              </p>
              <Button
                size="lg"
                className="mt-6 bg-violet-600 hover:bg-violet-700"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="mr-2 size-4" />
                Create your first workflow
              </Button>
            </div>

            {/* Feature cards */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 px-4 sm:px-0 pb-6 sm:pb-8">
              {[
                {
                  icon: GitBranch,
                  title: "Event triggers",
                  description: "React to invoices, payments, inventory changes, deal updates, and more automatically.",
                  color: "text-violet-600 dark:text-violet-400",
                  bg: "bg-violet-50 dark:bg-violet-950/40",
                },
                {
                  icon: Bell,
                  title: "Smart notifications",
                  description: "Send alerts to the right people when conditions are met. Never miss an overdue invoice again.",
                  color: "text-amber-600 dark:text-amber-400",
                  bg: "bg-amber-50 dark:bg-amber-950/40",
                },
                {
                  icon: Repeat,
                  title: "Conditional logic",
                  description: "Set conditions to control when workflows fire. Filter by amount, status, type, and more.",
                  color: "text-emerald-600 dark:text-emerald-400",
                  bg: "bg-emerald-50 dark:bg-emerald-950/40",
                },
              ].map(({ icon: Icon, title, description, color, bg }) => (
                <div key={title} className="rounded-xl p-4 sm:p-5">
                  <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className={`size-4.5 ${color}`} />
                  </div>
                  <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
                </div>
              ))}
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
