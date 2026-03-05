"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";

// ── Types ──────────────────────────────────────────────────
export interface ProjectMemberData {
  id: string;
  role: string;
  member: {
    id: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  };
}

export interface ChecklistItem {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
}

export interface LabelData {
  id: string;
  name: string;
  color: string;
}

export interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  labels: string[];
  assigneeId: string | null;
  teamId: string | null;
  createdById: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: {
    id: string;
    role: string;
    user: { id: string; name: string | null; email: string; image: string | null };
  } | null;
  team: { id: string; name: string; color: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  checklist: ChecklistItem[];
  comments: TaskComment[];
}

export interface TeamData {
  id: string;
  name: string;
  color: string;
  members: {
    id: string;
    member: {
      id: string;
      role: string;
      user: { id: string; name: string | null; email: string; image: string | null };
    };
  }[];
}

export interface MilestoneData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  amount: number;
  completedAt: string | null;
}

export interface NoteData {
  id: string;
  content: string;
  isPinned: boolean;
  createdAt: string;
  author: { name: string | null; email: string };
}

export interface TimeEntryData {
  id: string;
  date: string;
  description: string | null;
  minutes: number;
  isBillable: boolean;
  hourlyRate: number;
  invoiceId: string | null;
  taskId: string | null;
  userId: string;
  user: { name: string | null } | null;
  task: { id: string; title: string } | null;
}

export interface RunningTimerData {
  id: string;
  projectId: string;
  userId: string;
  startedAt: string;
  pausedAt: string | null;
  accumulatedSeconds: number;
  description: string | null;
  taskId: string | null;
  isBillable: boolean;
  task: { id: string; title: string } | null;
}

export interface ProjectDetail {
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
  teams: TeamData[];
  labels: LabelData[];
  runningTimers: RunningTimerData[];
}

interface ProjectContextValue {
  project: ProjectDetail | null;
  loading: boolean;
  orgId: string | null;
  projectId: string;
  refresh: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null
  );

  const refresh = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/projects/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProject(data.project);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ProjectContext.Provider value={{ project, loading, orgId, projectId: id, refresh }}>
      {children}
    </ProjectContext.Provider>
  );
}

// ── Shared Helpers ─────────────────────────────────────────
export function formatHours(minutes: number): string {
  if (minutes === 0) return "0h";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

export const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: "Active", color: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  completed: { label: "Completed", color: "border-blue-200 bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  on_hold: { label: "On Hold", color: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  cancelled: { label: "Cancelled", color: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
  archived: { label: "Archived", color: "border-gray-200 bg-gray-50 text-gray-700", dot: "bg-gray-400" },
};

export const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "border-gray-200 bg-gray-50 text-gray-600" },
  medium: { label: "Medium", color: "border-blue-200 bg-blue-50 text-blue-700" },
  high: { label: "High", color: "border-orange-200 bg-orange-50 text-orange-700" },
  urgent: { label: "Urgent", color: "border-red-200 bg-red-50 text-red-700" },
};

export const taskStatusConfig: Record<string, { label: string; bg: string; text: string; bar: string }> = {
  backlog: { label: "Backlog", bg: "bg-gray-100", text: "text-gray-600", bar: "bg-gray-300" },
  todo: { label: "To Do", bg: "bg-slate-100", text: "text-slate-700", bar: "bg-slate-400" },
  in_progress: { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", bar: "bg-amber-400" },
  in_review: { label: "In Review", bg: "bg-purple-50", text: "text-purple-700", bar: "bg-purple-400" },
  done: { label: "Done", bg: "bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
  cancelled: { label: "Cancelled", bg: "bg-red-50", text: "text-red-600", bar: "bg-red-400" },
};

export const PROJECT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];
