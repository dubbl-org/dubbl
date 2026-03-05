"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Square,
  Clock,
  Pause,
  RotateCcw,
  TrendingUp,
  CalendarDays,
  Zap,
  DollarSign,
  Timer,
  CircleDot,
} from "lucide-react";
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
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
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
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDesc, setTimerDesc] = useState("");
  const [timerTaskId, setTimerTaskId] = useState("none");
  const [timerBillable, setTimerBillable] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startTimer() {
    setTimerRunning(true);
    setTimerPaused(false);
    setTimerSeconds(0);
    startTimeRef.current = new Date();
    timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
  }

  function pauseTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerPaused(true);
  }

  function resumeTimer() {
    setTimerPaused(false);
    timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
  }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
    setTimerSeconds(0);
    setTimerDesc("");
    startTimeRef.current = null;
  }

  async function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimerPaused(false);
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
          isBillable: timerBillable,
          taskId: timerTaskId === "none" ? null : timerTaskId,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Logged ${formatHours(minutes)}`);
      setTimerDesc("");
      setTimerSeconds(0);
      setTimerTaskId("none");
      startTimeRef.current = null;
      refresh();
    } catch {
      toast.error("Failed to save time entry");
    }
  }

  function formatTimer(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return { h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
  }

  if (!proj) return null;

  const entries = proj.timeEntries;
  const tasks = proj.tasks || [];
  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalAmount = entries.reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);
  const billableMinutes = entries.filter(e => e.isBillable).reduce((sum, e) => sum + e.minutes, 0);
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  const unbilledMinutes = entries.filter(e => e.isBillable && !e.invoiceId).reduce((sum, e) => sum + e.minutes, 0);
  const unbilledAmount = entries.filter(e => e.isBillable && !e.invoiceId).reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);

  // Today's entries
  const today = new Date().toISOString().split("T")[0];
  const todayMinutes = entries.filter(e => e.date === today).reduce((sum, e) => sum + e.minutes, 0);
  const todayEntries = entries.filter(e => e.date === today).length;

  // This week's data for chart
  const weekDays = getWeekDays();
  const weekData = weekDays.map(d => {
    const dayEntries = entries.filter(e => e.date === d.date);
    const mins = dayEntries.reduce((sum, e) => sum + e.minutes, 0);
    const billableMins = dayEntries.filter(e => e.isBillable).reduce((sum, e) => sum + e.minutes, 0);
    return {
      day: d.label,
      date: d.date,
      hours: Math.round((mins / 60) * 100) / 100,
      billable: Math.round((billableMins / 60) * 100) / 100,
      isToday: d.date === today,
    };
  });
  const weekTotalMinutes = weekData.reduce((sum, d) => sum + d.hours * 60, 0);
  const weekAvgMinutes = Math.round(weekTotalMinutes / weekDays.filter((_, i) => weekData[i].hours > 0).length || 0);

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

  const timerTime = formatTimer(timerSeconds);

  return (
    <div className="space-y-4">
      {/* Top: Timer + Weekly Chart side by side */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_1.5fr]">
        {/* Timer Card */}
        <div className={cn(
          "rounded-xl border bg-card p-5 flex flex-col",
          timerRunning && !timerPaused && "border-emerald-300 bg-gradient-to-b from-emerald-50/40 to-card",
          timerPaused && "border-amber-300 bg-gradient-to-b from-amber-50/30 to-card",
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "size-2 rounded-full",
                timerRunning && !timerPaused && "bg-emerald-500 animate-pulse",
                timerPaused && "bg-amber-500",
                !timerRunning && "bg-muted-foreground/20",
              )} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {timerRunning ? (timerPaused ? "Paused" : "Recording") : "Timer"}
              </span>
            </div>
            {timerRunning && startTimeRef.current && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Started {startTimeRef.current.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Timer Display */}
          <div className="flex items-center justify-center py-4">
            <div className="flex items-baseline gap-1 select-none">
              <span className={cn(
                "text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerRunning && !timerPaused && "text-emerald-700",
                timerPaused && "text-amber-700",
                !timerRunning && "text-muted-foreground/30",
              )}>
                {timerTime.h}
              </span>
              <span className={cn(
                "text-2xl font-light transition-colors",
                timerRunning && !timerPaused ? "text-emerald-400 animate-pulse" : "text-muted-foreground/20",
              )}>:</span>
              <span className={cn(
                "text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerRunning && !timerPaused && "text-emerald-700",
                timerPaused && "text-amber-700",
                !timerRunning && "text-muted-foreground/30",
              )}>
                {timerTime.m}
              </span>
              <span className={cn(
                "text-2xl font-light transition-colors",
                timerRunning && !timerPaused ? "text-emerald-400 animate-pulse" : "text-muted-foreground/20",
              )}>:</span>
              <span className={cn(
                "text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerRunning && !timerPaused && "text-emerald-600",
                timerPaused && "text-amber-600",
                !timerRunning && "text-muted-foreground/20",
              )}>
                {timerTime.s}
              </span>
            </div>
          </div>

          {/* Timer Description + Task */}
          {timerRunning && (
            <div className="space-y-2 mb-3">
              <Input
                value={timerDesc}
                onChange={e => setTimerDesc(e.target.value)}
                placeholder="What are you working on?"
                className="h-8 text-xs bg-background/50"
              />
              {tasks.length > 0 && (
                <Select value={timerTaskId} onValueChange={setTimerTaskId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Link to task..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No task</SelectItem>
                    {tasks.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                onClick={() => setTimerBillable(!timerBillable)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 transition-colors w-fit",
                  timerBillable
                    ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    : "text-muted-foreground bg-muted hover:bg-muted/80",
                )}
              >
                <DollarSign className="size-3" />
                {timerBillable ? "Billable" : "Non-billable"}
              </button>
            </div>
          )}

          {/* Timer Controls */}
          <div className="flex items-center gap-2 mt-auto">
            {!timerRunning ? (
              <Button
                size="sm"
                className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 gap-2 text-sm font-medium"
                onClick={startTimer}
              >
                <Play className="size-3.5 fill-current" />
                Start Timer
              </Button>
            ) : (
              <>
                {timerPaused ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-2 text-sm border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={resumeTimer}
                  >
                    <Play className="size-3.5 fill-current" />
                    Resume
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-2 text-sm border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={pauseTimer}
                  >
                    <Pause className="size-3.5" />
                    Pause
                  </Button>
                )}
                <Button
                  size="sm"
                  className="flex-1 h-9 gap-2 text-sm bg-emerald-600 hover:bg-emerald-700"
                  onClick={stopTimer}
                >
                  <Square className="size-3 fill-current" />
                  Save
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-9 text-muted-foreground hover:text-red-600"
                  onClick={resetTimer}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Weekly Chart + Stats */}
        <div className="rounded-xl border bg-card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This Week</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">{formatHours(Math.round(weekTotalMinutes))} total</span>
          </div>

          {/* Weekly Bar Chart */}
          <div className="flex-1 min-h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData} barSize={28} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}h`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
                  }}
                  formatter={(value: number | undefined, name: string | undefined) => [
                    `${value ?? 0}h`,
                    name === "billable" ? "Billable" : "Total",
                  ]}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.3 }}
                />
                <Bar dataKey="hours" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} name="total" />
                <Bar dataKey="billable" fill="#10b981" radius={[4, 4, 0, 0]} name="billable" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <StatCard
          label="Today"
          value={formatHours(todayMinutes)}
          sub={`${todayEntries} ${todayEntries === 1 ? "entry" : "entries"}`}
          icon={<Zap className="size-3.5" />}
          accent={todayMinutes > 0 ? "emerald" : undefined}
        />
        <StatCard
          label="Total Time"
          value={formatHours(totalMinutes)}
          sub={`${entries.length} entries`}
          icon={<Clock className="size-3.5" />}
        />
        <StatCard
          label="Earned"
          value={formatMoney(totalAmount)}
          sub={`${billablePct}% billable`}
          icon={<DollarSign className="size-3.5" />}
          accent="emerald"
        />
        <StatCard
          label="Unbilled"
          value={unbilledAmount > 0 ? formatMoney(unbilledAmount) : formatHours(unbilledMinutes)}
          sub={unbilledMinutes > 0 ? formatHours(unbilledMinutes) : "all invoiced"}
          icon={<CircleDot className="size-3.5" />}
          accent={unbilledMinutes > 0 ? "amber" : undefined}
        />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          All Entries
        </p>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" />Log Time
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

// --- Helper Components ---

function StatCard({ label, value, sub, icon, accent }: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  accent?: "emerald" | "amber" | "blue";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn(
          "text-muted-foreground/50",
          accent === "emerald" && "text-emerald-500/60",
          accent === "amber" && "text-amber-500/60",
          accent === "blue" && "text-blue-500/60",
        )}>
          {icon}
        </span>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={cn(
        "text-lg font-bold font-mono tabular-nums mt-0.5",
        accent === "emerald" && "text-emerald-600",
        accent === "amber" && "text-amber-600",
        accent === "blue" && "text-blue-600",
      )}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function getWeekDays() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  const days: { date: string; label: string }[] = [];
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      date: d.toISOString().split("T")[0],
      label: dayLabels[i],
    });
  }
  return days;
}
