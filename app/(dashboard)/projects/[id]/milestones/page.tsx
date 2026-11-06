"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Flag, Target, Loader2, Users, DollarSign, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useProject, formatDateShort, pct, isPastDue, projectFetch, errorText } from "../project-context";
import { ProjectInvoiceSheet } from "../invoice-sheet";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";

export default function MilestonesPage() {
  const { project: proj, orgId, projectId, canManage } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignMilestoneId, setAssignMilestoneId] = useState<string | null>(null);
  interface Assignment { id: string; amount: number; description: string | null; isPaid: boolean; member?: { user?: { name: string | null; email: string | null } } }
  const [assignMemberId, setAssignMemberId] = useState("none");
  const [assignAmount, setAssignAmount] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Projects · Milestones");

  const { data: assignmentsData, loading: loadingAssignments } = useApi<{ assignments?: Assignment[] }>(
    assignMilestoneId ? `/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments` : null
  );
  const assignments = assignmentsData?.assignments ?? [];

  if (!proj) return null;

  const milestones = proj.milestones;
  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;
  const totalAmount = milestones.reduce((s, m) => s + m.amount, 0);
  const completedAmount = milestones.filter(m => m.status === "completed").reduce((s, m) => s + m.amount, 0);
  const totalInvoiced = milestones.reduce((s, m) => s + m.invoicedAmountCents, 0);

  async function handleAdd() {
    if (!orgId || !title.trim()) return;
    setSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones`, {
        method: "POST",
        body: { title: title.trim(), description: desc || null, dueDate: dueDate || null, amount: Math.round(parseFloat(amount || "0") * 100) },
      });
      toast.success("Milestone created");
      setAddOpen(false);
      setTitle(""); setDesc(""); setDueDate(""); setAmount("");
    } catch (err) { toast.error(errorText(err, "Failed to create milestone")); }
    finally { setSaving(false); }
  }

  async function toggleComplete(ms: typeof milestones[0]) {
    if (!orgId || togglingId) return;
    setTogglingId(ms.id);
    try {
      const newStatus = ms.status === "completed" ? "upcoming" : "completed";
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones/${ms.id}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
    } catch (err) { toast.error(errorText(err, "Failed to update milestone")); }
    finally { setTogglingId(null); }
  }

  async function deleteMilestone(ms: typeof milestones[0]) {
    if (!orgId || deletingId) return;
    const ok = await confirm({
      title: `Delete "${ms.title}"?`,
      description: "The milestone and its member assignments are removed for good. A milestone that is on an invoice can't be deleted.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(ms.id);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones/${ms.id}`, { method: "DELETE" });
      toast.success("Milestone deleted");
    } catch (err) { toast.error(errorText(err, "Failed to delete milestone")); }
    finally { setDeletingId(null); }
  }

  const members = proj.members;

  async function handleAddAssignment() {
    if (!orgId || !assignMilestoneId || assignMemberId === "none") return;
    setAssignSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments`, {
        method: "POST",
        body: {
          memberId: assignMemberId,
          amount: Math.round(parseFloat(assignAmount || "0") * 100),
          description: assignDesc || null,
        },
      });
      toast.success("Assignment added");
      setAssignMemberId("none"); setAssignAmount(""); setAssignDesc("");
    } catch (err) { toast.error(errorText(err, "Failed to add assignment")); }
    finally { setAssignSaving(false); }
  }

  async function setAssignmentPaid(assignmentId: string, isPaid: boolean) {
    if (!orgId || !assignMilestoneId) return;
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments?assignmentId=${assignmentId}`, {
        method: "PATCH",
        body: { isPaid },
      });
      toast.success(isPaid ? "Marked as paid" : "Marked as unpaid");
    } catch (err) { toast.error(errorText(err, "Failed to update assignment")); }
  }

  async function removeAssignment(a: Assignment) {
    if (!orgId || !assignMilestoneId) return;
    const ok = await confirm({
      title: "Remove this assignment?",
      description: `${a.member?.user?.name || a.member?.user?.email || "This member"} will no longer be assigned ${formatMoney(a.amount)} for this milestone.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments?assignmentId=${a.id}`, { method: "DELETE" });
      toast.success("Assignment removed");
    } catch (err) { toast.error(errorText(err, "Failed to remove assignment")); }
  }

  const isBillable = proj.billingType !== "non_billable";

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className={cn("grid gap-2 sm:gap-3 grid-cols-1", isBillable ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Progress</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{completed}/{total}</p>
          {total > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct(completed, total)}%` }} />
            </div>
          )}
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Value</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{formatMoney(totalAmount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Completed Value</p>
          <p className="text-lg font-bold font-mono tabular-nums text-brand-600 mt-0.5">{formatMoney(completedAmount)}</p>
        </div>
        {isBillable && (
          <div className="rounded-lg border bg-card p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Invoiced</p>
            <p className="text-lg font-bold font-mono tabular-nums text-blue-600 mt-0.5">{formatMoney(totalInvoiced)}</p>
            {totalAmount > 0 && (
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct(totalInvoiced, totalAmount)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {isBillable && canManage && proj.contactId && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setInvoiceOpen(true)}>
            <FileText className="size-3.5" />Create Invoice
          </Button>
        )}
        {canManage && (
          <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />Milestone
          </Button>
        )}
      </div>

      {/* Add Milestone Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Target className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">New Milestone</SheetTitle>
                <SheetDescription>Add a project milestone or deliverable.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Milestone title" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this milestone represent?" rows={3} />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schedule & Value</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Select due date" />
                </div>
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <CurrencyInput prefix="$" value={amount} onChange={setAmount} />
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-brand-600 hover:bg-brand-700">
              {saving ? "Creating..." : "Create Milestone"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <Flag className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No milestones yet</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {milestones.map((ms) => {
            const overdue = isPastDue(ms.dueDate) && ms.status !== "completed";
            return (
              <div key={ms.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-muted/20 transition-colors group">
                <button onClick={() => toggleComplete(ms)} disabled={!canManage || togglingId === ms.id} className="shrink-0" title={canManage ? (ms.status === "completed" ? "Mark as not completed" : "Mark as completed") : undefined}>
                  {togglingId === ms.id ? (
                    <Loader2 className="size-5 text-muted-foreground/40 animate-spin" />
                  ) : ms.status === "completed" ? (
                    <CheckCircle2 className="size-5 text-brand-500" />
                  ) : (
                    <Target className="size-5 text-muted-foreground/40 hover:text-brand-400 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <span className={cn("text-[13px] font-medium", ms.status === "completed" && "line-through text-muted-foreground")}>{ms.title}</span>
                  {ms.description && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{ms.description}</p>}
                </div>
                {ms.dueDate && (
                  <span className={cn("text-[11px] tabular-nums shrink-0", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{formatDateShort(ms.dueDate)}</span>
                )}
                {ms.amount > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[11px] font-mono text-muted-foreground">{formatMoney(ms.amount)}</span>
                    {ms.invoicedAmountCents > 0 && ms.invoicedAmountCents >= ms.amount && (
                      <Badge variant="outline" className="text-[9px] h-4 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">Invoiced</Badge>
                    )}
                    {ms.invoicedAmountCents > 0 && ms.invoicedAmountCents < ms.amount && (
                      <Badge variant="outline" className="text-[9px] h-4 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">Partial</Badge>
                    )}
                  </div>
                )}
                <button onClick={() => setAssignMilestoneId(ms.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-brand-600 transition-opacity" title="Manage Assignments">
                  <Users className="size-3" />
                </button>
                {canManage && (
                  <button onClick={() => deleteMilestone(ms)} disabled={deletingId === ms.id} title="Delete milestone" className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity", deletingId === ms.id && "opacity-100 pointer-events-none")}>
                    {deletingId === ms.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments Sheet */}
      <Sheet open={!!assignMilestoneId} onOpenChange={open => { if (!open) setAssignMilestoneId(null); }}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Users className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Manage Assignments</SheetTitle>
                <SheetDescription>Assign members to this milestone and track payments.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            {/* Existing Assignments */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current Assignments</p>
              {loadingAssignments ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : assignments.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-3">No assignments yet.</p>
              ) : (
                <div className="rounded-lg border divide-y">
                  {assignments.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{a.member?.user?.name || a.member?.user?.email || "Member"}</p>
                        {a.description && <p className="text-[11px] text-muted-foreground truncate">{a.description}</p>}
                      </div>
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">{formatMoney(a.amount)}</span>
                      {a.isPaid ? (
                        canManage ? (
                          <button onClick={() => setAssignmentPaid(a.id, false)} title="Mark as unpaid">
                            <Badge variant="outline" className="text-[9px] h-4 bg-brand-50 text-brand-700 border-brand-200">Paid</Badge>
                          </button>
                        ) : (
                          <Badge variant="outline" className="text-[9px] h-4 bg-brand-50 text-brand-700 border-brand-200">Paid</Badge>
                        )
                      ) : canManage ? (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setAssignmentPaid(a.id, true)}>
                          <DollarSign className="size-3 mr-1" />Mark Paid
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-[9px] h-4">Unpaid</Badge>
                      )}
                      {canManage && (
                        <button onClick={() => removeAssignment(a)} className="text-muted-foreground hover:text-red-600" title="Remove assignment">
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canManage && <div className="h-px bg-border" />}

            {/* Add Assignment Form */}
            {canManage && <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add Assignment</p>
              <div className="space-y-2">
                <Label>Member</Label>
                <Select value={assignMemberId} onValueChange={setAssignMemberId}>
                  <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>Select member...</SelectItem>
                    {members.map(m => (
                      <SelectItem key={m.member.id} value={m.member.id}>{m.member.user.name || m.member.user.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Amount</Label>
                  <CurrencyInput prefix="$" value={assignAmount} onChange={setAssignAmount} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={assignDesc} onChange={e => setAssignDesc(e.target.value)} placeholder="Optional note" />
                </div>
              </div>
            </div>}
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAssignMilestoneId(null)}>Close</Button>
            {canManage && (
              <Button onClick={handleAddAssignment} disabled={assignSaving || assignMemberId === "none"} className="bg-brand-600 hover:bg-brand-700">
                {assignSaving ? "Adding..." : "Add Assignment"}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ProjectInvoiceSheet open={invoiceOpen} onOpenChange={setInvoiceOpen} />
      {confirmDialog}
    </div>
  );
}
