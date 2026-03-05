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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  useProject,
  statusConfig,
  priorityConfig,
  taskStatusConfig,
  formatHours,
  formatDate,
  formatDateShort,
  daysUntil,
  pct,
} from "./project-context";
import Link from "next/link";

export default function ProjectOverviewPage() {
  const { project: proj } = useProject();
  if (!proj) return null;

  const sc = statusConfig[proj.status] || statusConfig.active;
  const daysLeft = daysUntil(proj.endDate);

  const unbilledEntries = proj.timeEntries.filter(e => e.isBillable && !e.invoiceId);
  const unbilledAmount = unbilledEntries.reduce((sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0);

  const tasksByStatus = proj.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const totalTasks = proj.tasks.length;
  const doneTasks = tasksByStatus["done"] || 0;
  const progressPct = pct(doneTasks, totalTasks);
  const hoursProgressPct = proj.estimatedHours > 0 ? Math.min(100, pct(proj.totalHours, proj.estimatedHours)) : 0;
  const budgetPct = proj.budget > 0 ? Math.min(100, pct(proj.totalBilled, proj.budget)) : 0;

  const activeTasks = proj.tasks.filter(t => t.status !== "done" && t.status !== "cancelled").slice(0, 6);
  const upcomingMilestones = proj.milestones.filter(m => m.status !== "completed").slice(0, 4);
  const recentTime = proj.timeEntries.slice(0, 5);
  const pinnedNotes = proj.notes.filter(n => n.isPinned);
  const hasProgress = totalTasks > 0 || proj.estimatedHours > 0 || proj.budget > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      {/* ── Main Column ── */}
      <div className="space-y-5 min-w-0">
        {/* Top row: About + Calendar */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* About Card */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <SectionHeader icon={Briefcase} label="About" />
            {proj.description ? (
              <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-3">{proj.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No description</p>
            )}
            <div className="space-y-1.5 pt-1">
              <Row label="Status" value={<Badge variant="outline" className={cn("text-[10px] h-5", sc.color)}><span className={cn("size-1.5 rounded-full mr-1", sc.dot)} />{sc.label}</Badge>} />
              <Row label="Billing" value={<span className="text-[13px] capitalize">{proj.billingType.replace("_", " ")}</span>} />
              {proj.contact && <Row label="Client" value={<span className="text-[13px] font-medium">{proj.contact.name}</span>} />}
              {proj.category && <Row label="Category" value={<span className="text-[13px]">{proj.category}</span>} />}
              {proj.hourlyRate > 0 && <Row label="Rate" value={<span className="text-[13px] font-mono tabular-nums">{formatMoney(proj.hourlyRate)}/hr</span>} />}
              {proj.startDate && <Row label="Started" value={<span className="text-[13px]">{formatDate(proj.startDate)}</span>} />}
              {proj.endDate && (
                <Row label="Deadline" value={
                  <span className={cn("text-[13px]", daysLeft !== null && daysLeft < 0 ? "text-red-600 font-medium" : "")}>
                    {formatDate(proj.endDate)}
                    {daysLeft !== null && <span className="text-[10px] ml-1.5">({daysLeft > 0 ? `${daysLeft}d` : daysLeft === 0 ? "today" : `${Math.abs(daysLeft)}d late`})</span>}
                  </span>
                } />
              )}
            </div>
          </div>

          {/* Mini Calendar */}
          <MiniCalendar proj={proj} />
        </div>

        {/* Progress Section */}
        {hasProgress && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <SectionHeader icon={TrendingUp} label="Progress" />
            <div className="grid gap-4 sm:grid-cols-3">
              {proj.enableTasks && totalTasks > 0 && (
                <ProgressBar label="Tasks" value={progressPct} color="#10b981" sub={`${doneTasks} of ${totalTasks} done`} />
              )}
              {proj.enableTimeTracking && proj.estimatedHours > 0 && (
                <ProgressBar label="Time" value={hoursProgressPct} color="#3b82f6" sub={`${formatHours(proj.totalHours)} of ${formatHours(proj.estimatedHours)}`} />
              )}
              {proj.enableBilling && proj.budget > 0 && (
                <ProgressBar label="Budget" value={budgetPct} color={budgetPct > 90 ? "#ef4444" : "#f59e0b"} sub={`${formatMoney(proj.totalBilled)} of ${formatMoney(proj.budget)}`} />
              )}
            </div>

            {/* Task breakdown bar */}
            {proj.enableTasks && totalTasks > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                  {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                    const count = tasksByStatus[s] || 0;
                    if (count === 0) return null;
                    return <div key={s} className={cn("h-full", taskStatusConfig[s]?.bar)} style={{ width: `${pct(count, totalTasks)}%` }} title={`${taskStatusConfig[s]?.label}: ${count}`} />;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                    const count = tasksByStatus[s] || 0;
                    if (count === 0) return null;
                    return (
                      <div key={s} className="flex items-center gap-1">
                        <span className={cn("size-1.5 rounded-full", taskStatusConfig[s]?.bar)} />
                        <span className="text-[10px] text-muted-foreground">{taskStatusConfig[s]?.label} ({count})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Tasks */}
        {proj.enableTasks && activeTasks.length > 0 && (
          <ListCard icon={Zap} label="Active Tasks" href={`/projects/${proj.id}/tasks`}>
            {activeTasks.map((task) => {
              const overdue = task.dueDate && new Date(task.dueDate) < new Date();
              const tsc = taskStatusConfig[task.status];
              return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
                  <span className={cn("size-1.5 rounded-full shrink-0", tsc?.bar)} />
                  <span className="text-[13px] truncate flex-1">{task.title}</span>
                  <Badge variant="outline" className={cn("text-[9px] h-4 shrink-0", priorityConfig[task.priority]?.color)}>
                    {task.priority}
                  </Badge>
                  <Badge variant="outline" className={cn("text-[9px] h-4 shrink-0", tsc?.bg, tsc?.text)}>
                    {tsc?.label}
                  </Badge>
                  {task.dueDate && (
                    <span className={cn("text-[10px] shrink-0 tabular-nums", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                      {formatDateShort(task.dueDate)}
                    </span>
                  )}
                </div>
              );
            })}
          </ListCard>
        )}

        {/* Recent Time Entries */}
        {proj.enableTimeTracking && recentTime.length > 0 && (
          <ListCard icon={Clock} label="Recent Time" href={`/projects/${proj.id}/time`}>
            {recentTime.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-16">{formatDateShort(e.date)}</span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 w-16 truncate">{e.user?.name?.split(" ")[0] || "-"}</span>
                <span className="truncate flex-1 text-muted-foreground">{e.description || "No description"}</span>
                <span className="font-mono text-xs tabular-nums shrink-0 font-medium">{formatHours(e.minutes)}</span>
                <span className="font-mono text-[11px] tabular-nums shrink-0 text-muted-foreground">{formatMoney(Math.round((e.minutes / 60) * e.hourlyRate))}</span>
              </div>
            ))}
          </ListCard>
        )}

        {/* Upcoming Milestones */}
        {proj.enableMilestones && upcomingMilestones.length > 0 && (
          <ListCard icon={Flag} label="Upcoming Milestones" href={`/projects/${proj.id}/milestones`}>
            {upcomingMilestones.map((ms) => {
              const overdue = ms.dueDate && new Date(ms.dueDate) < new Date();
              return (
                <div key={ms.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Target className="size-4 text-muted-foreground/40 shrink-0" />
                  <span className="text-[13px] font-medium flex-1 min-w-0 truncate">{ms.title}</span>
                  {ms.dueDate && (
                    <span className={cn("text-[10px] shrink-0", overdue ? "text-red-600" : "text-muted-foreground")}>{formatDateShort(ms.dueDate)}</span>
                  )}
                  {ms.amount > 0 && <span className="font-mono text-xs text-muted-foreground">{formatMoney(ms.amount)}</span>}
                </div>
              );
            })}
          </ListCard>
        )}
      </div>

      {/* ── Right Sidebar ── */}
      <div className="space-y-4">
        {/* Financials */}
        {proj.enableBilling && (proj.totalBilled > 0 || unbilledAmount > 0 || proj.budget > 0) && (
          <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
            <SectionHeader icon={DollarSign} label="Financials" small />
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billed</span>
                <span className="font-mono tabular-nums font-medium">{formatMoney(proj.totalBilled)}</span>
              </div>
              {unbilledAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unbilled</span>
                  <span className="font-mono tabular-nums text-amber-600">{formatMoney(unbilledAmount)}</span>
                </div>
              )}
              {proj.budget > 0 && (
                <>
                  <div className="h-px bg-border my-1" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Remaining</span>
                    <span className={cn("font-mono tabular-nums font-semibold", proj.budget - proj.totalBilled < 0 ? "text-red-600" : "text-emerald-600")}>
                      {formatMoney(proj.budget - proj.totalBilled)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Team */}
        {proj.members.length > 0 && (
          <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <SectionHeader icon={null} label="Team" small />
              <Link href={`/projects/${proj.id}/members`} className="text-[10px] text-emerald-600 hover:underline">Manage</Link>
            </div>
            <div className="space-y-1.5">
              {proj.members.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="size-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0" style={{ backgroundColor: proj.color }}>
                    {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] truncate flex-1">{m.member.user.name || m.member.user.email}</span>
                  <span className="text-[9px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{m.role}</span>
                </div>
              ))}
              {proj.members.length > 6 && (
                <Link href={`/projects/${proj.id}/members`} className="text-[11px] text-muted-foreground hover:text-foreground block">
                  +{proj.members.length - 6} more
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        {proj.tags.length > 0 && (
          <div className="rounded-lg border bg-card p-3.5">
            <SectionHeader icon={null} label="Tags" small />
            <div className="flex flex-wrap gap-1 mt-2">
              {proj.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Pinned Notes */}
        {proj.enableNotes && pinnedNotes.length > 0 && (
          <div className="rounded-lg border bg-card p-3.5">
            <div className="flex items-center gap-1 mb-2">
              <Pin className="size-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pinned</span>
            </div>
            <div className="space-y-2">
              {pinnedNotes.slice(0, 2).map((n) => (
                <p key={n.id} className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{n.content}</p>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        {proj.startDate && proj.endDate && (
          <div className="rounded-lg border bg-card p-3.5 space-y-2">
            <SectionHeader icon={Calendar} label="Timeline" small />
            <TimelineBar startDate={proj.startDate} endDate={proj.endDate} color={proj.color} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────

function SectionHeader({ icon: Icon, label, small }: { icon: typeof Briefcase | null; label: string; small?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className={cn("text-muted-foreground/60", small ? "size-3" : "size-3.5")} />}
      <span className={cn("font-semibold uppercase tracking-wider text-muted-foreground", small ? "text-[9px]" : "text-[10px]")}>{label}</span>
    </div>
  );
}

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
        <span className="text-[13px] font-bold font-mono tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
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
    <div className="space-y-1">
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

function ListCard({ icon: Icon, label, href, children }: { icon: typeof Zap; label: string; href: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground/60" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <Link href={href} className="text-[11px] text-emerald-600 hover:underline font-medium">View all</Link>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

// ── Mini Calendar ──────────────────────────────────────────
function MiniCalendar({ proj }: { proj: { tasks: { dueDate: string | null; status: string }[]; milestones: { dueDate: string | null; status: string }[]; startDate: string | null; endDate: string | null; color: string } }) {
  const [viewDate, setViewDate] = useState(() => new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Events map: date -> { tasks, milestones, isStart, isEnd }
  const events = useMemo(() => {
    const map: Record<string, { tasks: number; milestones: number; overdue: boolean }> = {};
    proj.tasks.forEach(t => {
      if (!t.dueDate) return;
      if (!map[t.dueDate]) map[t.dueDate] = { tasks: 0, milestones: 0, overdue: false };
      map[t.dueDate].tasks++;
      if (t.status !== "done" && t.status !== "cancelled" && new Date(t.dueDate) < today) map[t.dueDate].overdue = true;
    });
    proj.milestones.forEach(m => {
      if (!m.dueDate) return;
      if (!map[m.dueDate]) map[m.dueDate] = { tasks: 0, milestones: 0, overdue: false };
      map[m.dueDate].milestones++;
    });
    return map;
  }, [proj.tasks, proj.milestones]);

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  function prevMonth() { setViewDate(new Date(year, month - 1, 1)); }
  function nextMonth() { setViewDate(new Date(year, month + 1, 1)); }

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <SectionHeader icon={Calendar} label={`${monthNames[month]} ${year}`} />
        <div className="flex items-center gap-1">
          <button onClick={prevMonth} className="size-6 rounded hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronLeft className="size-3" />
          </button>
          <button onClick={nextMonth} className="size-6 rounded hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-muted-foreground/60 pb-1.5">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === todayStr;
          const ev = events[dateStr];
          const isStart = proj.startDate === dateStr;
          const isEnd = proj.endDate === dateStr;

          return (
            <div key={day} className="relative flex flex-col items-center py-0.5">
              <span className={cn(
                "size-6 flex items-center justify-center rounded-full text-[11px] tabular-nums transition-colors",
                isToday && "bg-foreground text-background font-bold",
                isStart && !isToday && "ring-2 ring-emerald-400",
                isEnd && !isToday && "ring-2 ring-red-400",
              )}>
                {day}
              </span>
              {ev && (
                <div className="flex items-center gap-px mt-0.5">
                  {ev.tasks > 0 && <span className={cn("size-1 rounded-full", ev.overdue ? "bg-red-500" : "bg-blue-400")} />}
                  {ev.milestones > 0 && <span className="size-1 rounded-full bg-amber-400" />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t">
        <div className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-blue-400" /><span className="text-[9px] text-muted-foreground">Tasks</span></div>
        <div className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-400" /><span className="text-[9px] text-muted-foreground">Milestones</span></div>
        <div className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-500" /><span className="text-[9px] text-muted-foreground">Overdue</span></div>
      </div>
    </div>
  );
}
