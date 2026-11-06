"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Square,
  Clock,
  Pause,
  RotateCcw,
  CalendarDays,
  Zap,
  DollarSign,
  CircleDot,
  Filter,
  X,
  Pencil,
  Trash2,
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
import {
  useProject,
  formatHours,
  formatDateShort,
  localISODate,
  localWeekDates,
  summarizeTimeEntries,
  timeEntryAmount,
  projectFetch,
  errorText,
  type TimeEntryData,
  type RunningTimerData,
} from "../project-context";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function TimePage() {
  const { project: proj, orgId, projectId, canContribute, canManage } = useProject();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Drawer state: "add" for new, entry object for edit
  const [drawerMode, setDrawerMode] = useState<"add" | "edit" | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimeEntryData | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [entryDate, setEntryDate] = useState(() => localISODate());
  const [entryDesc, setEntryDesc] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryHours, setEntryHours] = useState("");
  const [entryBillable, setEntryBillable] = useState("true");
  const [entryTaskId, setEntryTaskId] = useState("none");

  // Filters
  const [filterMember, setFilterMember] = useState("all");
  const [filterBillable, setFilterBillable] = useState("all");
  const [filterTask, setFilterTask] = useState("all");

  // Timer state - synced with DB
  const [timerData, setTimerData] = useState<RunningTimerData | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerDesc, setTimerDesc] = useState("");
  const [timerTaskId, setTimerTaskId] = useState("none");
  const [timerBillable, setTimerBillable] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const descSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDescRef = useRef("");
  const lastSavedTaskRef = useRef("none");
  const lastSavedBillableRef = useRef(true);
  const stoppingRef = useRef(false);
  // A timer this page just stopped or reset; the cached project may still list it until it refetches.
  const discardedTimerIdRef = useRef<string | null>(null);
  useDocumentTitle("Projects · Time Entries");

  // Initialize timer from server data
  useEffect(() => {
    if (!proj) return;
    const myTimer = proj.runningTimers?.[0] || null;
    if (myTimer && !timerData && !stoppingRef.current && myTimer.id !== discardedTimerIdRef.current) {
      setTimerData(myTimer);
      setTimerDesc(myTimer.description || "");
      setTimerTaskId(myTimer.taskId || "none");
      setTimerBillable(myTimer.isBillable);
      lastSavedDescRef.current = myTimer.description || "";
      lastSavedTaskRef.current = myTimer.taskId || "none";
      lastSavedBillableRef.current = myTimer.isBillable;

      // Calculate elapsed seconds
      if (myTimer.pausedAt) {
        setTimerSeconds(myTimer.accumulatedSeconds);
      } else {
        // Running: accumulated + time since last resume (startedAt is updated on resume)
        const sinceLast = Math.floor((Date.now() - new Date(myTimer.startedAt).getTime()) / 1000);
        setTimerSeconds(Math.max(0, myTimer.accumulatedSeconds + sinceLast));
      }
    }
  }, [proj, timerData]);

  // Tick the timer
  useEffect(() => {
    if (timerData && !timerData.pausedAt) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerData, timerData?.pausedAt]);

  // Auto-save description/task/billable every 2s when changed
  const saveTimerFields = useCallback(async () => {
    if (!orgId || !timerData) return;
    const updates: Record<string, unknown> = {};
    let hasChanges = false;

    if (timerDesc !== lastSavedDescRef.current) {
      updates.description = timerDesc || null;
      hasChanges = true;
    }
    if (timerTaskId !== lastSavedTaskRef.current) {
      updates.taskId = timerTaskId === "none" ? null : timerTaskId;
      hasChanges = true;
    }
    if (timerBillable !== lastSavedBillableRef.current) {
      updates.isBillable = timerBillable;
      hasChanges = true;
    }

    if (!hasChanges) return;

    try {
      await fetch(`/api/v1/projects/${projectId}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(updates),
      });
      lastSavedDescRef.current = timerDesc;
      lastSavedTaskRef.current = timerTaskId;
      lastSavedBillableRef.current = timerBillable;
    } catch { /* silent */ }
  }, [orgId, projectId, timerData, timerDesc, timerTaskId, timerBillable]);

  useEffect(() => {
    if (!timerData) return;
    if (descSaveRef.current) clearTimeout(descSaveRef.current);
    descSaveRef.current = setTimeout(saveTimerFields, 2000);
    return () => { if (descSaveRef.current) clearTimeout(descSaveRef.current); };
  }, [timerDesc, timerTaskId, timerBillable, saveTimerFields, timerData]);

  async function startTimer() {
    if (!orgId) return;
    try {
      const data = await projectFetch<{ timer: RunningTimerData }>(orgId, `/api/v1/projects/${projectId}/timer`, {
        method: "POST",
        body: { isBillable: true },
      });
      setTimerData(data.timer);
      setTimerSeconds(0);
      setTimerDesc("");
      setTimerTaskId("none");
      setTimerBillable(true);
      lastSavedDescRef.current = "";
      lastSavedTaskRef.current = "none";
      lastSavedBillableRef.current = true;
    } catch (err) { toast.error(errorText(err, "Failed to start timer")); }
  }

  async function pauseTimer() {
    if (!orgId || !timerData) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          pausedAt: new Date().toISOString(),
          accumulatedSeconds: timerSeconds,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTimerData(data.timer);
    } catch { toast.error("Failed to pause timer"); }
  }

  async function resumeTimer() {
    if (!orgId || !timerData) return;
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/timer`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          pausedAt: null,
          accumulatedSeconds: timerSeconds,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTimerData(data.timer);
    } catch { toast.error("Failed to resume timer"); }
  }

  async function resetTimer() {
    if (!orgId) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (timerData) discardedTimerIdRef.current = timerData.id;
    try {
      await fetch(`/api/v1/projects/${projectId}/timer`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
    } catch { /* silent */ }
    setTimerData(null);
    setTimerSeconds(0);
    setTimerDesc("");
    setTimerTaskId("none");
    setTimerBillable(true);
  }

  async function stopTimer() {
    if (!orgId || !timerData || stoppingRef.current) return;
    stoppingRef.current = true;
    discardedTimerIdRef.current = timerData.id;
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerData(null);
    const minutes = Math.max(1, Math.round(timerSeconds / 60));
    try {
      // Save the time entry
      await projectFetch(orgId, `/api/v1/projects/${projectId}/time-entries`, {
        method: "POST",
        body: {
          date: localISODate(),
          description: timerDesc || null,
          minutes,
          isBillable: timerBillable,
          taskId: timerTaskId === "none" ? null : timerTaskId,
        },
      });

      // Delete the running timer
      await fetch(`/api/v1/projects/${projectId}/timer`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });

      toast.success(`Logged ${formatHours(minutes)}`);
      setTimerSeconds(0);
      setTimerDesc("");
      setTimerTaskId("none");
      setTimerBillable(true);
    } catch (err) {
      toast.error(errorText(err, "Failed to save time entry"));
    } finally {
      stoppingRef.current = false;
    }
  }

  function formatTimerDisplay(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return { h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
  }

  // Open drawer for adding
  function openAdd() {
    setDrawerMode("add");
    setEditingEntry(null);
    setEntryDate(localISODate());
    setEntryDesc("");
    setEntryMinutes("");
    setEntryHours("");
    setEntryBillable("true");
    setEntryTaskId("none");
  }

  // Open drawer for editing
  function openEdit(entry: TimeEntryData) {
    setDrawerMode("edit");
    setEditingEntry(entry);
    setEntryDate(entry.date);
    setEntryDesc(entry.description || "");
    const h = entry.minutes / 60;
    if (h === Math.floor(h)) {
      setEntryHours(String(h));
      setEntryMinutes("");
    } else {
      setEntryMinutes(String(entry.minutes));
      setEntryHours("");
    }
    setEntryBillable(entry.isBillable ? "true" : "false");
    setEntryTaskId(entry.taskId || "none");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setEditingEntry(null);
  }

  if (!proj) return null;

  const entries = proj.timeEntries;
  const tasks = proj.tasks || [];
  // Only billable time earns money; non-billable time counts toward hours only.
  const {
    totalMinutes,
    billableAmount: totalAmount,
    billableMinutes,
    unbilledMinutes,
    unbilledAmount,
  } = summarizeTimeEntries(entries);
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  // Invoiced time is locked (only description and task can change); other
  // people's time is read-only unless you manage the project.
  const canEditEntry = (e: TimeEntryData) => canManage || (canContribute && e.userId === proj.viewerUserId);
  const editLocked = drawerMode === "edit" && !!editingEntry?.invoiceId;
  const readOnly = drawerMode === "edit" && !!editingEntry && !canEditEntry(editingEntry);

  // Unique members for filter
  const uniqueMembers = Array.from(
    new Map(entries.filter(e => e.user?.name).map(e => [e.user!.name, e.user!.name])).values()
  );

  // Unique tasks for filter
  const uniqueTasks = Array.from(
    new Map(entries.filter(e => e.task).map(e => [e.task!.id, e.task!])).values()
  );

  // Apply filters
  const filteredEntries = entries.filter(e => {
    if (filterMember !== "all" && e.user?.name !== filterMember) return false;
    if (filterBillable === "billable" && !e.isBillable) return false;
    if (filterBillable === "non-billable" && e.isBillable) return false;
    if (filterBillable === "invoiced" && !e.invoiceId) return false;
    if (filterTask !== "all") {
      if (filterTask === "none" && e.taskId) return false;
      if (filterTask !== "none" && e.task?.id !== filterTask) return false;
    }
    return true;
  });

  const hasActiveFilters = filterMember !== "all" || filterBillable !== "all" || filterTask !== "all";

  function clearFilters() {
    setFilterMember("all");
    setFilterBillable("all");
    setFilterTask("all");
  }

  // Today's entries
  const today = localISODate();
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

  const columns: Column<TimeEntryData>[] = [
    { key: "date", header: "Date", className: "w-24", render: r => <span className="text-[13px] tabular-nums">{formatDateShort(r.date)}</span> },
    { key: "user", header: "User", className: "w-28", render: r => <span className="text-xs text-muted-foreground">{r.user?.name || "-"}</span> },
    { key: "description", header: "Description", render: r => (
      <div>
        <span className="text-[13px]">{r.description || "-"}</span>
        {r.task && <Badge variant="outline" className="text-[9px] h-4 ml-1.5 align-middle">{r.task.title}</Badge>}
      </div>
    )},
    { key: "duration", header: "Duration", className: "w-20 text-right", render: r => <span className="text-[13px] font-mono tabular-nums font-medium">{formatHours(r.minutes)}</span> },
    { key: "amount", header: "Amount", className: "w-24 text-right", render: r => <span className="text-[13px] font-mono tabular-nums">{r.isBillable ? formatMoney(timeEntryAmount(r.minutes, r.hourlyRate)) : "-"}</span> },
    { key: "status", header: "", className: "w-20", render: r => {
      if (r.invoiceId) return <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700 text-[9px] h-4">Invoiced</Badge>;
      return <Badge variant="outline" className={cn("text-[9px] h-4", r.isBillable ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600")}>{r.isBillable ? "Billable" : "Non-bill."}</Badge>;
    }},
  ];

  async function handleAdd() {
    if (!orgId) return;
    const mins = entryHours ? Math.round(parseFloat(entryHours) * 60) : parseInt(entryMinutes);
    if (!mins || mins <= 0) { toast.error("Enter a valid duration"); return; }
    setSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/time-entries`, {
        method: "POST",
        body: {
          date: entryDate,
          description: entryDesc || null,
          minutes: mins,
          isBillable: entryBillable === "true",
          taskId: entryTaskId === "none" ? null : entryTaskId,
        },
      });
      toast.success("Time entry added");
      closeDrawer();
    } catch (err) { toast.error(errorText(err, "Failed to add time entry")); }
    finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!orgId || !editingEntry) return;
    const mins = entryHours ? Math.round(parseFloat(entryHours) * 60) : parseInt(entryMinutes);
    if (!mins || mins <= 0) { toast.error("Enter a valid duration"); return; }
    setSaving(true);
    try {
      // Invoiced time: send only what may still change.
      const body = editingEntry.invoiceId
        ? { description: entryDesc || null, taskId: entryTaskId === "none" ? null : entryTaskId }
        : {
            date: entryDate,
            description: entryDesc || null,
            minutes: mins,
            isBillable: entryBillable === "true",
            taskId: entryTaskId === "none" ? null : entryTaskId,
          };
      await projectFetch(orgId, `/api/v1/projects/${projectId}/time-entries/${editingEntry.id}`, {
        method: "PATCH",
        body,
      });
      toast.success("Time entry updated");
      closeDrawer();
    } catch (err) { toast.error(errorText(err, "Failed to update time entry")); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!orgId || !editingEntry) return;
    const ok = await confirm({
      title: "Delete this time entry?",
      description: `${formatHours(editingEntry.minutes)} on ${formatDateShort(editingEntry.date)} is removed for good.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/time-entries/${editingEntry.id}`, { method: "DELETE" });
      toast.success("Time entry deleted");
      closeDrawer();
    } catch (err) { toast.error(errorText(err, "Failed to delete time entry")); }
    finally { setDeleting(false); }
  }

  const timerTime = formatTimerDisplay(timerSeconds);
  const timerIsRunning = !!timerData;
  const timerIsPaused = !!timerData?.pausedAt;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Top: Timer + Weekly Chart side by side */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-[1fr_1.5fr]">
        {/* Timer Card */}
        <div className={cn(
          "rounded-xl border bg-card p-4 sm:p-5 flex flex-col",
          timerIsRunning && !timerIsPaused && "border-brand-300 bg-gradient-to-b from-brand-50/40 to-card dark:from-brand-950/20",
          timerIsPaused && "border-amber-300 bg-gradient-to-b from-amber-50/30 to-card dark:from-amber-950/20",
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={cn(
                "size-2 rounded-full",
                timerIsRunning && !timerIsPaused && "bg-brand-500 animate-pulse",
                timerIsPaused && "bg-amber-500",
                !timerIsRunning && "bg-muted-foreground/20",
              )} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {timerIsRunning ? (timerIsPaused ? "Paused" : "Recording") : "Timer"}
              </span>
            </div>
            {timerData && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Started {new Date(timerData.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Timer Display */}
          <div className="flex items-center justify-center py-3 sm:py-4">
            <div className="flex items-baseline gap-1 select-none">
              <span className={cn(
                "text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerIsRunning && !timerIsPaused && "text-brand-700 dark:text-brand-400",
                timerIsPaused && "text-amber-700 dark:text-amber-400",
                !timerIsRunning && "text-muted-foreground/30",
              )}>
                {timerTime.h}
              </span>
              <span className={cn(
                "text-xl sm:text-2xl font-light transition-colors",
                timerIsRunning && !timerIsPaused ? "text-brand-400 animate-pulse" : "text-muted-foreground/20",
              )}>:</span>
              <span className={cn(
                "text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerIsRunning && !timerIsPaused && "text-brand-700 dark:text-brand-400",
                timerIsPaused && "text-amber-700 dark:text-amber-400",
                !timerIsRunning && "text-muted-foreground/30",
              )}>
                {timerTime.m}
              </span>
              <span className={cn(
                "text-xl sm:text-2xl font-light transition-colors",
                timerIsRunning && !timerIsPaused ? "text-brand-400 animate-pulse" : "text-muted-foreground/20",
              )}>:</span>
              <span className={cn(
                "text-3xl sm:text-4xl font-bold font-mono tabular-nums tracking-tight transition-colors",
                timerIsRunning && !timerIsPaused && "text-brand-600 dark:text-brand-500",
                timerIsPaused && "text-amber-600 dark:text-amber-500",
                !timerIsRunning && "text-muted-foreground/20",
              )}>
                {timerTime.s}
              </span>
            </div>
          </div>

          {/* Timer Description + Task */}
          {timerIsRunning && (
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
                    ? "text-brand-700 bg-brand-50 hover:bg-brand-100 dark:text-brand-400 dark:bg-brand-950/40"
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
            {!timerIsRunning ? (
              <Button
                size="sm"
                className="flex-1 h-9 bg-brand-600 hover:bg-brand-700 gap-2 text-sm font-medium"
                onClick={startTimer}
                disabled={!canContribute}
                title={canContribute ? undefined : "You have view-only access to this project"}
              >
                <Play className="size-3.5 fill-current" />
                Start Timer
              </Button>
            ) : (
              <>
                {timerIsPaused ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-9 gap-2 text-sm border-brand-200 text-brand-700 hover:bg-brand-50"
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
                  className="flex-1 h-9 gap-2 text-sm bg-brand-600 hover:bg-brand-700"
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

        {/* Weekly Chart */}
        <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-1">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 text-muted-foreground/60" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This Week</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono tabular-nums">{formatHours(Math.round(weekTotalMinutes))} total</span>
          </div>

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
                <Bar dataKey="billable" fill="var(--brand-600)" radius={[4, 4, 0, 0]} name="billable" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
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

      {/* Action bar + Filters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            All Entries
            {hasActiveFilters && (
              <span className="ml-1.5 text-muted-foreground/60">
                ({filteredEntries.length} of {entries.length})
              </span>
            )}
          </p>
          {canContribute && (
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8" onClick={openAdd}>
              <Plus className="size-3.5" />Log Time
            </Button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="size-3.5 text-muted-foreground/50 shrink-0" />

          {uniqueMembers.length > 0 && (
            <Select value={filterMember} onValueChange={setFilterMember}>
              <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[120px]", filterMember !== "all" && "border-blue-300 bg-blue-50/50")}>
                <SelectValue placeholder="Member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All members</SelectItem>
                {uniqueMembers.map(name => (
                  <SelectItem key={name} value={name!}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={filterBillable} onValueChange={setFilterBillable}>
            <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[120px]", filterBillable !== "all" && "border-blue-300 bg-blue-50/50")}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="billable">Billable</SelectItem>
              <SelectItem value="non-billable">Non-billable</SelectItem>
              <SelectItem value="invoiced">Invoiced</SelectItem>
            </SelectContent>
          </Select>

          {uniqueTasks.length > 0 && (
            <Select value={filterTask} onValueChange={setFilterTask}>
              <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[120px]", filterTask !== "all" && "border-blue-300 bg-blue-50/50")}>
                <SelectValue placeholder="Task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tasks</SelectItem>
                <SelectItem value="none">No task</SelectItem>
                {uniqueTasks.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2" onClick={clearFilters}>
              <X className="size-3 mr-1" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Entry Drawer (Add / Edit) */}
      <Sheet open={drawerMode !== null} onOpenChange={open => { if (!open) closeDrawer(); }}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                drawerMode === "edit"
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  : "bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400",
              )}>
                {drawerMode === "edit" ? <Pencil className="size-5" /> : <Clock className="size-5" />}
              </div>
              <div>
                <SheetTitle className="text-lg">{readOnly ? "Time Entry" : drawerMode === "edit" ? "Edit Time Entry" : "Log Time Entry"}</SheetTitle>
                <SheetDescription>
                  {readOnly
                    ? "You can only change your own time entries."
                    : drawerMode === "edit" ? "Update this time entry." : "Record time spent on this project."}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            {editLocked && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[12px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                This time is on an invoice, so only the description and task can change. Void or delete the invoice to release it.
              </div>
            )}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">When</p>
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker value={entryDate} onChange={setEntryDate} placeholder="Select date" disabled={editLocked || readOnly} />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={entryDesc} onChange={e => setEntryDesc(e.target.value)} placeholder="What did you work on?" rows={3} disabled={readOnly} />
              </div>
              {tasks.length > 0 && (
                <div className="space-y-2">
                  <Label>Related Task</Label>
                  <Select value={entryTaskId} onValueChange={setEntryTaskId} disabled={readOnly}>
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
                  <Input type="number" step="0.25" min={0} value={entryHours} onChange={e => { setEntryHours(e.target.value); setEntryMinutes(""); }} placeholder="e.g. 1.5" disabled={editLocked || readOnly} />
                </div>
                <div className="space-y-2">
                  <Label>Or Minutes</Label>
                  <Input type="number" min={1} value={entryMinutes} onChange={e => { setEntryMinutes(e.target.value); setEntryHours(""); }} placeholder="e.g. 90" disabled={editLocked || readOnly} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Billable</Label>
                <Select value={entryBillable} onValueChange={setEntryBillable} disabled={editLocked || readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes - Billable</SelectItem>
                    <SelectItem value="false">No - Non-billable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            {drawerMode === "edit" && !editLocked && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 mr-auto h-9"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="size-3.5 mr-1.5" />
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Button type="button" variant="outline" onClick={closeDrawer}>{readOnly ? "Close" : "Cancel"}</Button>
              {!readOnly && (
                <Button
                  onClick={drawerMode === "edit" ? handleUpdate : handleAdd}
                  disabled={saving}
                  className={drawerMode === "edit" ? "bg-blue-600 hover:bg-blue-700" : "bg-brand-600 hover:bg-brand-700"}
                >
                  {saving ? "Saving..." : drawerMode === "edit" ? "Update Entry" : "Add Entry"}
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <DataTable
        columns={columns}
        data={filteredEntries}
        onRowClick={openEdit}
        emptyMessage={hasActiveFilters ? "No entries match your filters." : "No time entries yet. Start the timer or log time manually."}
      />
      {confirmDialog}
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
          accent === "emerald" && "text-brand-500/60",
          accent === "amber" && "text-amber-500/60",
          accent === "blue" && "text-blue-500/60",
        )}>
          {icon}
        </span>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={cn(
        "text-lg font-bold font-mono tabular-nums mt-0.5",
        accent === "emerald" && "text-brand-600",
        accent === "amber" && "text-amber-600",
        accent === "blue" && "text-blue-600",
      )}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function getWeekDays() {
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return localWeekDates().map((date, i) => ({ date, label: dayLabels[i] }));
}
