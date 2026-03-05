"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Plus, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [entryBillable, setEntryBillable] = useState("true");

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
    const mins = parseInt(entryMinutes);
    if (!mins || mins <= 0) { toast.error("Enter a valid duration"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/time-entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ date: entryDate, description: entryDesc || null, minutes: mins, isBillable: entryBillable === "true" }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Time entry added");
      setAddOpen(false);
      setEntryDesc(""); setEntryMinutes("");
      refresh();
    } catch { toast.error("Failed to add time entry"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Timer + Stats */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr]">
        {/* Live Timer */}
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
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8">
              <Plus className="mr-1.5 size-3.5" />Log Time
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Time Entry</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={entryDesc} onChange={e => setEntryDesc(e.target.value)} placeholder="What did you work on?" /></div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">Duration (minutes) *</Label><Input type="number" min={1} value={entryMinutes} onChange={e => setEntryMinutes(e.target.value)} placeholder="60" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Billable</Label>
                  <Select value={entryBillable} onValueChange={setEntryBillable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select>
                </div>
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Adding..." : "Add Entry"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={columns} data={entries} emptyMessage="No time entries yet. Start the timer or log time manually." />
    </div>
  );
}
