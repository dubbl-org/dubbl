"use client";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2, Flag, Target, Loader2, Users, DollarSign, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useProject, formatDateShort, pct } from "../project-context";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function MilestonesPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assignMilestoneId, setAssignMilestoneId] = useState<string | null>(null);
  interface Assignment { id: string; amount: number; description: string | null; paid: boolean; member?: { user?: { name: string | null; email: string | null } } }
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignMemberId, setAssignMemberId] = useState("none");
  const [assignAmount, setAssignAmount] = useState("");
  const [assignDesc, setAssignDesc] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);

  // Progress invoice state
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>([]);
  const [selectedTimeEntryIds, setSelectedTimeEntryIds] = useState<string[]>([]);
  const [fixedPercent, setFixedPercent] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  // Data from GET endpoint
  interface UninvoicedMilestone { id: string; title: string; amount: number; invoicedAmountCents: number; remaining: number }
  interface UninvoicedTimeEntry { id: string; date: string; description: string | null; minutes: number; hourlyRate: number; amount: number }
  interface UninvoicedData {
    billingType: string;
    milestones?: UninvoicedMilestone[];
    timeEntries?: UninvoicedTimeEntry[];
    fixedPrice?: number;
    totalInvoiced?: number;
    remaining?: number;
    invoicedPercent?: number;
  }
  const [uninvoicedData, setUninvoicedData] = useState<UninvoicedData | null>(null);
  useDocumentTitle("Projects · Milestones");

  useEffect(() => {
    if (!assignMilestoneId || !orgId) return;
    setLoadingAssignments(true);
    fetch(`/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments`, {
      headers: { "x-organization-id": orgId },
    })
      .then(r => r.json())
      .then(data => { if (data.assignments) setAssignments(data.assignments); })
      .finally(() => setLoadingAssignments(false));
  }, [assignMilestoneId, orgId, projectId]);

  // Fetch uninvoiced data when invoice sheet opens
  useEffect(() => {
    if (!invoiceOpen || !orgId) return;
    setInvoiceLoading(true);
    setUninvoicedData(null);
    setSelectedMilestoneIds([]);
    setSelectedTimeEntryIds([]);
    setFixedPercent("");
    setInvoiceNotes("");
    fetch(`/api/v1/projects/${projectId}/progress-invoice`, {
      headers: { "x-organization-id": orgId },
    })
      .then(r => r.json())
      .then(data => setUninvoicedData(data))
      .finally(() => setInvoiceLoading(false));
  }, [invoiceOpen, orgId, projectId]);

  // Calculate invoice preview total (must be before early returns)
  const invoicePreviewTotal = useMemo(() => {
    if (!uninvoicedData || !proj) return 0;
    if (uninvoicedData.billingType === "milestone") {
      return (uninvoicedData.milestones || [])
        .filter((m) => selectedMilestoneIds.includes(m.id))
        .reduce((s: number, m) => s + m.remaining, 0);
    }
    if (uninvoicedData.billingType === "hourly") {
      return (uninvoicedData.timeEntries || [])
        .filter((e) => selectedTimeEntryIds.includes(e.id))
        .reduce((s: number, e) => s + e.amount, 0);
    }
    if (uninvoicedData.billingType === "fixed") {
      const pctVal = Math.min(100, Math.max(0, parseFloat(fixedPercent) || 0));
      return Math.round((proj.fixedPrice * pctVal) / 100);
    }
    return 0;
  }, [uninvoicedData, selectedMilestoneIds, selectedTimeEntryIds, fixedPercent, proj]);

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
    if (!orgId || togglingId) return;
    setTogglingId(ms.id);
    try {
      const newStatus = ms.status === "completed" ? "upcoming" : "completed";
      await fetch(`/api/v1/projects/${projectId}/milestones/${ms.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ status: newStatus }),
      });
      refresh();
    } finally { setTogglingId(null); }
  }

  async function deleteMilestone(msId: string) {
    if (!orgId || deletingId) return;
    setDeletingId(msId);
    try {
      await fetch(`/api/v1/projects/${projectId}/milestones/${msId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
      refresh();
    } finally { setDeletingId(null); }
  }

  const members = proj.members;

  async function handleAddAssignment() {
    if (!orgId || !assignMilestoneId || assignMemberId === "none") return;
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          memberId: assignMemberId,
          amount: Math.round(parseFloat(assignAmount || "0") * 100),
          description: assignDesc || null,
        }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      toast.success("Assignment added");
      setAssignMemberId("none"); setAssignAmount(""); setAssignDesc("");
      // Refresh assignments
      const r = await fetch(`/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await r.json();
      if (data.assignments) setAssignments(data.assignments);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setAssignSaving(false); }
  }

  async function markAssignmentPaid(assignmentId: string) {
    if (!orgId || !assignMilestoneId) return;
    try {
      await fetch(`/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ paid: true }),
      });
      toast.success("Marked as paid");
      const r = await fetch(`/api/v1/projects/${projectId}/milestones/${assignMilestoneId}/assignments`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await r.json();
      if (data.assignments) setAssignments(data.assignments);
    } catch { toast.error("Failed to update"); }
  }

  async function handleCreateInvoice() {
    if (!orgId || !proj || invoicePreviewTotal <= 0) return;
    setInvoiceSaving(true);
    try {
      const body: Record<string, unknown> = { notes: invoiceNotes || undefined };
      if (proj.billingType === "milestone") {
        body.milestoneIds = selectedMilestoneIds;
      } else if (proj.billingType === "hourly") {
        body.timeEntryIds = selectedTimeEntryIds;
      } else if (proj.billingType === "fixed") {
        body.percentageToInvoice = Math.min(100, Math.max(0, parseFloat(fixedPercent) || 0));
      }

      const res = await fetch(`/api/v1/projects/${projectId}/progress-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create invoice");
      }

      const data = await res.json();
      toast.success(`Invoice ${data.invoice.invoiceNumber} created`);
      setInvoiceOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setInvoiceSaving(false);
    }
  }

  function toggleMilestoneSelection(id: string) {
    setSelectedMilestoneIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleTimeEntrySelection(id: string) {
    setSelectedTimeEntryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
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
        {isBillable && (
          <Button size="sm" variant="outline" className="h-8" onClick={() => setInvoiceOpen(true)}>
            <FileText className="size-3.5" />Create Invoice
          </Button>
        )}
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />Milestone
        </Button>
      </div>

      {/* Add Milestone Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
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
            <Button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-emerald-600 hover:bg-emerald-700">
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
            const overdue = ms.dueDate && new Date(ms.dueDate) < new Date() && ms.status !== "completed";
            const uninvoiced = ms.amount - ms.invoicedAmountCents;
            return (
              <div key={ms.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-muted/20 transition-colors group">
                <button onClick={() => toggleComplete(ms)} disabled={togglingId === ms.id} className="shrink-0">
                  {togglingId === ms.id ? (
                    <Loader2 className="size-5 text-muted-foreground/40 animate-spin" />
                  ) : ms.status === "completed" ? (
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
                <button onClick={() => { setAssignMilestoneId(ms.id); setAssignments([]); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-600 transition-opacity" title="Manage Assignments">
                  <Users className="size-3" />
                </button>
                <button onClick={() => deleteMilestone(ms.id)} disabled={deletingId === ms.id} className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity", deletingId === ms.id && "opacity-100 pointer-events-none")}>
                  {deletingId === ms.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments Sheet */}
      <Sheet open={!!assignMilestoneId} onOpenChange={open => { if (!open) { setAssignMilestoneId(null); setAssignments([]); } }}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
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
                      {a.paid ? (
                        <Badge variant="outline" className="text-[9px] h-4 bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                      ) : (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => markAssignmentPaid(a.id)}>
                          <DollarSign className="size-3 mr-1" />Mark Paid
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* Add Assignment Form */}
            <div className="space-y-4">
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
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAssignMilestoneId(null)}>Close</Button>
            <Button onClick={handleAddAssignment} disabled={assignSaving || assignMemberId === "none"} className="bg-emerald-600 hover:bg-emerald-700">
              {assignSaving ? "Adding..." : "Add Assignment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Progress Invoice Sheet */}
      <Sheet open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <FileText className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Progress Invoice</SheetTitle>
                <SheetDescription>Create an invoice for work completed on this project.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            {invoiceLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : uninvoicedData ? (
              <>
                {/* Milestone billing */}
                {uninvoicedData.billingType === "milestone" && (
                  <div className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Select milestones to invoice</p>
                    {(uninvoicedData.milestones ?? []).length > 0 ? (
                      <div className="rounded-lg border divide-y">
                        {(uninvoicedData.milestones ?? []).map((m) => {
                          const hasRemaining = m.remaining > 0;
                          return (
                            <label
                              key={m.id}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 transition-colors",
                                hasRemaining ? "cursor-pointer hover:bg-muted/20" : "opacity-50"
                              )}
                            >
                              <Checkbox
                                checked={selectedMilestoneIds.includes(m.id)}
                                onCheckedChange={() => hasRemaining && toggleMilestoneSelection(m.id)}
                                disabled={!hasRemaining}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium truncate">{m.title}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  Total: {formatMoney(m.amount)} · Invoiced: {formatMoney(m.invoicedAmountCents)}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className={cn("text-[13px] font-mono tabular-nums font-medium", hasRemaining ? "text-foreground" : "text-muted-foreground")}>
                                  {formatMoney(m.remaining)}
                                </p>
                                <p className="text-[10px] text-muted-foreground">remaining</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground py-3">All milestones have been fully invoiced.</p>
                    )}
                  </div>
                )}

                {/* Hourly billing */}
                {uninvoicedData.billingType === "hourly" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Uninvoiced time entries</p>
                      {(uninvoicedData.timeEntries ?? []).length > 0 && (
                        <button
                          className="text-[11px] text-blue-600 hover:underline font-medium"
                          onClick={() => {
                            const allIds = (uninvoicedData.timeEntries ?? []).map((e) => e.id);
                            setSelectedTimeEntryIds(prev =>
                              prev.length === allIds.length ? [] : allIds
                            );
                          }}
                        >
                          {selectedTimeEntryIds.length === (uninvoicedData.timeEntries ?? []).length ? "Deselect all" : "Select all"}
                        </button>
                      )}
                    </div>
                    {(uninvoicedData.timeEntries ?? []).length > 0 ? (
                      <div className="rounded-lg border divide-y max-h-[400px] overflow-y-auto">
                        {(uninvoicedData.timeEntries ?? []).map((e) => (
                          <label key={e.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors">
                            <Checkbox
                              checked={selectedTimeEntryIds.includes(e.id)}
                              onCheckedChange={() => toggleTimeEntrySelection(e.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] truncate">{e.description || "Time entry"}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {e.date} · {Math.round((e.minutes / 60) * 100) / 100}h @ {formatMoney(e.hourlyRate)}/hr
                              </p>
                            </div>
                            <span className="text-[13px] font-mono tabular-nums font-medium shrink-0">
                              {formatMoney(e.amount)}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground py-3">No uninvoiced time entries.</p>
                    )}
                  </div>
                )}

                {/* Fixed billing */}
                {uninvoicedData.billingType === "fixed" && (
                  <div className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Fixed price progress</p>
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-muted-foreground">Fixed price</span>
                          <span className="font-mono tabular-nums font-medium">{formatMoney(uninvoicedData.fixedPrice ?? 0)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-muted-foreground">Already invoiced</span>
                          <span className="font-mono tabular-nums">{formatMoney(uninvoicedData.totalInvoiced ?? 0)} ({uninvoicedData.invoicedPercent ?? 0}%)</span>
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="text-muted-foreground">Remaining</span>
                          <span className="font-mono tabular-nums font-medium text-emerald-600">{formatMoney(uninvoicedData.remaining ?? 0)}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{ width: `${uninvoicedData.invoicedPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Percentage to invoice</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={100 - (uninvoicedData.invoicedPercent || 0)}
                          value={fixedPercent}
                          onChange={e => setFixedPercent(e.target.value)}
                          placeholder={`0 - ${100 - (uninvoicedData.invoicedPercent || 0)}`}
                          className="font-mono"
                        />
                        <span className="text-[13px] text-muted-foreground shrink-0">%</span>
                      </div>
                      {fixedPercent && (
                        <p className="text-[11px] text-muted-foreground">
                          Amount: {formatMoney(Math.round((proj.fixedPrice * Math.min(100, Math.max(0, parseFloat(fixedPercent) || 0))) / 100))}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div className="h-px bg-border" />
                <div className="space-y-2">
                  <Label>Invoice notes (optional)</Label>
                  <Textarea
                    value={invoiceNotes}
                    onChange={e => setInvoiceNotes(e.target.value)}
                    placeholder="Notes to include on the invoice..."
                    rows={2}
                  />
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground py-3">Failed to load billing data.</p>
            )}
          </div>

          {/* Footer with total preview */}
          <div className="sticky bottom-0 z-10 border-t bg-background/80 backdrop-blur-sm">
            {invoicePreviewTotal > 0 && (
              <div className="px-6 py-3 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-muted-foreground">Invoice total</span>
                  <span className="text-lg font-bold font-mono tabular-nums">{formatMoney(invoicePreviewTotal)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <Button type="button" variant="outline" onClick={() => setInvoiceOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCreateInvoice}
                disabled={invoiceSaving || invoicePreviewTotal <= 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {invoiceSaving ? "Creating..." : "Create Invoice"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
