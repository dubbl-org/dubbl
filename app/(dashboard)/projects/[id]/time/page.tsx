"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Plus, Play, Square, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useProject, formatHours, formatDateShort } from "../project-context";

export default function TimePage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entryDesc, setEntryDesc] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryHours, setEntryHours] = useState("");
  const [entryBillable, setEntryBillable] = useState("true");
  const [entryTaskId, setEntryTaskId] = useState("none");

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDesc, setTimerDesc] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer() {
    setTimerRunning(true);
    setTimerSeconds(0);
    timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
  }

  async function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    const minutes = Math.max(1, Math.round(timerSeconds / 60));
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          date: new Date().toISOString().split("T")[0],
          description: timerDesc || null,
          minutes,
          isBillable: true,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Logged ${formatHours(minutes)}`);
      setTimerDesc("");
      setTimerSeconds(0);
      refresh();
    } catch {
      toast.error("Failed to save time entry");
    }
  }

  function formatTimer(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  if (!proj) return null;

  const entries = proj.timeEntries;
  const tasks = proj.tasks || [];
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalAmount = entries.reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);
  const billableMinutes = entries.filter(e => e.isBillable).reduce((sum, e) => sum + e.minutes, 0);
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  const unbilledMinutes = entries.filter(e => e.isBillable && !e.invoiceId).reduce((sum, e) => sum + e.minutes, 0);

  const columns: Column<typeof entries[0]>[] = [
    { key: "date", header: "Date", className: "w-24", render: r => <span className="text-[13px] tabular-nums">{formatDateShort(r.date)}</span> },
    { key: "user", header: "User", className: "w-28", render: r => <span className="text-xs text-muted-foreground">{r.user?.name || "-"}</span> },
    { key: "description", header: "Description", render: r => (
      <div>
        <span className="text-[13px]">{r.description || "-"}</span>
        {r.task && <span className="text-[10px] text-muted-foreground block">Task: {r.task.title}</span>}
      </div>
    )},
    { key: "duration", header: "Duration", className: "w-20 text-right", render: r => <span className="text-[13px] font-mono tabular-nums font-medium">{formatHours(r.minutes)}</span> },
    { key: "amount", header: "Amount", className: "w-24 text-right", render: r => <span className="text-[13px] font-mono tabular-nums">{formatMoney(Math.round((r.minutes / 60) * r.hourlyRate))}</span> },
    { key: "status", header: "", className: "w-20", render: r => {
      if (r.invoiceId) return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[9px] h-4">Invoiced</Badge>;
      return <Badge variant="outline" className={cn("text-[9px] h-4", r.isBillable ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600")}>{r.isBillable ? "Billable" : "Non-bill."}</Badge>;
    }},
  ];

  async function handleAdd() {
    if (!orgId) return;
    const mins = entryHours ? Math.round(parseFloat(entryHours) * 60) : parseInt(entryMinutes);
    if (!mins || mins <= 0) { toast.error("Enter a valid duration"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          date: entryDate,
          description: entryDesc || null,
          minutes: mins,
          isBillable: entryBillable === "true",
          taskId: entryTaskId === "none" ? null : entryTaskId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Time entry added");
      setAddOpen(false);
      setEntryDesc(""); setEntryMinutes(""); setEntryHours(""); setEntryTaskId("none");
      refresh();
    } catch { toast.error("Failed to add time entry"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Timer + Stats */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr]">
        <div className={cn("rounded-lg border bg-card p-3 sm:col-span-1", timerRunning && "border-emerald-300 bg-emerald-50/30")}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Timer</p>
          {timerRunning ? (
            <div className="space-y-2">
              <p className="text-xl font-bold font-mono tabular-nums tracking-tight text-emerald-700">{formatTimer(timerSeconds)}</p>
              <Input
                value={timerDesc}
                onChange={e => setTimerDesc(e.target.value)}
                placeholder="What are you working on?"
                className="h-7 text-xs"
              />
              <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={stopTimer}>
                <Square className="mr-1.5 size-3" />Stop & Save
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xl font-bold font-mono tabular-nums tracking-tight text-muted-foreground/50">00:00:00</p>
              <Button size="sm" className="w-full h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={startTimer}>
                <Play className="mr-1.5 size-3" />Start Timer
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Time</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{formatHours(totalMinutes)}</p>
          <p className="text-[10px] text-muted-foreground">{entries.length} entries</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">{formatMoney(totalAmount)}</p>
          <p className="text-[10px] text-muted-foreground">{billablePct}% billable</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unbilled</p>
          <p className="text-lg font-bold font-mono tabular-nums text-amber-600 mt-0.5">{formatHours(unbilledMinutes)}</p>
          <p className="text-[10px] text-muted-foreground">awaiting invoice</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 size-3.5" />Log Time
        </Button>
      </div>

      {/* Log Time Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Clock className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Log Time Entry</SheetTitle>
                <SheetDescription>Record time spent on this project.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">When</p>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker value={entryDate} onChange={setEntryDate} placeholder="Select date" />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={entryDesc} onChange={e => setEntryDesc(e.target.value)} placeholder="What did you work on?" rows={3} />
              </div>
              {tasks.length > 0 && (
                <div className="space-y-2">
                  <Label>Related Task</Label>
                  <Select value={entryTaskId} onValueChange={setEntryTaskId}>
                    <SelectTrigger><SelectValue placeholder="No task" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No task</SelectItem>
                      {tasks.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Hours</Label>
                  <Input type="number" step="0.25" min={0} value={entryHours} onChange={e => { setEntryHours(e.target.value); setEntryMinutes(""); }} placeholder="e.g. 1.5" />
                </div>
                <div className="space-y-2">
                  <Label>Or Minutes</Label>
                  <Input type="number" min={1} value={entryMinutes} onChange={e => { setEntryMinutes(e.target.value); setEntryHours(""); }} placeholder="e.g. 90" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Billable</Label>
                <Select value={entryBillable} onValueChange={setEntryBillable}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes - Billable</SelectItem>
                    <SelectItem value="false">No - Non-billable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Adding..." : "Add Entry"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <DataTable columns={columns} data={entries} emptyMessage="No time entries yet. Start the timer or log time manually." />
    </div>
  );
}
