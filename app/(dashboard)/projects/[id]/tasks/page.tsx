"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  User2,
  CalendarDays,
  Users,
  MessageSquare,
  ListChecks,
  Send,
  LayoutList,
  Columns3,
  Loader2,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CircleDashed } from "lucide-react";
import {
  useProject,
  priorityConfig,
  taskStatusConfig,
  formatDateShort,
  formatDate,
  formatHours,
  isPastDue,
  projectFetch,
  errorText,
  type TaskData,
} from "../project-context";
import { useConfirm } from "@/lib/hooks/use-confirm";

type ViewMode = "list" | "board";

export default function TasksPage() {
  const { project: proj, orgId, projectId, canContribute, canManage } = useProject();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  // Keep only the id: the sheet always shows the live task from the project, so
  // checklist, comments and edits show up as soon as they are saved.
  const [viewTaskId, setViewTaskId] = useState<string | null>(null);
  const viewTask = proj?.tasks.find((t) => t.id === viewTaskId) ?? null;
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Create form state
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [assigneeId, setAssigneeId] = useState("none");
  const [teamId, setTeamId] = useState("none");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  // View drawer edit state
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssigneeId, setEditAssigneeId] = useState("none");
  const [editTeamId, setEditTeamId] = useState("none");

  // Checklist + Comments
  const [newCheckItem, setNewCheckItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // Loading states for inline actions
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkItemSaving, setCheckItemSaving] = useState(false);
  const [deletingCheckId, setDeletingCheckId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  useDocumentTitle("Projects · Tasks");

  // Keep the sheet's dropdowns in step with the saved task.
  useEffect(() => {
    if (!viewTask) return;
    setEditStatus(viewTask.status);
    setEditPriority(viewTask.priority);
    setEditAssigneeId(viewTask.assigneeId || "none");
    setEditTeamId(viewTask.teamId || "none");
  }, [viewTask?.id, viewTask?.status, viewTask?.priority, viewTask?.assigneeId, viewTask?.teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The task was deleted (here or elsewhere): close the sheet.
  useEffect(() => {
    if (viewTaskId && proj && !viewTask) setViewTaskId(null);
  }, [viewTaskId, proj, viewTask]);

  if (!proj) return null;

  const tasks = proj.tasks;
  const members = proj.members;
  const teams = proj.teams || [];
  const labels = proj.labels || [];
  const filtered = statusFilter === "all" ? tasks : tasks.filter(t => t.status === statusFilter);

  const tasksByStatus = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const overdueTasks = tasks.filter(t => isPastDue(t.dueDate) && t.status !== "done" && t.status !== "cancelled");

  function openViewDrawer(task: TaskData) {
    setViewTaskId(task.id);
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditAssigneeId(task.assigneeId || "none");
    setEditTeamId(task.teamId || "none");
    setNewCheckItem("");
    setNewComment("");
  }

  async function handleAdd() {
    if (!orgId || !title.trim()) return;
    setSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks`, {
        method: "POST",
        body: {
          title: title.trim(),
          description: desc || null,
          priority,
          status: taskStatus,
          assigneeId: assigneeId === "none" ? null : assigneeId,
          teamId: teamId === "none" ? null : teamId,
          startDate: startDate || null,
          dueDate: dueDate || null,
          estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
          labels: selectedLabels,
        },
      });
      toast.success("Task created");
      setAddOpen(false);
      setTitle(""); setDesc(""); setPriority("medium"); setTaskStatus("todo");
      setAssigneeId("none"); setTeamId("none"); setDueDate(""); setStartDate("");
      setEstimatedMinutes(""); setSelectedLabels([]);
    } catch (err) { toast.error(errorText(err, "Failed to create task")); }
    finally { setSaving(false); }
  }

  async function handleUpdate(taskId: string, updates: Record<string, unknown>): Promise<boolean> {
    if (!orgId) return false;
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", body: updates });
      return true;
    } catch (err) {
      toast.error(errorText(err, "Failed to update task"));
      return false;
    }
  }

  async function toggleStatus(taskId: string, current: string) {
    if (togglingId) return;
    setTogglingId(taskId);
    try {
      const newStatus = current === "done" ? "todo" : "done";
      await handleUpdate(taskId, { status: newStatus });
    } finally { setTogglingId(null); }
  }

  async function deleteTask(taskId: string) {
    if (!orgId || deletingId) return;
    const task = tasks.find((t) => t.id === taskId);
    const ok = await confirm({
      title: `Delete "${task?.title ?? "this task"}"?`,
      description: "The task, its checklist and comments are removed for good. Time logged against it stays on the project without a task.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(taskId);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
      toast.success("Task deleted");
      setViewTaskId(null);
    } catch (err) { toast.error(errorText(err, "Failed to delete task")); }
    finally { setDeletingId(null); }
  }

  async function addChecklistItem(taskId: string) {
    if (!orgId || !newCheckItem.trim() || checkItemSaving) return;
    setCheckItemSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}/checklist`, {
        method: "POST",
        body: { title: newCheckItem.trim() },
      });
      setNewCheckItem("");
    } catch (err) { toast.error(errorText(err, "Failed to add item")); }
    finally { setCheckItemSaving(false); }
  }

  async function toggleChecklistItem(taskId: string, itemId: string, isCompleted: boolean) {
    if (!orgId) return;
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}/checklist`, {
        method: "PATCH",
        body: { items: [{ id: itemId, isCompleted }] },
      });
    } catch (err) { toast.error(errorText(err, "Failed to update item")); }
  }

  async function deleteChecklistItem(taskId: string, itemId: string) {
    if (!orgId || deletingCheckId) return;
    setDeletingCheckId(itemId);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}/checklist?itemId=${itemId}`, { method: "DELETE" });
    } catch (err) { toast.error(errorText(err, "Failed to delete item")); }
    finally { setDeletingCheckId(null); }
  }

  async function addComment(taskId: string) {
    if (!orgId || !newComment.trim()) return;
    setCommentSaving(true);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}/comments`, {
        method: "POST",
        body: { content: newComment.trim() },
      });
      setNewComment("");
    } catch (err) { toast.error(errorText(err, "Failed to post comment")); }
    finally { setCommentSaving(false); }
  }

  async function deleteComment(taskId: string, commentId: string) {
    if (!orgId || deletingCommentId) return;
    const ok = await confirm({ title: "Delete this comment?", confirmLabel: "Delete", destructive: true });
    if (!ok) return;
    setDeletingCommentId(commentId);
    try {
      await projectFetch(orgId, `/api/v1/projects/${projectId}/tasks/${taskId}/comments?commentId=${commentId}`, { method: "DELETE" });
    } catch (err) { toast.error(errorText(err, "Failed to delete comment")); }
    finally { setDeletingCommentId(null); }
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-5">
        {(["todo", "in_progress", "in_review", "done"] as const).map(s => {
          const tsc = taskStatusConfig[s];
          const count = tasksByStatus[s] || 0;
          return (
            <div key={s} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn("size-2 rounded-full", tsc.bar)} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tsc.label}</span>
              </div>
              <p className="text-lg font-bold font-mono tabular-nums">{count}</p>
            </div>
          );
        })}
        <div className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="size-2.5 text-red-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Overdue</span>
          </div>
          <p className={cn("text-lg font-bold font-mono tabular-nums", overdueTasks.length > 0 && "text-red-600")}>{overdueTasks.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs">All ({tasks.length})</TabsTrigger>
              <TabsTrigger value="backlog" className="text-xs">Backlog</TabsTrigger>
              <TabsTrigger value="todo" className="text-xs">To Do</TabsTrigger>
              <TabsTrigger value="in_progress" className="text-xs">In Progress</TabsTrigger>
              <TabsTrigger value="in_review" className="text-xs">Review</TabsTrigger>
              <TabsTrigger value="done" className="text-xs">Done</TabsTrigger>
              <TabsTrigger value="cancelled" className="text-xs">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border bg-card">
            <button
              className={cn("p-1.5 rounded-l-md transition-colors", viewMode === "list" ? "bg-muted" : "hover:bg-muted/50")}
              onClick={() => setViewMode("list")}
            >
              <LayoutList className="size-3.5" />
            </button>
            <button
              className={cn("p-1.5 rounded-r-md transition-colors", viewMode === "board" ? "bg-muted" : "hover:bg-muted/50")}
              onClick={() => setViewMode("board")}
            >
              <Columns3 className="size-3.5" />
            </button>
          </div>
          {canContribute && (
            <Button size="sm" className="bg-brand-600 hover:bg-brand-700 h-8" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />Task
            </Button>
          )}
        </div>
      </div>

      {/* Create Task Drawer */}
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <Plus className="size-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">New Task</SheetTitle>
                <SheetDescription>Add a new task to this project.</SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details, notes, acceptance criteria..." rows={4} />
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
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
                <div className="space-y-2">
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
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {members.map(m => (
                        <SelectItem key={m.member.id} value={m.member.id}>
                          {m.member.user.name || m.member.user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={teamId} onValueChange={setTeamId}>
                    <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No team</SelectItem>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schedule</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Select start date" />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <DatePicker value={dueDate} onChange={setDueDate} placeholder="Select due date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Estimated Time (minutes)</Label>
                <Input type="number" min={1} value={estimatedMinutes} onChange={e => setEstimatedMinutes(e.target.value)} placeholder="e.g. 120" />
              </div>
            </div>

            {labels.length > 0 && (
              <>
                <div className="h-px bg-border" />
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Labels</p>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map(l => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedLabels(prev =>
                          prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id]
                        )}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors",
                          selectedLabels.includes(l.id)
                            ? "border-foreground/30 bg-foreground/5 font-medium"
                            : "border-border hover:bg-muted"
                        )}
                      >
                        <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !title.trim()} className="bg-brand-600 hover:bg-brand-700">
              {saving ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* View/Edit Task Drawer */}
      <Sheet open={!!viewTask} onOpenChange={(open) => { if (!open) setViewTaskId(null); }}>
        <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col">
          {viewTask && <TaskDetailDrawer
            task={viewTask}
            editStatus={editStatus}
            setEditStatus={setEditStatus}
            editPriority={editPriority}
            setEditPriority={setEditPriority}
            editAssigneeId={editAssigneeId}
            setEditAssigneeId={setEditAssigneeId}
            editTeamId={editTeamId}
            setEditTeamId={setEditTeamId}
            members={members}
            teams={teams}
            labels={labels}
            newCheckItem={newCheckItem}
            setNewCheckItem={setNewCheckItem}
            newComment={newComment}
            setNewComment={setNewComment}
            commentSaving={commentSaving}
            onUpdate={handleUpdate}
            onToggleStatus={toggleStatus}
            onDelete={deleteTask}
            onAddCheckItem={addChecklistItem}
            onToggleCheckItem={toggleChecklistItem}
            onDeleteCheckItem={deleteChecklistItem}
            onAddComment={addComment}
            onDeleteComment={deleteComment}
            onClose={() => setViewTaskId(null)}
            canContribute={canContribute}
            canManage={canManage}
            viewerUserId={proj.viewerUserId}
            togglingId={togglingId}
            deletingId={deletingId}
            checkItemSaving={checkItemSaving}
            deletingCheckId={deletingCheckId}
            deletingCommentId={deletingCommentId}
          />}
        </SheetContent>
      </Sheet>

      {/* Content: List or Board */}
      {viewMode === "list" ? (
        <TaskListView
          tasks={filtered}
          proj={proj}
          labels={labels}
          onToggle={toggleStatus}
          onDelete={deleteTask}
          onView={openViewDrawer}
          togglingId={togglingId}
          deletingId={deletingId}
          canContribute={canContribute}
          canManage={canManage}
        />
      ) : (
        <TaskBoardView
          tasks={filtered}
          statusFilter={statusFilter}
          proj={proj}
          labels={labels}
          onUpdate={handleUpdate}
          onView={openViewDrawer}
          canContribute={canContribute}
        />
      )}
      {confirmDialog}
    </div>
  );
}

// ── Task List View ──
function TaskListView({ tasks, proj, labels, onToggle, onDelete, onView, togglingId, deletingId, canContribute, canManage }: {
  tasks: TaskData[];
  proj: { color: string };
  labels: { id: string; name: string; color: string }[];
  onToggle: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onView: (task: TaskData) => void;
  togglingId: string | null;
  deletingId: string | null;
  canContribute: boolean;
  canManage: boolean;
}) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
        <CheckCircle2 className="mx-auto size-8 text-muted-foreground/30" />
        <p className="mt-2 text-sm text-muted-foreground">No tasks found</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden divide-y">
      {tasks.map((task) => {
        const overdue = isPastDue(task.dueDate) && task.status !== "done" && task.status !== "cancelled";
        const tsc = taskStatusConfig[task.status];
        const assignee = task.assignee;
        const team = task.team;
        const taskLabels = (task.labels || []).map(lid => labels.find(l => l.id === lid)).filter(Boolean);
        const checkDone = task.checklist?.filter(c => c.isCompleted).length || 0;
        const checkTotal = task.checklist?.length || 0;
        const commentCount = task.comments?.length || 0;

        return (
          <div
            key={task.id}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors group cursor-pointer"
            onClick={() => onView(task)}
          >
            <button onClick={(e) => { e.stopPropagation(); onToggle(task.id, task.status); }} disabled={!canContribute || togglingId === task.id} className="shrink-0">
              {togglingId === task.id ? (
                <Loader2 className="size-4 text-muted-foreground/40 animate-spin" />
              ) : task.status === "done" ? (
                <CheckCircle2 className="size-4 text-brand-500" />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground/40 hover:text-brand-400 transition-colors" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[13px] truncate", task.status === "done" && "line-through text-muted-foreground")}>
                  {task.title}
                </span>
                {taskLabels.map(l => l && (
                  <span key={l.id} className="size-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} title={l.name} />
                ))}
              </div>
              {task.description && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{task.description}</p>}
            </div>

            {checkTotal > 0 && (
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono tabular-nums flex items-center gap-0.5">
                <ListChecks className="size-2.5" />{checkDone}/{checkTotal}
              </span>
            )}

            {commentCount > 0 && (
              <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                <MessageSquare className="size-2.5" />{commentCount}
              </span>
            )}

            {team && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: team.color }} />
                {team.name}
              </span>
            )}

            {assignee && (
              <div className="size-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white shrink-0" style={{ backgroundColor: proj.color }} title={assignee.user.name || assignee.user.email}>
                {(assignee.user.name || assignee.user.email)[0].toUpperCase()}
              </div>
            )}

            {task.estimatedMinutes && (
              <span className="text-[10px] text-muted-foreground shrink-0 font-mono tabular-nums hidden sm:flex items-center gap-0.5">
                <Clock className="size-2.5" />{formatHours(task.estimatedMinutes)}
              </span>
            )}

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
            {canManage && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                disabled={deletingId === task.id}
                title="Delete task"
                className={cn("opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-600", deletingId === task.id && "opacity-100 pointer-events-none")}
              >
                {deletingId === task.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Board / Kanban View ──
const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"] as const;

function TaskBoardView({ tasks, statusFilter, proj, labels, onUpdate, onView, canContribute }: {
  tasks: TaskData[];
  statusFilter: string;
  proj: { color: string };
  labels: { id: string; name: string; color: string }[];
  onUpdate: (id: string, updates: Record<string, unknown>) => void;
  onView: (task: TaskData) => void;
  canContribute: boolean;
}) {
  // A status filter narrows the board to that column.
  const columns = statusFilter === "all" ? BOARD_COLUMNS : BOARD_COLUMNS.filter((c) => c === statusFilter);

  return (
    <div className={cn(
      "flex gap-3 min-h-[40vh] overflow-x-auto pb-2",
      statusFilter === "all" ? "lg:grid lg:grid-cols-6 lg:overflow-x-visible lg:pb-0" : "sm:grid sm:grid-cols-1"
    )}>
      {columns.map(col => {
        const tsc = taskStatusConfig[col];
        const colTasks = tasks.filter(t => t.status === col);
        return (
          <div
            key={col}
            className="rounded-lg border bg-muted/20 flex flex-col min-w-[200px] sm:min-w-0"
            onDragOver={(e) => { if (canContribute) e.preventDefault(); }}
            onDrop={(e) => {
              const taskId = e.dataTransfer.getData("taskId");
              if (taskId && canContribute) onUpdate(taskId, { status: col });
            }}
          >
            <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-card rounded-t-lg">
              <span className={cn("size-2 rounded-full", tsc.bar)} />
              <span className="text-[11px] font-semibold">{tsc.label}</span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground ml-auto">{colTasks.length}</span>
            </div>
            <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto">
              {colTasks.map(task => {
                const assignee = task.assignee;
                const taskLabels = (task.labels || []).map(lid => labels.find(l => l.id === lid)).filter(Boolean);
                const overdue = isPastDue(task.dueDate) && task.status !== "done" && task.status !== "cancelled";
                return (
                  <div
                    key={task.id}
                    draggable={canContribute}
                    onDragStart={(e) => e.dataTransfer.setData("taskId", task.id)}
                    className="rounded-md border bg-card p-2.5 cursor-pointer hover:shadow-sm transition-shadow"
                    onClick={() => onView(task)}
                  >
                    <p className="text-[12px] font-medium leading-snug mb-1">{task.title}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {taskLabels.map(l => l && (
                        <span key={l.id} className="flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded" style={{ backgroundColor: l.color + "20", color: l.color }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge variant="outline" className={cn("text-[8px] h-3.5 px-1", priorityConfig[task.priority]?.color)}>
                        {task.priority}
                      </Badge>
                      {task.dueDate && (
                        <span className={cn("text-[9px] tabular-nums", overdue ? "text-red-600" : "text-muted-foreground")}>
                          {formatDateShort(task.dueDate)}
                        </span>
                      )}
                      <span className="flex-1" />
                      {assignee && (
                        <div className="size-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white" style={{ backgroundColor: proj.color }} title={assignee.user.name || assignee.user.email}>
                          {(assignee.user.name || assignee.user.email)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Task Detail Drawer ──
function TaskDetailDrawer({
  task, editStatus, setEditStatus, editPriority, setEditPriority,
  editAssigneeId, setEditAssigneeId, editTeamId, setEditTeamId,
  members, teams, labels, newCheckItem, setNewCheckItem, newComment, setNewComment,
  commentSaving, onUpdate, onToggleStatus, onDelete, onAddCheckItem,
  onToggleCheckItem, onDeleteCheckItem, onAddComment, onDeleteComment, onClose,
  togglingId, deletingId, checkItemSaving, deletingCheckId, deletingCommentId,
  canContribute, canManage, viewerUserId,
}: {
  task: TaskData;
  editStatus: string; setEditStatus: (v: string) => void;
  editPriority: string; setEditPriority: (v: string) => void;
  editAssigneeId: string; setEditAssigneeId: (v: string) => void;
  editTeamId: string; setEditTeamId: (v: string) => void;
  members: { id: string; role: string; member: { id: string; role: string; user: { id: string; name: string | null; email: string; image: string | null } } }[];
  teams: { id: string; name: string; color: string }[];
  labels: { id: string; name: string; color: string }[];
  newCheckItem: string; setNewCheckItem: (v: string) => void;
  newComment: string; setNewComment: (v: string) => void;
  commentSaving: boolean;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<boolean>;
  onToggleStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onAddCheckItem: (taskId: string) => void;
  onToggleCheckItem: (taskId: string, itemId: string, completed: boolean) => void;
  onDeleteCheckItem: (taskId: string, itemId: string) => void;
  onAddComment: (taskId: string) => void;
  onDeleteComment: (taskId: string, commentId: string) => void;
  onClose: () => void;
  togglingId: string | null;
  deletingId: string | null;
  checkItemSaving: boolean;
  deletingCheckId: string | null;
  deletingCommentId: string | null;
  canContribute: boolean;
  canManage: boolean;
  viewerUserId: string;
}) {
  const overdue = isPastDue(task.dueDate) && task.status !== "done" && task.status !== "cancelled";
  // Inline editing of the task's details.
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [dTitle, setDTitle] = useState("");
  const [dDesc, setDDesc] = useState("");
  const [dStart, setDStart] = useState("");
  const [dDue, setDDue] = useState("");
  const [dEstimate, setDEstimate] = useState("");
  function startEditDetails() {
    setDTitle(task.title);
    setDDesc(task.description || "");
    setDStart(task.startDate || "");
    setDDue(task.dueDate || "");
    setDEstimate(task.estimatedMinutes ? String(Math.round((task.estimatedMinutes / 60) * 100) / 100) : "");
    setEditingDetails(true);
  }
  async function saveDetails() {
    if (!dTitle.trim()) return;
    setDetailsSaving(true);
    const ok = await onUpdate(task.id, {
      title: dTitle.trim(),
      description: dDesc.trim() || null,
      startDate: dStart || null,
      dueDate: dDue || null,
      estimatedMinutes: dEstimate ? Math.round(parseFloat(dEstimate) * 60) : null,
    });
    setDetailsSaving(false);
    if (ok) setEditingDetails(false);
  }
  const creator = task.createdBy;
  const checklist = task.checklist || [];
  const comments = task.comments || [];
  const taskLabels = (task.labels || []).map(lid => labels.find(l => l.id === lid)).filter(Boolean);
  const checkDone = checklist.filter(c => c.isCompleted).length;

  return (
    <>
      <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
        <div className="flex items-start gap-3">
          <button onClick={() => onToggleStatus(task.id, task.status)} disabled={!canContribute || togglingId === task.id} className="mt-0.5 shrink-0">
            {togglingId === task.id ? (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : task.status === "done" ? (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                <CheckCircle2 className="size-5" />
              </div>
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-brand-50 hover:text-brand-600 transition-colors">
                <CircleDashed className="size-5" />
              </div>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <SheetTitle className={cn("text-lg leading-snug", task.status === "done" && "line-through text-muted-foreground")}>
              {task.title}
            </SheetTitle>
            <SheetDescription className="mt-0.5">
              {creator ? `Created by ${creator.name || creator.email}` : "Task details"}
              {" · "}
              {new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </SheetDescription>
            {taskLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {taskLabels.map(l => l && (
                  <span key={l.id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border" style={{ borderColor: l.color + "40", backgroundColor: l.color + "10", color: l.color }}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
        {/* Classification */}
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} disabled={!canContribute} onValueChange={(v) => { setEditStatus(v); onUpdate(task.id, { status: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(taskStatusConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", cfg.bar)} />{cfg.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editPriority} disabled={!canContribute} onValueChange={(v) => { setEditPriority(v); onUpdate(task.id, { priority: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(priorityConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Details: title, description, dates, estimate */}
        <div className="h-px bg-border" />
        {editingDetails ? (
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edit details</p>
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={dTitle} onChange={e => setDTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={dDesc} onChange={e => setDDesc(e.target.value)} rows={4} placeholder="Task details..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <DatePicker value={dStart} onChange={setDStart} placeholder="Not set" />
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <DatePicker value={dDue} onChange={setDDue} placeholder="Not set" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Estimate (hours)</Label>
              <Input type="number" min={0} step="0.25" value={dEstimate} onChange={e => setDEstimate(e.target.value)} placeholder="e.g. 4" />
            </div>
            <div className="flex items-center justify-end gap-2">
              {(dStart || dDue) && (
                <Button variant="ghost" size="sm" className="mr-auto text-muted-foreground" onClick={() => { setDStart(""); setDDue(""); }}>Clear dates</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setEditingDetails(false)}>Cancel</Button>
              <Button size="sm" className="bg-brand-600 hover:bg-brand-700" onClick={saveDetails} disabled={detailsSaving || !dTitle.trim()}>
                {detailsSaving ? "Saving..." : "Save details"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
              {canContribute && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={startEditDetails}>
                  <Pencil className="size-3" />Edit details
                </Button>
              )}
            </div>
            {task.description ? (
              <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 p-4">{task.description}</p>
            ) : (
              <p className="text-[13px] text-muted-foreground/60">No description</p>
            )}
          </div>
        )}

        <div className="h-px bg-border" />

        {/* Assignment */}
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><User2 className="size-3" /> Assignee</Label>
              <Select value={editAssigneeId} disabled={!canContribute} onValueChange={(v) => { setEditAssigneeId(v); onUpdate(task.id, { assigneeId: v === "none" ? null : v }); }}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map(m => <SelectItem key={m.member.id} value={m.member.id}>{m.member.user.name || m.member.user.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Users className="size-3" /> Team</Label>
              <Select value={editTeamId} disabled={!canContribute} onValueChange={(v) => { setEditTeamId(v); onUpdate(task.id, { teamId: v === "none" ? null : v }); }}>
                <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No team</SelectItem>
                  {teams.map(t => <SelectItem key={t.id} value={t.id}><span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Schedule */}
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Schedule</p>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-muted-foreground flex items-center gap-2"><CalendarDays className="size-3.5" /> Due Date</span>
              {task.dueDate ? (
                <span className={cn("text-[13px] font-mono tabular-nums font-medium", overdue ? "text-red-600" : "")}>
                  {formatDate(task.dueDate)}
                  {overdue && <AlertCircle className="size-3.5 inline ml-1.5 text-red-500" />}
                </span>
              ) : <span className="text-[13px] text-muted-foreground/40">Not set</span>}
            </div>
            {task.startDate && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-muted-foreground flex items-center gap-2"><CalendarDays className="size-3.5" /> Start Date</span>
                <span className="text-[13px] font-mono tabular-nums">{formatDate(task.startDate)}</span>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-muted-foreground flex items-center gap-2"><Clock className="size-3.5" /> Estimate</span>
              <span className="text-[13px] font-mono tabular-nums">{task.estimatedMinutes ? formatHours(task.estimatedMinutes) : <span className="text-muted-foreground/40">Not set</span>}</span>
            </div>
            {task.completedAt && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-[13px] text-muted-foreground flex items-center gap-2"><CheckCircle2 className="size-3.5" /> Completed</span>
                <span className="text-[13px] font-mono tabular-nums">{new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Checklist */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ListChecks className="size-3.5" /> Checklist
              {checklist.length > 0 && <span className="text-muted-foreground/60 font-mono">({checkDone}/{checklist.length})</span>}
            </p>
          </div>
          {checklist.length > 0 && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${checklist.length > 0 ? (checkDone / checklist.length) * 100 : 0}%` }} />
            </div>
          )}
          <div className="space-y-1">
            {checklist.map(item => (
              <div key={item.id} className="flex items-center gap-2.5 py-1 group">
                <Checkbox
                  checked={item.isCompleted}
                  disabled={!canContribute}
                  onCheckedChange={(checked) => onToggleCheckItem(task.id, item.id, !!checked)}
                />
                <span className={cn("text-[13px] flex-1", item.isCompleted && "line-through text-muted-foreground")}>{item.title}</span>
                {canContribute && <button
                  onClick={() => onDeleteCheckItem(task.id, item.id)}
                  disabled={deletingCheckId === item.id}
                  className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity", deletingCheckId === item.id && "opacity-100 pointer-events-none")}
                >
                  {deletingCheckId === item.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </button>}
              </div>
            ))}
          </div>
          {canContribute && <div className="flex gap-2">
            <Input
              value={newCheckItem}
              onChange={e => setNewCheckItem(e.target.value)}
              placeholder="Add checklist item..."
              className="text-sm"
              onKeyDown={e => { if (e.key === "Enter") onAddCheckItem(task.id); }}
            />
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAddCheckItem(task.id)} disabled={!newCheckItem.trim() || checkItemSaving}>
              {checkItemSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </Button>
          </div>}
        </div>

        <div className="h-px bg-border" />

        {/* Comments */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MessageSquare className="size-3.5" /> Comments ({comments.length})
          </p>
          {canContribute && <div className="space-y-2">
            <Textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="text-sm min-h-[80px]"
              rows={3}
            />
            <Button
              size="sm"
              className="bg-brand-600 hover:bg-brand-700"
              onClick={() => onAddComment(task.id)}
              disabled={commentSaving || !newComment.trim()}
            >
              <Send className="size-3.5" />{commentSaving ? "Posting..." : "Post Comment"}
            </Button>
          </div>}
          {comments.length > 0 && (
            <div className="space-y-2 pt-3 border-t">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg bg-muted/30 p-3.5 group">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium">{c.author.name || c.author.email}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {(canManage || c.author.id === viewerUserId) && <button
                        onClick={() => onDeleteComment(task.id, c.id)}
                        disabled={deletingCommentId === c.id}
                        className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity", deletingCommentId === c.id && "opacity-100 pointer-events-none")}
                      >
                        {deletingCommentId === c.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                      </button>}
                    </div>
                  </div>
                  <p className="text-[13px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
        {canManage ? (
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(task.id)} disabled={deletingId === task.id}>
            {deletingId === task.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}{deletingId === task.id ? "Deleting..." : "Delete"}
          </Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canContribute && (
            <Button className="bg-brand-600 hover:bg-brand-700" onClick={() => { onToggleStatus(task.id, task.status); onClose(); }} disabled={togglingId === task.id}>
              {togglingId === task.id ? "Saving..." : task.status === "done" ? "Reopen Task" : "Mark Done"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
