"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  Clock,
  Plus,
  Users,
  CheckCircle2,
  Flag,
  StickyNote,
  Settings2,
  Calendar,
  DollarSign,
  Target,
  CircleDot,
  Pin,
  AlertCircle,
  ArrowUpRight,
  Zap,
  TrendingUp,
  CircleDashed,
  Timer,
  Receipt,
  Briefcase,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ContactPicker } from "@/components/dashboard/contact-picker";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────
interface ProjectMemberData {
  id: string;
  role: string;
  member: {
    id: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  };
}

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  estimatedMinutes: number | null;
  assigneeId: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface MilestoneData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  amount: number;
  completedAt: string | null;
}

interface NoteData {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: { name: string | null; email: string };
}

interface TimeEntryData {
  id: string;
  date: string;
  description: string | null;
  minutes: number;
  isBillable: boolean;
  hourlyRate: number;
  invoiceId: string | null;
  user: { name: string | null } | null;
  task: { title: string } | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  billingType: string;
  color: string;
  budget: number;
  hourlyRate: number;
  fixedPrice: number;
  totalHours: number;
  totalBilled: number;
  estimatedHours: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  tags: string[];
  contactId: string | null;
  contact: { name: string } | null;
  enableTimeline: boolean;
  enableTasks: boolean;
  enableTimeTracking: boolean;
  enableMilestones: boolean;
  enableNotes: boolean;
  enableBilling: boolean;
  members: ProjectMemberData[];
  tasks: TaskData[];
  milestones: MilestoneData[];
  notes: NoteData[];
  timeEntries: TimeEntryData[];
}

