"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  Clock,
  FileText,
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
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
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
const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  archived: "border-gray-200 bg-gray-50 text-gray-700",
};

const priorityColors: Record<string, string> = {
  low: "border-gray-200 bg-gray-50 text-gray-600",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const taskStatusColors: Record<string, string> = {
  backlog: "bg-gray-100 text-gray-600",
  todo: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  in_review: "bg-purple-50 text-purple-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const PROJECT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

function formatHours(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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

  // Build tabs based on enabled features
  const tabs = [
    { id: "overview", label: "Overview", icon: CircleDot },
    ...(proj.enableTasks ? [{ id: "tasks", label: "Tasks", icon: CheckCircle2 }] : []),
    ...(proj.enableTimeTracking ? [{ id: "time", label: "Time", icon: Clock }] : []),
    ...(proj.enableMilestones ? [{ id: "milestones", label: "Milestones", icon: Flag }] : []),
    ...(proj.enableNotes ? [{ id: "notes", label: "Notes", icon: StickyNote }] : []),
    { id: "members", label: "Members", icon: Users },
    { id: "settings", label: "Settings", icon: Settings2 },
  ];

  const daysLeft = daysUntil(proj.endDate);

  return (
    <div className="space-y-5">
      {/* Header with color accent */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" asChild className="shrink-0 -ml-2">
            <Link href="/projects"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: proj.color }}
          />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight truncate">{proj.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant="outline" className={cn("text-[11px]", statusColors[proj.status])}>
                {proj.status.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className={cn("text-[11px]", priorityColors[proj.priority])}>
                {proj.priority}
              </Badge>
              {proj.contact && (
                <span className="text-xs text-muted-foreground">{proj.contact.name}</span>
              )}
              {proj.category && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{proj.category}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {proj.enableBilling && proj.contactId && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleGenerateInvoice()}>
              <FileText className="mr-1.5 size-3.5" />Invoice
            </Button>
          )}
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-emerald-500/20 via-border to-transparent" />

      {/* Stat row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {proj.enableBilling && (
          <>
            <StatCard title="Budget" value={proj.budget > 0 ? formatMoney(proj.budget) : "-"} icon={DollarSign}
              change={proj.budget > 0 ? `${Math.round((proj.totalBilled / proj.budget) * 100)}% used` : undefined}
              changeType={proj.budget > 0 && proj.totalBilled / proj.budget > 0.9 ? "negative" : "neutral"}
            />
            <StatCard title="Billed" value={formatMoney(proj.totalBilled)} icon={ArrowUpRight} />
          </>
        )}
        {proj.enableTimeTracking && (
          <StatCard title="Hours Logged" value={formatHours(proj.totalHours)} icon={Clock}
            change={proj.estimatedHours > 0 ? `${Math.round((proj.totalHours / proj.estimatedHours) * 100)}% of est.` : undefined}
          />
        )}
        {proj.enableTasks && (
          <StatCard title="Tasks" value={`${proj.tasks.filter(t => t.status === "done").length}/${proj.tasks.length}`} icon={CheckCircle2}
            change={proj.tasks.length > 0 ? `${Math.round((proj.tasks.filter(t => t.status === "done").length / proj.tasks.length) * 100)}% done` : undefined}
            changeType="positive"
          />
        )}
        <StatCard title="Deadline" value={proj.endDate ? formatDate(proj.endDate) : "No deadline"} icon={Calendar}
          change={daysLeft !== null ? (daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Today" : `${Math.abs(daysLeft)}d overdue`) : undefined}
          changeType={daysLeft !== null ? (daysLeft < 0 ? "negative" : daysLeft <= 7 ? "negative" : "neutral") : "neutral"}
        />
      </div>

      {/* Subtabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5">
              <tab.icon className="size-3.5" />
              {tab.label}
              {tab.id === "tasks" && proj.tasks.length > 0 && (
                <span className="ml-0.5 text-[10px] text-muted-foreground">{proj.tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length}</span>
              )}
              {tab.id === "members" && proj.members.length > 0 && (
                <span className="ml-0.5 text-[10px] text-muted-foreground">{proj.members.length}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "overview" && <OverviewTab proj={proj} />}
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
    router.push("/projects");
  }
}

// ── OVERVIEW TAB ───────────────────────────────────────────
function OverviewTab({ proj }: { proj: ProjectDetail }) {
  const unbilledEntries = proj.timeEntries.filter(e => e.isBillable && !e.invoiceId);
  const unbilledAmount = unbilledEntries.reduce(
    (sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate), 0
  );

  const tasksByStatus = proj.tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTasks = proj.tasks.length;
  const doneTasks = tasksByStatus["done"] || 0;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const hoursProgressPct = proj.estimatedHours > 0 ? Math.min(100, Math.round((proj.totalHours / proj.estimatedHours) * 100)) : 0;
  const budgetPct = proj.budget > 0 ? Math.min(100, Math.round((proj.totalBilled / proj.budget) * 100)) : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Left column */}
      <div className="space-y-5">
        {/* Description */}
        {proj.description && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Description</p>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{proj.description}</p>
          </div>
        )}

        {/* Progress bars */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Progress</p>

          {proj.enableTasks && totalTasks > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tasks</span>
                <span className="font-mono text-xs tabular-nums">{doneTasks}/{totalTasks} ({progressPct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {proj.enableTimeTracking && proj.estimatedHours > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span className="font-mono text-xs tabular-nums">{formatHours(proj.totalHours)} / {formatHours(proj.estimatedHours)} ({hoursProgressPct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", hoursProgressPct > 100 ? "bg-red-500" : "bg-blue-500")} style={{ width: `${Math.min(hoursProgressPct, 100)}%` }} />
              </div>
            </div>
          )}

          {proj.enableBilling && proj.budget > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-mono text-xs tabular-nums">{formatMoney(proj.totalBilled)} / {formatMoney(proj.budget)} ({budgetPct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", budgetPct > 90 ? "bg-red-500" : "bg-amber-500")} style={{ width: `${Math.min(budgetPct, 100)}%` }} />
              </div>
            </div>
          )}

          {totalTasks === 0 && proj.estimatedHours === 0 && proj.budget === 0 && (
            <p className="text-xs text-muted-foreground">Add tasks, estimates, or a budget to track progress.</p>
          )}
        </div>

        {/* Task breakdown by status */}
        {proj.enableTasks && totalTasks > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Tasks by Status</p>
            <div className="grid grid-cols-3 gap-3">
              {(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const).map((s) => (
                <div key={s} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", taskStatusColors[s]?.replace("text-", "bg-").split(" ")[0] || "bg-gray-300")} />
                    <span className="text-xs text-muted-foreground capitalize">{s.replace("_", " ")}</span>
                  </div>
                  <span className="font-mono text-xs tabular-nums">{tasksByStatus[s] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent time entries */}
        {proj.enableTimeTracking && proj.timeEntries.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Recent Time Entries</p>
            <div className="space-y-2">
              {proj.timeEntries.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground shrink-0">{e.date}</span>
                    <span className="truncate text-xs">{e.description || "No description"}</span>
                  </div>
                  <span className="font-mono text-xs tabular-nums shrink-0 ml-2">{formatHours(e.minutes)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right sidebar */}
      <div className="space-y-4">
        {/* Details card */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Details</p>
          <div className="space-y-2.5">
            <DetailRow label="Status" value={<Badge variant="outline" className={cn("text-[11px]", statusColors[proj.status])}>{proj.status.replace("_", " ")}</Badge>} />
            <DetailRow label="Priority" value={<Badge variant="outline" className={cn("text-[11px]", priorityColors[proj.priority])}>{proj.priority}</Badge>} />
            <DetailRow label="Billing" value={<span className="text-sm capitalize">{proj.billingType.replace("_", " ")}</span>} />
            {proj.contact && <DetailRow label="Client" value={<span className="text-sm">{proj.contact.name}</span>} />}
            {proj.startDate && <DetailRow label="Start" value={<span className="text-sm">{formatDate(proj.startDate)}</span>} />}
            {proj.endDate && <DetailRow label="End" value={<span className="text-sm">{formatDate(proj.endDate)}</span>} />}
            {proj.hourlyRate > 0 && <DetailRow label="Rate" value={<span className="text-sm font-mono">{formatMoney(proj.hourlyRate)}/hr</span>} />}
            {proj.fixedPrice > 0 && <DetailRow label="Fixed Price" value={<span className="text-sm font-mono">{formatMoney(proj.fixedPrice)}</span>} />}
          </div>
        </div>

        {/* Tags */}
        {proj.tags.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {proj.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        {proj.members.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Team</p>
            <div className="space-y-2">
              {proj.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-medium">
                      {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                    </div>
                    <span className="text-xs truncate">{m.member.user.name || m.member.user.email}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financials summary */}
        {proj.enableBilling && (
          <div className="rounded-lg border bg-card p-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Financials</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Billed</span>
                <span className="font-mono tabular-nums">{formatMoney(proj.totalBilled)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unbilled</span>
                <span className="font-mono tabular-nums text-amber-600">{formatMoney(unbilledAmount)}</span>
              </div>
              {proj.budget > 0 && (
                <div className="flex justify-between text-sm border-t pt-1.5">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className={cn("font-mono tabular-nums font-medium", proj.budget - proj.totalBilled < 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatMoney(proj.budget - proj.totalBilled)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pinned notes */}
        {proj.enableNotes && proj.notes.filter(n => n.isPinned).length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <Pin className="size-3 inline mr-1" />Pinned Notes
            </p>
            <div className="space-y-2">
              {proj.notes.filter(n => n.isPinned).slice(0, 3).map((n) => (
                <p key={n.id} className="text-xs text-muted-foreground line-clamp-2">{n.content}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
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
      <div className="flex items-center justify-between">
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
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
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
            return (
              <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group">
                <button onClick={() => toggleStatus(task.id, task.status)} className="shrink-0">
                  <CheckCircle2 className={cn("size-4", task.status === "done" ? "text-emerald-500 fill-emerald-50" : "text-muted-foreground/40")} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm truncate", task.status === "done" && "line-through text-muted-foreground")}>
                      {task.title}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", priorityColors[task.priority])}>
                      {task.priority}
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", taskStatusColors[task.status])}>
                      {task.status.replace("_", " ")}
                    </Badge>
                  </div>
                  {(task.dueDate || task.description) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.dueDate && (
                        <span className={cn("text-[11px]", overdue ? "text-red-600 font-medium" : "text-muted-foreground")}>
                          {overdue && <AlertCircle className="size-3 inline mr-0.5" />}
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                      {task.description && <span className="text-[11px] text-muted-foreground truncate">{task.description}</span>}
                    </div>
                  )}
                </div>
                <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600">
                  <Trash2 className="size-3.5" />
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
    { key: "date", header: "Date", className: "w-28", render: r => <span className="text-sm">{r.date}</span> },
    { key: "user", header: "User", className: "w-32", render: r => <span className="text-xs text-muted-foreground">{r.user?.name || "-"}</span> },
    { key: "description", header: "Description", render: r => (
      <div className="space-y-0.5">
        <span className="text-sm">{r.description || "-"}</span>
        {r.task && <span className="text-[10px] text-muted-foreground block">Task: {r.task.title}</span>}
      </div>
    )},
    { key: "duration", header: "Duration", className: "w-20 text-right", render: r => <span className="text-sm font-mono tabular-nums">{formatHours(r.minutes)}</span> },
    { key: "rate", header: "Rate", className: "w-24 text-right", render: r => <span className="text-xs font-mono tabular-nums">{formatMoney(r.hourlyRate)}/hr</span> },
    { key: "amount", header: "Amount", className: "w-24 text-right", render: r => <span className="text-sm font-mono tabular-nums font-medium">{formatMoney(Math.round((r.minutes / 60) * r.hourlyRate))}</span> },
    { key: "status", header: "Status", className: "w-24", render: r => {
      if (r.invoiceId) return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px]">Invoiced</Badge>;
      return <Badge variant="outline" className={cn("text-[10px]", r.isBillable ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-700")}>{r.isBillable ? "Billable" : "Non-billable"}</Badge>;
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
      <div className="grid gap-3 grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Total Time</p>
          <p className="text-lg font-bold font-mono tabular-nums">{formatHours(totalMinutes)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Total Amount</p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-600">{formatMoney(totalAmount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Billable</p>
          <p className="text-lg font-bold font-mono tabular-nums">{billablePct}%</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
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
        body: JSON.stringify({
          title: title.trim(),
          description: desc || null,
          dueDate: dueDate || null,
          amount: Math.round(parseFloat(amount || "0") * 100),
        }),
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
    await fetch(`/api/v1/projects/${projectId}/milestones/${msId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    onRefresh();
  }

  const msStatusColors: Record<string, string> = {
    upcoming: "text-blue-600 bg-blue-50",
    in_progress: "text-amber-600 bg-amber-50",
    completed: "text-emerald-600 bg-emerald-50",
    overdue: "text-red-600 bg-red-50",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-1.5 size-3.5" />Milestone
            </Button>
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
        <div className="space-y-3">
          {milestones.map((ms) => {
            const overdue = ms.dueDate && new Date(ms.dueDate) < new Date() && ms.status !== "completed";
            return (
              <div key={ms.id} className="rounded-lg border bg-card p-4 group">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleComplete(ms)} className="mt-0.5">
                      <Target className={cn("size-5", ms.status === "completed" ? "text-emerald-500" : "text-muted-foreground/40")} />
                    </button>
                    <div>
                      <h4 className={cn("text-sm font-medium", ms.status === "completed" && "line-through text-muted-foreground")}>{ms.title}</h4>
                      {ms.description && <p className="text-xs text-muted-foreground mt-0.5">{ms.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5">
                        <Badge variant="outline" className={cn("text-[10px]", msStatusColors[overdue ? "overdue" : ms.status])}>
                          {overdue ? "overdue" : ms.status.replace("_", " ")}
                        </Badge>
                        {ms.dueDate && <span className={cn("text-[11px]", overdue ? "text-red-600" : "text-muted-foreground")}>{formatDate(ms.dueDate)}</span>}
                        {ms.amount > 0 && <span className="text-[11px] font-mono text-muted-foreground">{formatMoney(ms.amount)}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => deleteMilestone(ms.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
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
    await fetch(`/api/v1/projects/${projectId}/notes?noteId=${noteId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    onRefresh();
  }

  return (
    <div className="space-y-4">
      {/* Add note input */}
      <div className="rounded-lg border bg-card p-4">
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write a note..."
          rows={3}
          className="resize-none border-0 p-0 focus-visible:ring-0 shadow-none"
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handleAdd} disabled={saving || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700">
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
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border bg-card p-4 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {note.isPinned && <Pin className="size-3 text-amber-500 inline mr-1" />}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                    <span>{note.author.name || note.author.email}</span>
                    <span>·</span>
                    <span>{new Date(note.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <button onClick={() => deleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity shrink-0">
                  <Trash2 className="size-3.5" />
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
    fetch("/api/v1/members", {
      headers: { "x-organization-id": orgId },
    })
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
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      toast.success("Member added");
      setAddOpen(false);
      setSelectedMemberId(""); setSelectedRole("contributor");
      onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  }

  async function removeMember(memberId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/members?memberId=${memberId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Member removed");
    onRefresh();
  }

  const roleColors: Record<string, string> = {
    manager: "border-purple-200 bg-purple-50 text-purple-700",
    contributor: "border-blue-200 bg-blue-50 text-blue-700",
    viewer: "border-gray-200 bg-gray-50 text-gray-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-1.5 size-3.5" />Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Member</Label>
                <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                  <SelectTrigger><SelectValue placeholder="Select member..." /></SelectTrigger>
                  <SelectContent>
                    {availableMembers.length === 0 && <div className="py-2 px-3 text-sm text-muted-foreground">All org members are already added</div>}
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
          <p className="mt-2 text-sm text-muted-foreground">No team members assigned yet</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 group hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-medium">
                  {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{m.member.user.name || "Unnamed"}</p>
                  <p className="text-[11px] text-muted-foreground">{m.member.user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]", roleColors[m.role])}>{m.role}</Badge>
                <button onClick={() => removeMember(m.member.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity">
                  <Trash2 className="size-3.5" />
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
      onRefresh();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* General */}
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
            <Input name="category" defaultValue={proj.category || ""} placeholder="e.g. Development, Design" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map(c => (
                <label key={c} className="cursor-pointer">
                  <input type="radio" name="color" value={c} defaultChecked={proj.color === c} className="sr-only peer" />
                  <div className={cn("size-6 rounded-full ring-2 ring-transparent peer-checked:ring-offset-2 peer-checked:ring-gray-400 transition-all")} style={{ backgroundColor: c }} />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <Input name="tags" defaultValue={proj.tags.join(", ")} placeholder="Comma separated tags" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea name="description" defaultValue={proj.description || ""} rows={3} />
        </div>
      </div>

      {/* Financial */}
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
          <div className="space-y-1.5">
            <Label>Budget</Label>
            <Input name="budget" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.budget)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hourly Rate</Label>
            <Input name="hourlyRate" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.hourlyRate)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fixed Price</Label>
            <Input name="fixedPrice" type="number" step="0.01" min={0} defaultValue={centsToDecimal(proj.fixedPrice)} />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Timeline</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input name="startDate" type="date" defaultValue={proj.startDate || ""} />
          </div>
          <div className="space-y-1.5">
            <Label>End Date</Label>
            <Input name="endDate" type="date" defaultValue={proj.endDate || ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Estimated Hours</Label>
            <Input name="estimatedHours" type="number" step="0.5" min={0} defaultValue={proj.estimatedHours > 0 ? (proj.estimatedHours / 60).toFixed(1) : ""} placeholder="0" />
          </div>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <p className="text-sm font-medium">Features</p>
        <p className="text-xs text-muted-foreground">Enable or disable features for this project. Disabled features won&apos;t show as tabs.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { name: "enableTasks", label: "Tasks", desc: "Track tasks and to-dos", checked: proj.enableTasks },
            { name: "enableTimeTracking", label: "Time Tracking", desc: "Log time entries", checked: proj.enableTimeTracking },
            { name: "enableMilestones", label: "Milestones", desc: "Set project milestones", checked: proj.enableMilestones },
            { name: "enableNotes", label: "Notes", desc: "Project notes and comments", checked: proj.enableNotes },
            { name: "enableBilling", label: "Billing", desc: "Budget and invoice tracking", checked: proj.enableBilling },
          ].map((f) => (
            <label key={f.name} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50/50 transition-colors">
              <input type="checkbox" name={f.name} defaultChecked={f.checked} className="mt-0.5 accent-emerald-600" />
              <div>
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-[11px] text-muted-foreground">{f.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-5 space-y-3">
        <p className="text-sm font-medium text-red-700">Danger Zone</p>
        <p className="text-xs text-red-600/80">Deleting this project is permanent and cannot be undone. All tasks, milestones, notes, and time entries will be removed.</p>
        <Button type="button" variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-100" onClick={onDelete}>
          <Trash2 className="mr-1.5 size-3.5" />Delete Project
        </Button>
      </div>
    </form>
  );
}
