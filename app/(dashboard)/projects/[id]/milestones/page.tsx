"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Flag, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useProject, formatDateShort, pct } from "../project-context";

export default function MilestonesPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");

  if (!proj) return null;

  const milestones = proj.milestones;
  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;
  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0);
  const completedAmount = milestones.filter(m => m.status === "completed").reduce((s, m) => s + m.amount, 0);

  async function handleAdd() {
    if (!orgId || !title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ title: title.trim(), description: desc || null, dueDate: dueDate || null, amount: Math.round(parseFloat(amount || "0") * 100) }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Milestone created");
      setAddOpen(false);
      setTitle(""); setDesc(""); setDueDate(""); setAmount("");
      refresh();
    } catch { toast.error("Failed to create milestone"); }
    finally { setSaving(false); }
  }

  async function toggleComplete(ms: typeof milestones[0]) {
    if (!orgId) return;
    const newStatus = ms.status === "completed" ? "upcoming" : "completed";
    await fetch(`/api/v1/projects/${projectId}/milestones/${ms.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ status: newStatus }),
    });
    refresh();
  }

  async function deleteMilestone(msId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/milestones/${msId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Progress</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{completed}/{total}</p>
          {total > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct(completed, total)}%` }} />
            </div>
          )}
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Value</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{formatMoney(totalAmount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Completed Value</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">{formatMoney(completedAmount)}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="mr-1.5 size-3.5" />Milestone</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Milestone title" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Amount</Label><Input type="number" step="0.01" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
              </div>
              <Button onClick={handleAdd} disabled={saving || !title.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Creating..." : "Create Milestone"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <Flag className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No milestones yet</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {milestones.map((ms) => {
            const overdue = ms.dueDate && new Date(ms.dueDate) < new Date() && ms.status !== "completed";
            return (
              <div key={ms.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group">
                <button onClick={() => toggleComplete(ms)} className="shrink-0">
                  {ms.status === "completed" ? (
                    <CheckCircle2 className="size-5 text-emerald-500" />
                  ) : (
                    <Target className="size-5 text-muted-foreground/40 hover:text-emerald-400 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={cn("text-[13px] font-medium", ms.status === "completed" && "line-through text-muted-foreground")}>{ms.title}</span>
                  {ms.description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ms.description}</p>}
                </div>
                {ms.dueDate && (
                  <span className={cn("text-[11px] tabular-nums shrink-0", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{formatDateShort(ms.dueDate)}</span>
                )}
                {ms.amount > 0 && <span className="text-[11px] font-mono text-muted-foreground shrink-0">{formatMoney(ms.amount)}</span>}
                <button onClick={() => deleteMilestone(ms.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity">
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