// ── Constants ──────────────────────────────────────────────
const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: "Active", color: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  completed: { label: "Completed", color: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  on_hold: { label: "On Hold", color: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  cancelled: { label: "Cancelled", color: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
  archived: { label: "Archived", color: "border-gray-200 bg-gray-50 text-gray-700", dot: "bg-gray-400" },
};

const priorityConfig: Record<string, { label: string; color: string; icon: string }> = {
  low: { label: "Low", color: "border-gray-200 bg-gray-50 text-gray-600", icon: "text-gray-400" },
  medium: { label: "Medium", color: "border-blue-200 bg-blue-50 text-blue-700", icon: "text-blue-500" },
  high: { label: "High", color: "border-orange-200 bg-orange-50 text-orange-700", icon: "text-orange-500" },
  urgent: { label: "Urgent", color: "border-red-200 bg-red-50 text-red-700", icon: "text-red-500" },
};

const taskStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  backlog: { label: "Backlog", bg: "bg-gray-100", text: "text-gray-600" },
  todo: { label: "To Do", bg: "bg-slate-100", text: "text-slate-700" },
  in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700" },
  in_review: { label: "In Review", bg: "bg-purple-50", text: "text-purple-700" },
  done: { label: "Done", bg: "bg-emerald-50", text: "text-emerald-700" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-600" },
};

const taskBarColors: Record<string, string> = {
  backlog: "bg-gray-300",
  todo: "bg-slate-400",
  in_progress: "bg-amber-400",
  in_review: "bg-purple-400",
  done: "bg-emerald-500",
  cancelled: "bg-red-400",
};

const PROJECT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function formatHours(minutes: number): string {
  if (minutes === 0) return "0h";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

// ── Main Component ─────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [proj, setProj] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchProject = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/projects/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProj(data.project);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  if (loading) return <BrandLoader />;
  if (!proj) return <div className="space-y-6"><PageHeader title="Project not found" /></div>;

  const tabs = [
    { id: "overview", label: "Overview", icon: CircleDot },
    ...(proj.enableTasks ? [{ id: "tasks", label: "Tasks", icon: CheckCircle2, count: proj.tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length }] : []),
    ...(proj.enableTimeTracking ? [{ id: "time", label: "Time", icon: Clock }] : []),
    ...(proj.enableMilestones ? [{ id: "milestones", label: "Milestones", icon: Flag }] : []),
    ...(proj.enableNotes ? [{ id: "notes", label: "Notes", icon: StickyNote, count: proj.notes.length }] : []),
    { id: "members", label: "Team", icon: Users, count: proj.members.length },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  const daysLeft = daysUntil(proj.endDate);
  const sc = statusConfig[proj.status] || statusConfig.active;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-1 size-8 mt-0.5">
            <Link href="/projects"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: proj.color, boxShadow: `0 0 0 2px white, 0 0 0 3.5px ${proj.color}40` }} />
              <h1 className="text-lg font-semibold tracking-tight truncate">{proj.name}</h1>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className={cn("text-[10px] h-5", sc.color)}>
                <span className={cn("size-1.5 rounded-full mr-1", sc.dot)} />
                {sc.label}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px] h-5", priorityConfig[proj.priority]?.color)}>
                {priorityConfig[proj.priority]?.label}
              </Badge>
              {proj.billingType !== "hourly" && (
                <Badge variant="outline" className="text-[10px] h-5 capitalize">{proj.billingType.replace("_", " ")}</Badge>
              )}
              {proj.contact && (
                <span className="text-[11px] text-muted-foreground ml-1">{proj.contact.name}</span>
              )}
              {proj.tags.length > 0 && proj.tags.slice(0, 2).map(t => (
                <span key={t} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {proj.enableBilling && proj.contactId && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleGenerateInvoice()}>
              <Receipt className="mr-1.5 size-3" />Invoice
            </Button>
          )}
        </div>
      </div>
      <div className="h-px" style={{ background: `linear-gradient(to right, ${proj.color}30, transparent)` }} />

      {/* ── Quick Stats Strip ── */}
      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {proj.enableBilling && (
          <MiniStat label="Budget" value={proj.budget > 0 ? formatMoney(proj.budget) : "-"} sub={proj.budget > 0 ? `${pct(proj.totalBilled, proj.budget)}% used` : undefined} icon={DollarSign} color={proj.color} />
        )}
        {proj.enableBilling && (
          <MiniStat label="Billed" value={formatMoney(proj.totalBilled)} icon={ArrowUpRight} color={proj.color} />
        )}
        {proj.enableTimeTracking && (
          <MiniStat label="Logged" value={formatHours(proj.totalHours)} sub={proj.estimatedHours > 0 ? `of ${formatHours(proj.estimatedHours)}` : undefined} icon={Timer} color={proj.color} />
        )}
        {proj.enableTasks && (
          <MiniStat label="Tasks" value={`${proj.tasks.filter(t => t.status === "done").length}/${proj.tasks.length}`} sub={proj.tasks.length > 0 ? `${pct(proj.tasks.filter(t => t.status === "done").length, proj.tasks.length)}% done` : undefined} icon={CheckCircle2} color={proj.color} />
        )}
        <MiniStat label="Team" value={proj.members.length.toString()} sub={proj.members.length === 1 ? "member" : "members"} icon={Users} color={proj.color} />
        <MiniStat
          label="Deadline"
          value={proj.endDate ? formatDateShort(proj.endDate) : "None"}
          sub={daysLeft !== null ? (daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d late`) : undefined}
          subColor={daysLeft !== null && daysLeft < 0 ? "text-red-600" : daysLeft !== null && daysLeft <= 7 ? "text-amber-600" : undefined}
          icon={Calendar}
          color={proj.color}
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b -mx-1">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="text-xs gap-1.5 px-3 rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <tab.icon className="size-3.5" />
                {tab.label}
                {"count" in tab && (tab.count as number) > 0 && (
                  <span className="size-4 rounded-full bg-muted text-[9px] font-medium flex items-center justify-center">{tab.count as number}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* ── Tab Content ── */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && <OverviewTab proj={proj} onTabChange={setActiveTab} />}
        {activeTab === "tasks" && <TasksTab projectId={id} orgId={orgId} tasks={proj.tasks} members={proj.members} onRefresh={fetchProject} />}
        {activeTab === "time" && <TimeTab projectId={id} orgId={orgId} entries={proj.timeEntries} onRefresh={fetchProject} />}
        {activeTab === "milestones" && <MilestonesTab projectId={id} orgId={orgId} milestones={proj.milestones} onRefresh={fetchProject} />}
        {activeTab === "notes" && <NotesTab projectId={id} orgId={orgId} notes={proj.notes} onRefresh={fetchProject} />}
        {activeTab === "members" && <MembersTab projectId={id} orgId={orgId} members={proj.members} onRefresh={fetchProject} />}
        {activeTab === "settings" && <SettingsTab proj={proj} orgId={orgId} onRefresh={fetchProject} onDelete={() => handleDelete()} />}
      </div>
    </div>
  );

  async function handleGenerateInvoice() {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/projects/${id}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate invoice");
      }
      const data = await res.json();
      toast.success("Invoice generated");
      router.push(`/sales/${data.invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this project? This action cannot be undone.")) return;
    if (!orgId) return;
    await fetch(`/api/v1/projects/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Project deleted");
    window.dispatchEvent(new Event("projects-changed"));
    router.push("/projects");
  }
}

// ── Mini Stat ──────────────────────────────────────────────
function MiniStat({ label, value, sub, subColor, icon: Icon }: {
  label: string; value: string; sub?: string; subColor?: string; icon: typeof DollarSign; color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="size-3 text-muted-foreground/40" />
      </div>
      <p className="text-base font-bold font-mono tabular-nums tracking-tight">{value}</p>
      {sub && <p className={cn("text-[10px] mt-0.5", subColor || "text-muted-foreground")}>{sub}</p>}
    </div>
  );
}

// ── OVERVIEW TAB ───────────────────────────────────────────
function OverviewTab({ proj, onTabChange }: { proj: ProjectDetail; onTabChange: (tab: string) => void }) {
  const sc = statusConfig[proj.status] || statusConfig.active;
  const unbilledEntries = proj.timeEntries.filter(e => e.isBillable && !e.invoiceId);
  const unbilledAmount = unbilledEntries.reduce(
    (sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0
  );
  const unbilledMinutes = unbilledEntries.reduce((sum, e) => sum + e.minutes, 0);

  const tasksByStatus = proj.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTasks = proj.tasks.length;
  const doneTasks = tasksByStatus["done"] || 0;
  const progressPct = pct(doneTasks, totalTasks);
  const hoursProgressPct = proj.estimatedHours > 0 ? Math.min(100, pct(proj.totalHours, proj.estimatedHours)) : 0;
  const budgetPct = proj.budget > 0 ? Math.min(100, pct(proj.totalBilled, proj.budget)) : 0;

  const recentTasks = proj.tasks
    .filter(t => t.status !== "done" && t.status !== "cancelled")
    .slice(0, 5);
  const upcomingMilestones = proj.milestones
    .filter(m => m.status !== "completed")
    .slice(0, 3);

  const hasProgress = totalTasks > 0 || proj.estimatedHours > 0 || proj.budget > 0;
  const daysLeft = daysUntil(proj.endDate);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      {/* ── Left Column ── */}
      <div className="space-y-4">
        {/* Description + Timeline Row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Description */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Briefcase className="size-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">About</span>
            </div>
            {proj.description ? (
              <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">{proj.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic">No description added</p>
            )}
          </div>

          {/* Timeline Card */}
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="size-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">Start</span>
                <span className="font-medium">{formatDate(proj.startDate)}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">End</span>
                <span className="font-medium">{formatDate(proj.endDate)}</span>
              </div>
              {proj.startDate && proj.endDate && (
                <div className="pt-1">
                  <TimelineBar startDate={proj.startDate} endDate={proj.endDate} color={proj.color} />
                </div>
              )}
              {daysLeft !== null && (
                <p className={cn("text-[11px] font-medium pt-0.5", daysLeft < 0 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "text-muted-foreground")}>
                  {daysLeft > 0 ? `${daysLeft} days remaining` : daysLeft === 0 ? "Due today" : `${Math.abs(daysLeft)} days overdue`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {hasProgress && (
          <div className="rounded-lg border bg-card p-4 space-y-3.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5 text-muted-foreground/60" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {proj.enableTasks && totalTasks > 0 && (
                <ProgressRing label="Tasks" value={progressPct} color="#10b981" subtext={`${doneTasks}/${totalTasks}`} />
              )}
              {proj.enableTimeTracking && proj.estimatedHours > 0 && (
                <ProgressRing label="Time" value={hoursProgressPct} color="#3b82f6" subtext={`${formatHours(proj.totalHours)} / ${formatHours(proj.estimatedHours)}`} />
              )}
              {proj.enableBilling && proj.budget > 0 && (
                <ProgressRing label="Budget" value={budgetPct} color={budgetPct > 90 ? "#ef4444" : "#f59e0b"} subtext={`${formatMoney(proj.totalBilled)} / ${formatMoney(proj.budget)}`} />
              )}
            </div>

            {/* Stacked task status bar */}
            {proj.enableTasks && totalTasks > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                  {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                    const count = tasksByStatus[s] || 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={s}
                        className={cn("h-full transition-all", taskBarColors[s])}
                        style={{ width: `${pct(count, totalTasks)}%` }}
                        title={`${taskStatusConfig[s]?.label}: ${count}`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {(["done", "in_progress", "in_review", "todo", "backlog", "cancelled"] as const).map((s) => {
                    const count = tasksByStatus[s] || 0;
                    if (count === 0) return null;
                    return (
                      <div key={s} className="flex items-center gap-1">
                        <span className={cn("size-1.5 rounded-full", taskBarColors[s])} />
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
        {proj.enableTasks && recentTasks.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Zap className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Tasks</span>
              </div>
              <button onClick={() => onTabChange("tasks")} className="text-[11px] text-emerald-600 hover:underline font-medium">View all</button>
            </div>
            <div className="divide-y">
              {recentTasks.map((task) => {
                const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                const tsc = taskStatusConfig[task.status];
                return (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 transition-colors">
                    <span className={cn("size-1.5 rounded-full shrink-0", taskBarColors[task.status])} />
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
            </div>
          </div>
        )}

        {/* Recent Time Entries */}
        {proj.enableTimeTracking && proj.timeEntries.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Time</span>
              </div>
              <button onClick={() => onTabChange("time")} className="text-[11px] text-emerald-600 hover:underline font-medium">View all</button>
            </div>
            <div className="divide-y">
              {proj.timeEntries.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-16">{formatDateShort(e.date)}</span>
                  <span className="text-muted-foreground/60 text-[11px] shrink-0">{e.user?.name?.split(" ")[0] || "-"}</span>
                  <span className="truncate flex-1 text-muted-foreground">{e.description || "No description"}</span>
                  <span className="font-mono text-xs tabular-nums shrink-0 font-medium">{formatHours(e.minutes)}</span>
                  <span className="font-mono text-[11px] tabular-nums shrink-0 text-muted-foreground">{formatMoney(Math.round((e.minutes / 60) * e.hourlyRate))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming Milestones */}
        {proj.enableMilestones && upcomingMilestones.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
              <div className="flex items-center gap-1.5">
                <Flag className="size-3.5 text-muted-foreground/60" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Milestones</span>
              </div>
              <button onClick={() => onTabChange("milestones")} className="text-[11px] text-emerald-600 hover:underline font-medium">View all</button>
            </div>
            <div className="divide-y">
              {upcomingMilestones.map((ms) => {
                const overdue = ms.dueDate && new Date(ms.dueDate) < new Date();
                return (
                  <div key={ms.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Target className="size-4 text-muted-foreground/40 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[13px] font-medium">{ms.title}</span>
                      {ms.dueDate && (
                        <span className={cn("text-[10px] ml-2", overdue ? "text-red-600" : "text-muted-foreground")}>
                          {formatDateShort(ms.dueDate)}
                        </span>
                      )}
                    </div>
                    {ms.amount > 0 && <span className="font-mono text-xs text-muted-foreground">{formatMoney(ms.amount)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Right Sidebar ── */}
      <div className="space-y-3">
        {/* Details */}
        <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</span>
          <div className="space-y-2">
            <DetailRow label="Status" value={<Badge variant="outline" className={cn("text-[10px] h-5", sc.color)}><span className={cn("size-1.5 rounded-full mr-1", sc.dot)} />{sc.label}</Badge>} />
            <DetailRow label="Priority" value={<Badge variant="outline" className={cn("text-[10px] h-5", priorityConfig[proj.priority]?.color)}>{priorityConfig[proj.priority]?.label}</Badge>} />
            <DetailRow label="Billing" value={<span className="text-[13px] capitalize">{proj.billingType.replace("_", " ")}</span>} />
            {proj.contact && <DetailRow label="Client" value={<span className="text-[13px] font-medium">{proj.contact.name}</span>} />}
            {proj.category && <DetailRow label="Category" value={<span className="text-[13px]">{proj.category}</span>} />}
            {proj.hourlyRate > 0 && <DetailRow label="Rate" value={<span className="text-[13px] font-mono">{formatMoney(proj.hourlyRate)}/hr</span>} />}
            {proj.fixedPrice > 0 && <DetailRow label="Fixed Price" value={<span className="text-[13px] font-mono">{formatMoney(proj.fixedPrice)}</span>} />}
          </div>
        </div>

        {/* Financials */}
        {proj.enableBilling && (proj.totalBilled > 0 || unbilledAmount > 0 || proj.budget > 0) && (
          <div className="rounded-lg border bg-card p-3.5 space-y-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Financials</span>
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
              {unbilledMinutes > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Unbilled time</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{formatHours(unbilledMinutes)}</span>
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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Team</span>
              <button onClick={() => onTabChange("members")} className="text-[10px] text-emerald-600 hover:underline">Manage</button>
            </div>
            <div className="space-y-1.5">
              {proj.members.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="size-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0" style={{ backgroundColor: proj.color }}>
                    {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                  </div>
                  <span className="text-[12px] truncate flex-1">{m.member.user.name || m.member.user.email}</span>
                  <span className="text-[9px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{m.role}</span>
                </div>
              ))}
              {proj.members.length > 5 && (
                <button onClick={() => onTabChange("members")} className="text-[11px] text-muted-foreground hover:text-foreground">
                  +{proj.members.length - 5} more
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tags */}
        {proj.tags.length > 0 && (
          <div className="rounded-lg border bg-card p-3.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Tags</span>
            <div className="flex flex-wrap gap-1">
              {proj.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Pinned Notes */}
        {proj.enableNotes && proj.notes.filter(n => n.isPinned).length > 0 && (
          <div className="rounded-lg border bg-card p-3.5">
            <div className="flex items-center gap-1 mb-2">
              <Pin className="size-3 text-amber-500" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pinned</span>
            </div>
            <div className="space-y-2">
              {proj.notes.filter(n => n.isPinned).slice(0, 2).map((n) => (
                <p key={n.id} className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">{n.content}</p>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="rounded-lg border bg-card p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Quick Actions</span>
          <div className="grid grid-cols-2 gap-1.5">
            {proj.enableTasks && (
              <button onClick={() => onTabChange("tasks")} className="text-[11px] text-left px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5">
                <CheckCircle2 className="size-3 text-muted-foreground" />Add Task
              </button>
            )}
            {proj.enableTimeTracking && (
              <button onClick={() => onTabChange("time")} className="text-[11px] text-left px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5">
                <Clock className="size-3 text-muted-foreground" />Log Time
              </button>
            )}
            {proj.enableNotes && (
              <button onClick={() => onTabChange("notes")} className="text-[11px] text-left px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5">
                <StickyNote className="size-3 text-muted-foreground" />Add Note
              </button>
            )}
            <button onClick={() => onTabChange("settings")} className="text-[11px] text-left px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5">
              <Settings2 className="size-3 text-muted-foreground" />Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeline Bar ───────────────────────────────────────────
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

// ── Progress Ring ──────────────────────────────────────────
function ProgressRing({ label, value, color, subtext }: { label: string; value: number; color: string; subtext: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(value, 100) / 100) * circ;
  return (
    <div className="flex items-center gap-3">
      <svg width="64" height="64" className="shrink-0 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ stroke: color, transition: "stroke-dashoffset 0.6s ease" }} />
      </svg>
      <div>
        <p className="text-lg font-bold font-mono tabular-nums">{value}%</p>
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-[10px] text-muted-foreground">{subtext}</p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

// ── TASKS TAB ──────────────────────────────────────────────
function TasksTab({
  projectId, orgId, tasks, members, onRefresh,
}: {
  projectId: string; orgId: string | null; tasks: TaskData[]; members: ProjectMemberData[]; onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const filtered = statusFilter === "all"
    ? tasks
    : tasks.filter(t => t.status === statusFilter);

  async function handleAdd() {
    if (!orgId || !title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          title: title.trim(),
          description: desc || null,
          priority,
          status: taskStatus,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast.success("Task created");
      setAddOpen(false);
      setTitle(""); setDesc(""); setPriority("medium"); setTaskStatus("todo"); setAssigneeId(""); setDueDate("");
      onRefresh();
    } catch { toast.error("Failed to create task"); }
    finally { setSaving(false); }
  }

  async function toggleStatus(taskId: string, current: string) {
    if (!orgId) return;
    const newStatus = current === "done" ? "todo" : "done";
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  }

  async function deleteTask(taskId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs">All ({tasks.length})</TabsTrigger>
            <TabsTrigger value="todo" className="text-xs">To Do</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">In Progress</TabsTrigger>
            <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
          </TabsList>
        </Tabs>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8">
              <Plus className="mr-1.5 size-3.5" />Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details..." rows={2} />
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={taskStatus} onValueChange={setTaskStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="backlog">Backlog</SelectItem>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Unassigned</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.member.id} value={m.member.id}>
                          {m.member.user.name || m.member.user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <Button onClick={handleAdd} disabled={saving || !title.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No tasks found</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {filtered.map((task) => {
            const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
            const tsc = taskStatusConfig[task.status];
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group">
                <button onClick={() => toggleStatus(task.id, task.status)} className="shrink-0">
                  {task.status === "done" ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <CircleDashed className="size-4 text-muted-foreground/40 hover:text-emerald-400 transition-colors" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[13px] truncate", task.status === "done" && "line-through text-muted-foreground")}>
                      {task.title}
                    </span>
                  </div>
                  {task.description && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{task.description}</p>
                  )}
                </div>
                <Badge variant="outline" className={cn("text-[9px] h-4 shrink-0", priorityConfig[task.priority]?.color)}>
                  {task.priority}
                </Badge>
                <Badge variant="outline" className={cn("text-[9px] h-4 shrink-0", tsc?.bg, tsc?.text)}>
                  {tsc?.label}
                </Badge>
                {task.dueDate && (
                  <span className={cn("text-[10px] shrink-0 tabular-nums", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                    {overdue && <AlertCircle className="size-2.5 inline mr-0.5" />}
                    {formatDateShort(task.dueDate)}
                  </span>
                )}
                <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600">
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

// ── TIME TAB ───────────────────────────────────────────────
function TimeTab({
  projectId, orgId, entries, onRefresh,
}: {
  projectId: string; orgId: string | null; entries: TimeEntryData[]; onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryDesc, setEntryDesc] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryBillable, setEntryBillable] = useState("true");

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalAmount = entries.reduce(
    (sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0
  );
  const billableMinutes = entries.filter(e => e.isBillable).reduce((sum, e) => sum + e.minutes, 0);
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;

  const columns: Column<TimeEntryData>[] = [
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
      onRefresh();
    } catch { toast.error("Failed to add time entry"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Time</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{formatHours(totalMinutes)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Amount</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 mt-0.5">{formatMoney(totalAmount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Billable</p>
          <p className="text-lg font-bold font-mono tabular-nums mt-0.5">{billablePct}%</p>
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
              <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Input value={entryDesc} onChange={e => setEntryDesc(e.target.value)} placeholder="What did you work on?" /></div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5"><Label>Duration (minutes) *</Label><Input type="number" min={1} value={entryMinutes} onChange={e => setEntryMinutes(e.target.value)} placeholder="60" /></div>
                <div className="space-y-1.5"><Label>Billable</Label>
                  <Select value={entryBillable} onValueChange={setEntryBillable}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></SelectContent></Select>
                </div>
              </div>
              <Button onClick={handleAdd} disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Adding..." : "Add Entry"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DataTable columns={columns} data={entries} emptyMessage="No time entries yet." />
    </div>
  );
}

// ── MILESTONES TAB ─────────────────────────────────────────
function MilestonesTab({
  projectId, orgId, milestones, onRefresh,
}: {
  projectId: string; orgId: string | null; milestones: MilestoneData[]; onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");

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
      onRefresh();
    } catch { toast.error("Failed to create milestone"); }
    finally { setSaving(false); }
  }

  async function toggleComplete(ms: MilestoneData) {
    if (!orgId) return;
    const newStatus = ms.status === "completed" ? "upcoming" : "completed";
    await fetch(`/api/v1/projects/${projectId}/milestones/${ms.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  }

  async function deleteMilestone(msId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/milestones/${msId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
    onRefresh();
  }

  const completed = milestones.filter(m => m.status === "completed").length;
  const total = milestones.length;

  return (
    <div className="space-y-4">
      {total > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct(completed, total)}%` }} />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums font-mono">{completed}/{total}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="mr-1.5 size-3.5" />Milestone</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Milestone title" /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Amount</Label><Input type="number" step="0.01" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
              </div>
              <Button onClick={handleAdd} disabled={saving || !title.trim()} className="w-full bg-emerald-600 hover:bg-emerald-700">{saving ? "Creating..." : "Create Milestone"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {milestones.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
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

// ── NOTES TAB ──────────────────────────────────────────────
function NotesTab({
  projectId, orgId, notes, onRefresh,
}: {
  projectId: string; orgId: string | null; notes: NoteData[]; onRefresh: () => void;
}) {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!orgId || !content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Note added");
      setContent("");
      onRefresh();
    } catch { toast.error("Failed to add note"); }
    finally { setSaving(false); }
  }

  async function deleteNote(noteId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/notes?noteId=${noteId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write a note..." rows={3} className="resize-none border-0 p-0 focus-visible:ring-0 shadow-none text-[13px]" />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handleAdd} disabled={saving || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs">
            {saving ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <StickyNote className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border bg-card p-3.5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {note.isPinned && <Pin className="size-2.5 text-amber-500" />}
                    <span className="text-[11px] font-medium">{note.author.name || note.author.email}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-muted-foreground">{note.content}</p>
                </div>
                <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity shrink-0 mt-1">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MEMBERS TAB ────────────────────────────────────────────
function MembersTab({
  projectId, orgId, members, onRefresh,
}: {
  projectId: string; orgId: string | null; members: ProjectMemberData[]; onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; user: { name: string | null; email: string } }[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedRole, setSelectedRole] = useState("contributor");

  useEffect(() => {
    if (!orgId || !addOpen) return;
    fetch("/api/v1/members", { headers: { "x-organization-id": orgId } })
      .then(r => r.json())
      .then(data => {
        if (data.members) setOrgMembers(data.members);
        else if (data.data) setOrgMembers(data.data);
      })
      .catch(() => {});
  }, [orgId, addOpen]);

  const existingMemberIds = new Set(members.map(m => m.member.id));
  const availableMembers = orgMembers.filter(m => !existingMemberIds.has(m.id));

  async function handleAdd() {
    if (!orgId || !selectedMemberId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ memberId: selectedMemberId, role: selectedRole }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      toast.success("Member added");
      setAddOpen(false);
      setSelectedMemberId(""); setSelectedRole("contributor");
      onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function removeMember(memberId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/members?memberId=${memberId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
    toast.success("Member removed");
    onRefresh();
  }

  const roleColors: Record<string, string> = {
    manager: "bg-purple-50 text-purple-700",
    contributor: "bg-blue-50 text-blue-700",
    viewer: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8"><Plus className="mr-1.5 size-3.5" />Add Member</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 && <div className="py-2 px-3 text-sm text-muted-foreground">All members already added</div>}
                    {availableMembers.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.user.name || m.user.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="contributor">Contributor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAdd} disabled={saving || !selectedMemberId} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {saving ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {members.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Users className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No team members assigned</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 group hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold">
                  {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-[13px] font-medium">{m.member.user.name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground">{m.member.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium capitalize", roleColors[m.role])}>{m.role}</span>
                <button onClick={() => removeMember(m.member.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity">
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SETTINGS TAB ───────────────────────────────────────────
function SettingsTab({
  proj, orgId, onRefresh, onDelete,
}: {
  proj: ProjectDetail; orgId: string | null; onRefresh: () => void; onDelete: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [contactId, setContactId] = useState(proj.contactId || "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);

    try {
      const tagsRaw = (form.get("tags") as string || "").trim();
      const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

      const res = await fetch(`/api/v1/projects/${proj.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || null,
          contactId: contactId || null,
          status: form.get("status"),
          priority: form.get("priority"),
          billingType: form.get("billingType"),
          color: form.get("color"),
          budget: Math.round(parseFloat(form.get("budget") as string || "0") * 100),
          hourlyRate: Math.round(parseFloat(form.get("hourlyRate") as string || "0") * 100),
          fixedPrice: Math.round(parseFloat(form.get("fixedPrice") as string || "0") * 100),
          estimatedHours: Math.round(parseFloat(form.get("estimatedHours") as string || "0") * 60),
          startDate: form.get("startDate") || null,
          endDate: form.get("endDate") || null,
          category: form.get("category") || null,
          tags,
          enableTasks: form.get("enableTasks") === "on",
          enableTimeTracking: form.get("enableTimeTracking") === "on",
          enableMilestones: form.get("enableMilestones") === "on",
          enableNotes: form.get("enableNotes") === "on",
          enableBilling: form.get("enableBilling") === "on",
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      toast.success("Project updated");
      window.dispatchEvent(new Event("projects-changed"));
      onRefresh();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">General</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" name="name" required defaultValue={proj.name} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select name="status" defaultValue={proj.status}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select name="priority" defaultValue={proj.priority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <ContactPicker value={contactId} onChange={setContactId} type="customer" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input name="category" defaultValue={proj.category || ""} placeholder="e.g. Development" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map(c => (
                <label key={c} className="cursor-pointer">
                  <input type="radio" name="color" value={c} defaultChecked={proj.color === c} className="sr-only peer" />
                  <div className="size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all" style={{ backgroundColor: c }} />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <Input name="tags" defaultValue={proj.tags.join(", ")} placeholder="Comma separated" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea name="description" defaultValue={proj.description || ""} rows={3} />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Financial</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Billing Type</Label>
            <Select name="billingType" defaultValue={proj.billingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="fixed">Fixed Price</SelectItem>
                <SelectItem value="milestone">Milestone</SelectItem>
                <SelectItem value="non_billable">Non-Billable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Budget</Label><Input name="budget" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.budget)} /></div>
          <div className="space-y-1.5"><Label>Hourly Rate</Label><Input name="hourlyRate" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.hourlyRate)} /></div>
          <div className="space-y-1.5"><Label>Fixed Price</Label><Input name="fixedPrice" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.fixedPrice)} /></div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Timeline</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>Start Date</Label><Input name="startDate" type="date" defaultValue={proj.startDate || ""} /></div>
          <div className="space-y-1.5"><Label>End Date</Label><Input name="endDate" type="date" defaultValue={proj.endDate || ""} /></div>
          <div className="space-y-1.5"><Label>Estimated Hours</Label><Input name="estimatedHours" type="number" step="0.5" min={0} defaultValue={proj.estimatedHours > 0 ? (proj.estimatedHours / 60).toFixed(1) : ""} /></div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Features</p>
        <p className="text-xs text-muted-foreground -mt-2">Toggle features on or off. Disabled features hide their tabs.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { name: "enableTasks", label: "Tasks", desc: "Track tasks and to-dos", checked: proj.enableTasks },
            { name: "enableTimeTracking", label: "Time Tracking", desc: "Log time entries", checked: proj.enableTimeTracking },
            { name: "enableMilestones", label: "Milestones", desc: "Set project milestones", checked: proj.enableMilestones },
            { name: "enableNotes", label: "Notes", desc: "Project notes and comments", checked: proj.enableNotes },
            { name: "enableBilling", label: "Billing", desc: "Budget and invoice tracking", checked: proj.enableBilling },
          ].map((f) => (
            <label key={f.name} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/50 transition-colors">
              <input type="checkbox" name={f.name} defaultChecked={f.checked} className="accent-emerald-600" />
              <div>
                <p className="text-[13px] font-medium">{f.label}</p>
                <p className="text-[10px] text-muted-foreground">{f.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
        {saving ? "Saving..." : "Save Changes"}
      </Button>

      <div className="rounded-lg border border-red-200 bg-red-50/50 p-5 space-y-3">
        <p className="text-sm font-medium text-red-700">Danger Zone</p>
        <p className="text-xs text-red-600/80">Deleting this project removes all associated data permanently.</p>
        <Button type="button" variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-100" onClick={onDelete}>
          <Trash2 className="mr-1.5 size-3.5" />Delete Project
        </Button>
      </div>
    </form>
  );
}
