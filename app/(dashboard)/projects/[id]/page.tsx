"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  Briefcase,
  TrendingUp,
  Clock,
  Flag,
  Zap,
  Pin,
  Target,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Users,
  Timer,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  useProject,
  priorityConfig,
  taskStatusConfig,
  formatHours,
  formatDate,
  formatDateShort,
  daysUntil,
  pct,
  type ProjectDetail,
} from "./project-context";
import Link from "next/link";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

export default function ProjectOverviewPage() {
  const { project: proj } = useProject();
  useDocumentTitle("Projects · Overview");
  if (!proj) return null;

  const daysLeft = daysUntil(proj.endDate);
  const unbilledEntries = proj.timeEntries.filter(e => e.isBillable && !e.invoiceId);
  const unbilledAmount = unbilledEntries.reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);
  const totalAmount = proj.timeEntries.reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);

  const tasksByStatus = proj.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalTasks = proj.tasks.length;
  const doneTasks = tasksByStatus["done"] || 0;
  const progressPct = pct(doneTasks, totalTasks);
  const hoursProgressPct = proj.estimatedHours > 0 ? Math.min(100, pct(proj.totalHours, proj.estimatedHours)) : 0;
  const budgetPct = proj.budget > 0 ? Math.min(100, pct(proj.totalBilled, proj.budget)) : 0;

  const activeTasks = proj.tasks.filter(t => t.status !== "done" && t.status !== "cancelled").slice(0, 8);
  const upcomingMilestones = proj.milestones.filter(m => m.status !== "completed").slice(0, 5);
  const recentTime = proj.timeEntries.slice(0, 6);
  const pinnedNotes = proj.notes.filter(n => n.isPinned);
  const billableMinutes = proj.timeEntries.filter(e => e.isBillable).reduce((s, e) => s + e.minutes, 0);

  // Build stat cards - always show at least 4
  const stats: StatCardProps[] = [];
  if (proj.enableTimeTracking) {
    stats.push({ icon: Timer, label: "Logged", value: formatHours(proj.totalHours), sub: proj.estimatedHours > 0 ? `${hoursProgressPct}% of estimate` : `${proj.timeEntries.length} entries`, progress: proj.estimatedHours > 0 ? hoursProgressPct : undefined, color: "#3b82f6" });
  }
  if (proj.enableTasks) {
    stats.push({ icon: Zap, label: "Tasks", value: totalTasks > 0 ? `${doneTasks}/${totalTasks}` : "0", sub: totalTasks > 0 ? `${progressPct}% complete` : "No tasks yet", progress: totalTasks > 0 ? progressPct : 0, color: "#10b981" });
  }
  if (proj.enableBilling) {
    stats.push({ icon: DollarSign, label: "Revenue", value: formatMoney(totalAmount), sub: unbilledAmount > 0 ? `${formatMoney(unbilledAmount)} unbilled` : "all invoiced" });
    if (proj.budget > 0) {
      stats.push({ icon: DollarSign, label: "Budget", value: formatMoney(proj.totalBilled), sub: `of ${formatMoney(proj.budget)}`, progress: budgetPct, color: budgetPct > 90 ? "#ef4444" : "#f59e0b" });
    }
  }
  stats.push({ icon: Users, label: "Team", value: String(proj.members.length), sub: `${proj.members.filter(m => m.role === "manager").length} managers` });
  if (proj.endDate) {
    stats.push({
      icon: Calendar, label: "Deadline",
      value: daysLeft !== null ? (daysLeft > 0 ? `${daysLeft}d` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d`) : formatDateShort(proj.endDate),
      sub: daysLeft !== null ? (daysLeft > 0 ? "remaining" : "overdue") : undefined,
      alert: daysLeft !== null && daysLeft < 0,
    });
  }
  // Pad to at least 4
  while (stats.length < 4) {
    stats.push({ icon: Activity, label: "Activity", value: String(proj.notes.length + proj.timeEntries.length), sub: "total actions" });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Row 1: Stat Cards - always full width */}
      <div className={cn("grid gap-2", {
        "grid-cols-2 sm:grid-cols-4": stats.length <= 4,
        "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5": stats.length === 5,
        "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6": stats.length >= 6,
      })}>
        {stats.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* Row 2: Charts - ALWAYS 2 columns, fill full width */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
        <TimeAreaChart entries={proj.timeEntries} color={proj.color} />
        <TaskPieChart tasksByStatus={tasksByStatus} totalTasks={totalTasks} doneTasks={doneTasks} />
      </div>

      {/* Row 3: Calendar + Progress + Details - 3 columns full width */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MiniCalendar proj={proj} />
        </div>
        <div className="space-y-4">
          {/* Project Info Card */}
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Briefcase className="size-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</span>
            </div>
            {proj.description && (
              <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3 mb-2">{proj.description}</p>
            )}
            <div className="space-y-1.5">
              <Row label="Billing" value={<span className="text-[13px] capitalize">{proj.billingType.replace("_", " ")}</span>} />
              {proj.contact && <Row label="Client" value={<span className="text-[13px] font-medium">{proj.contact.name}</span>} />}
              {proj.category && <Row label="Category" value={<span className="text-[13px]">{proj.category}</span>} />}
              {proj.hourlyRate > 0 && <Row label="Rate" value={<span className="text-[13px] font-mono tabular-nums">{formatMoney(proj.hourlyRate)}/hr</span>} />}
              {proj.fixedPrice > 0 && <Row label="Fixed" value={<span className="text-[13px] font-mono tabular-nums">{formatMoney(proj.fixedPrice)}</span>} />}
              {proj.startDate && <Row label="Start" value={<span className="text-[13px]">{formatDate(proj.startDate)}</span>} />}
              {proj.endDate && <Row label="End" value={<span className={cn("text-[13px]", daysLeft !== null && daysLeft < 0 ? "text-red-600 font-medium" : "")}>{formatDate(proj.endDate)}</span>} />}
            </div>
            {proj.startDate && proj.endDate && <TimelineBar startDate={proj.startDate} endDate={proj.endDate} color={proj.color} />}
            {proj.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {proj.tags.map(t => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>)}
              </div>
            )}
          </div>

          {/* Financials / Summary */}
          {proj.enableBilling ? (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financials</span>
              </div>
              <div className="space-y-1.5 text-[13px]">
                <Row label="Total billed" value={<span className="font-mono tabular-nums font-medium">{formatMoney(proj.totalBilled)}</span>} />
                <Row label="Revenue" value={<span className="font-mono tabular-nums">{formatMoney(totalAmount)}</span>} />
                {unbilledAmount > 0 && <Row label="Unbilled" value={<span className="font-mono tabular-nums text-amber-600">{formatMoney(unbilledAmount)}</span>} />}
                {proj.budget > 0 && (
                  <>
                    <div className="h-px bg-border my-1" />
                    <Row label="Budget" value={<span className="font-mono tabular-nums">{formatMoney(proj.budget)}</span>} />
                    <Row label="Remaining" value={<span className={cn("font-mono tabular-nums font-semibold", proj.budget - proj.totalBilled < 0 ? "text-red-600" : "text-emerald-600")}>{formatMoney(proj.budget - proj.totalBilled)}</span>} />
                  </>
                )}
                {proj.enableTimeTracking && (
                  <>
                    <div className="h-px bg-border my-1" />
                    <Row label="Billable time" value={<span className="font-mono tabular-nums">{formatHours(billableMinutes)}</span>} />
                    <Row label="Avg rate" value={<span className="font-mono tabular-nums">{billableMinutes > 0 ? formatMoney(Math.round(totalAmount / (billableMinutes / 60))) : "-"}/hr</span>} />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Activity className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Summary</span>
              </div>
              <div className="space-y-1.5 text-[13px]">
                {proj.enableTimeTracking && <Row label="Total time" value={<span className="font-mono tabular-nums font-medium">{formatHours(proj.totalHours)}</span>} />}
                {proj.enableTasks && <Row label="Open tasks" value={<span className="font-mono tabular-nums">{totalTasks - doneTasks}</span>} />}
                {proj.enableMilestones && <Row label="Milestones" value={<span className="font-mono tabular-nums">{proj.milestones.filter(m => m.status === "completed").length}/{proj.milestones.length}</span>} />}
                <Row label="Notes" value={<span className="font-mono tabular-nums">{proj.notes.length}</span>} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Progress Section - full width */}
      {(totalTasks > 0 || (proj.estimatedHours > 0 && proj.enableTimeTracking) || (proj.budget > 0 && proj.enableBilling)) && (
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="size-3.5 text-muted-foreground/60" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</span>
          </div>
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-3">
            {proj.enableTasks && totalTasks > 0 ? (
              <ProgressBar label="Tasks" value={progressPct} color="#10b981" sub={`${doneTasks} of ${totalTasks} done`} />
            ) : (
              <ProgressBar label="Tasks" value={0} color="#10b981" sub="No tasks" />
            )}
            {proj.enableTimeTracking && proj.estimatedHours > 0 ? (
              <ProgressBar label="Time" value={hoursProgressPct} color="#3b82f6" sub={`${formatHours(proj.totalHours)} of ${formatHours(proj.estimatedHours)}`} />
            ) : (
              <ProgressBar label="Time" value={0} color="#3b82f6" sub={proj.enableTimeTracking ? formatHours(proj.totalHours) + " logged" : "Not tracked"} />
            )}
            {proj.enableBilling && proj.budget > 0 ? (
              <ProgressBar label="Budget" value={budgetPct} color={budgetPct > 90 ? "#ef4444" : "#f59e0b"} sub={`${formatMoney(proj.totalBilled)} of ${formatMoney(proj.budget)}`} />
            ) : (
              <ProgressBar label="Budget" value={0} color="#f59e0b" sub={proj.enableBilling ? formatMoney(proj.totalBilled) + " billed" : "Not tracked"} />
            )}
          </div>

          {proj.enableTasks && totalTasks > 0 && (
            <div className="space-y-1.5 mt-4 pt-3 border-t">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
                {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                  const count = tasksByStatus[s] || 0;
                  if (count === 0) return null;
                  return <div key={s} className={cn("h-full", taskStatusConfig[s]?.bar)} style={{ width: `${pct(count, totalTasks)}%` }} />;
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                  const count = tasksByStatus[s] || 0;
                  if (count === 0) return null;
                  return (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", taskStatusConfig[s]?.bar)} />
                      <span className="text-[11px] text-muted-foreground">{taskStatusConfig[s]?.label}</span>
                      <span className="text-[11px] font-mono tabular-nums font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 5: Activity Lists - ALWAYS 2 columns */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Left column: Tasks + Milestones */}
        <div className="space-y-4">
          <ListCard icon={Zap} label="Active Tasks" href={`/projects/${proj.id}/tasks`} count={activeTasks.length}>
            {activeTasks.length > 0 ? activeTasks.map((task) => {
              const overdue = task.dueDate && new Date(task.dueDate) < new Date();
              const tsc = taskStatusConfig[task.status];
              return (
                <div key={task.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-muted/20 transition-colors">
                  <span className={cn("size-1.5 rounded-full shrink-0", tsc?.bar)} />
                  <span className="text-[13px] truncate flex-1">{task.title}</span>
                  <Badge variant="outline" className={cn("text-[9px] h-4 shrink-0", priorityConfig[task.priority]?.color)}>{task.priority}</Badge>
                  {task.dueDate && (
                    <span className={cn("text-[10px] shrink-0 tabular-nums", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>{formatDateShort(task.dueDate)}</span>
                  )}
                </div>
              );
            }) : (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No active tasks</div>
            )}
          </ListCard>

          {proj.enableMilestones && (
            <ListCard icon={Flag} label="Milestones" href={`/projects/${proj.id}/milestones`} count={proj.milestones.length}>
              {upcomingMilestones.length > 0 ? upcomingMilestones.map((ms) => {
                const overdue = ms.dueDate && new Date(ms.dueDate) < new Date();
                return (
                  <div key={ms.id} className="flex items-center gap-2.5 px-4 py-2.5">
                    <Target className="size-3.5 text-muted-foreground/40 shrink-0" />
                    <span className="text-[13px] font-medium flex-1 min-w-0 truncate">{ms.title}</span>
                    {ms.dueDate && <span className={cn("text-[10px] shrink-0 tabular-nums", overdue ? "text-red-600" : "text-muted-foreground")}>{formatDateShort(ms.dueDate)}</span>}
                    {ms.amount > 0 && <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatMoney(ms.amount)}</span>}
                  </div>
                );
              }) : (
                <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No upcoming milestones</div>
              )}
            </ListCard>
          )}
        </div>

        {/* Right column: Time + Team + Notes */}
        <div className="space-y-4">
          <ListCard icon={Clock} label="Recent Time" href={`/projects/${proj.id}/time`} count={proj.timeEntries.length}>
            {recentTime.length > 0 ? recentTime.map((e) => (
              <div key={e.id} className="flex items-center gap-2.5 px-4 py-2 text-[13px]">
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-14">{formatDateShort(e.date)}</span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 w-14 truncate">{e.user?.name?.split(" ")[0] || "-"}</span>
                <span className="truncate flex-1 text-muted-foreground">{e.description || "-"}</span>
                <span className="font-mono text-xs tabular-nums shrink-0 font-medium">{formatHours(e.minutes)}</span>
                <span className="font-mono text-[11px] tabular-nums shrink-0 text-muted-foreground">{formatMoney(Math.round((e.minutes / 60) * e.hourlyRate))}</span>
              </div>
            )) : (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No time entries yet</div>
            )}
          </ListCard>

          {/* Team */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Users className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</span>
                <span className="text-[9px] font-mono tabular-nums text-muted-foreground/60">{proj.members.length}</span>
              </div>
              <Link href={`/projects/${proj.id}/members`} className="text-[11px] text-emerald-600 hover:underline font-medium">Manage</Link>
            </div>
            <div className="divide-y">
              {proj.members.length > 0 ? proj.members.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 px-4 py-2">
                  <div className="size-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ backgroundColor: proj.color }}>
                    {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] truncate flex-1">{m.member.user.name || m.member.user.email}</span>
                  <span className="text-[9px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{m.role}</span>
                </div>
              )) : (
                <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">No team members</div>
              )}
            </div>
          </div>

          {/* Pinned Notes */}
          {proj.enableNotes && pinnedNotes.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-1 mb-2">
                <Pin className="size-3 text-amber-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pinned Notes</span>
              </div>
              <div className="space-y-2">
                {pinnedNotes.slice(0, 3).map((n) => (
                  <p key={n.id} className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{n.content}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stat Card ──────────────────────────────────────────────
interface StatCardProps {
  icon: typeof Timer;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  color?: string;
  alert?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, progress, color, alert }: StatCardProps) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="size-3 text-muted-foreground/50" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <p className={cn("text-base font-bold font-mono tabular-nums tracking-tight", alert && "text-red-600")}>{value}</p>
      {sub && <p className={cn("text-[10px] mt-0.5", alert ? "text-red-500" : "text-muted-foreground")}>{sub}</p>}
      {progress !== undefined && (
        <div className="h-1 rounded-full bg-muted overflow-hidden mt-1.5">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: color || "#10b981" }} />
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

function ProgressBar({ label, value, color, sub }: { label: string; value: number; color: string; sub: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="text-sm font-bold font-mono tabular-nums">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function TimelineBar({ startDate, endDate, color }: { startDate: string; endDate: string; color: string }) {
  const [now] = useState(() => Date.now());
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  const total = end - start;
  if (total <= 0) return null;
  const elapsed = Math.max(0, Math.min(now - start, total));
  const progressPct = Math.round((elapsed / total) * 100);
  return (
    <div className="space-y-1 pt-1">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{formatDateShort(startDate)}</span>
        <span>{progressPct}%</span>
        <span>{formatDateShort(endDate)}</span>
      </div>
    </div>
  );
}

function ListCard({ icon: Icon, label, href, count, children }: { icon: typeof Zap; label: string; href: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          {count !== undefined && <span className="text-[9px] font-mono tabular-nums text-muted-foreground/60">{count}</span>}
        </div>
        <Link href={href} className="text-[11px] text-emerald-600 hover:underline font-medium flex items-center gap-0.5">
          View all <ArrowUpRight className="size-3" />
        </Link>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

// ── Time Area Chart (recharts, last 14 days) ────────────────
function TimeAreaChart({ entries, color }: { entries: ProjectDetail["timeEntries"]; color: string }) {
  const data = useMemo(() => {
    const days: { name: string; date: string; hours: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        name: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        date: dateStr,
        hours: 0,
      });
    }
    entries.forEach(e => {
      const day = days.find(d => d.date === e.date);
      if (day) day.hours += Math.round((e.minutes / 60) * 10) / 10;
    });
    return days;
  }, [entries]);

  const totalHrs = data.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time (14 days)</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Total: <span className="font-mono tabular-nums font-medium text-foreground">{totalHrs.toFixed(1)}h</span></span>
          <span>Avg: <span className="font-mono tabular-nums font-medium text-foreground">{(totalHrs / 14).toFixed(1)}h</span>/day</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="timeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="h" />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
            labelStyle={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}
          />
          <Area type="monotone" dataKey="hours" stroke={color} strokeWidth={2} fill="url(#timeGrad)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Task Pie Chart (recharts) ────────────────────────────────
function TaskPieChart({ tasksByStatus, totalTasks, doneTasks }: { tasksByStatus: Record<string, number>; totalTasks: number; doneTasks: number }) {
  const data = useMemo(() => {
    const statusOrder = ["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const;
    const colors: Record<string, string> = {
      done: "#10b981", in_progress: "#f59e0b", in_review: "#8b5cf6",
      todo: "#64748b", backlog: "#d1d5db", cancelled: "#ef4444",
    };
    return statusOrder
      .filter(s => (tasksByStatus[s] || 0) > 0)
      .map(s => ({
        name: taskStatusConfig[s]?.label || s,
        value: tasksByStatus[s] || 0,
        color: colors[s],
      }));
  }, [tasksByStatus]);

  // If no tasks, show placeholder
  const showData = data.length > 0 ? data : [{ name: "No tasks", value: 1, color: "#e5e7eb" }];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Zap className="size-3.5 text-muted-foreground/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Task Distribution</span>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={showData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {showData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center -mt-2">
            <span className="text-lg font-bold font-mono tabular-nums">{totalTasks > 0 ? pct(doneTasks, totalTasks) : 0}%</span>
            <span className="text-[9px] text-muted-foreground ml-1">done</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.length > 0 ? data.map(seg => (
            <div key={seg.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[11px] text-muted-foreground flex-1">{seg.name}</span>
              <span className="text-[11px] font-mono tabular-nums font-medium">{seg.value}</span>
            </div>
          )) : (
            <p className="text-[11px] text-muted-foreground">No tasks to display</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────
function MiniCalendar({ proj }: { proj: ProjectDetail }) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const events = useMemo(() => {
    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);
    const map: Record<string, { tasks: number; milestones: number; time: number; overdue: boolean }> = {};
    proj.tasks.forEach(t => {
      if (!t.dueDate) return;
      if (!map[t.dueDate]) map[t.dueDate] = { tasks: 0, milestones: 0, time: 0, overdue: false };
      map[t.dueDate].tasks++;
      if (t.status !== "done" && t.status !== "cancelled" && new Date(t.dueDate) < nowDate) map[t.dueDate].overdue = true;
    });
    proj.milestones.forEach(m => {
      if (!m.dueDate) return;
      if (!map[m.dueDate]) map[m.dueDate] = { tasks: 0, milestones: 0, time: 0, overdue: false };
      map[m.dueDate].milestones++;
    });
    proj.timeEntries.forEach(e => {
      if (!map[e.date]) map[e.date] = { tasks: 0, milestones: 0, time: 0, overdue: false };
      map[e.date].time++;
    });
    return map;
  }, [proj.tasks, proj.milestones, proj.timeEntries]);

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-muted-foreground/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{monthNames[month]} {year}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="size-6 rounded hover:bg-muted flex items-center justify-center transition-colors"><ChevronLeft className="size-3" /></button>
          <button onClick={() => setViewDate(new Date())} className="text-[10px] text-muted-foreground hover:text-foreground px-1.5">Today</button>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="size-6 rounded hover:bg-muted flex items-center justify-center transition-colors"><ChevronRight className="size-3" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-muted-foreground/60 pb-2">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const ev = events[dateStr];
          const isStart = proj.startDate === dateStr;
          const isEnd = proj.endDate === dateStr;
          return (
            <div key={day} className={cn(
              "relative flex flex-col items-center py-1 rounded-md transition-colors",
              ev && !isToday && "bg-muted/30",
            )}>
              <span className={cn(
                "size-8 flex items-center justify-center rounded-full text-[12px] tabular-nums transition-colors",
                isToday && "bg-foreground text-background font-bold",
                isStart && !isToday && "ring-2 ring-emerald-400 ring-offset-1",
                isEnd && !isToday && "ring-2 ring-red-400 ring-offset-1",
              )}>{day}</span>
              {ev ? (
                <div className="flex items-center gap-0.5 mt-0.5 h-2">
                  {ev.tasks > 0 && <span className={cn("size-1.5 rounded-full", ev.overdue ? "bg-red-500" : "bg-blue-400")} />}
                  {ev.milestones > 0 && <span className="size-1.5 rounded-full bg-amber-400" />}
                  {ev.time > 0 && <span className="size-1.5 rounded-full bg-emerald-400" />}
                </div>
              ) : <div className="h-2 mt-0.5" />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t flex-wrap">
        <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-400" /><span className="text-[10px] text-muted-foreground">Tasks</span></div>
        <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" /><span className="text-[10px] text-muted-foreground">Milestones</span></div>
        <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /><span className="text-[10px] text-muted-foreground">Time</span></div>
        <div className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" /><span className="text-[10px] text-muted-foreground">Overdue</span></div>
      </div>
    </div>
  );
}
