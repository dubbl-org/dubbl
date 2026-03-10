"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
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

  function fetchWorkflows() {
    fetch("/api/v1/workflows", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => setWorkflows(data.workflows || []))
      .finally(() => setLoading(false));
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
    toast.success("Workflow created");
    setShowCreate(false);
    setForm({ name: "", description: "", trigger: "invoice_created" });
    fetchWorkflows();
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
        toast.success("Workflow deleted");
        fetchWorkflows();
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
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <Zap className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-base font-semibold">No workflows yet</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create workflows to automate repetitive tasks like sending notifications or updating records.
            </p>
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
