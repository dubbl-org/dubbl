"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CircleDashed } from "lucide-react";
import {
  useProject,
  priorityConfig,
  taskStatusConfig,
  formatDateShort,
} from "../project-context";

export default function TasksPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("medium");
  const [taskStatus, setTaskStatus] = useState("todo");
  const [assigneeId, setAssigneeId] = useState("none");
  const [dueDate, setDueDate] = useState("");

  if (!proj) return null;

  const tasks = proj.tasks;
  const members = proj.members;
  const filtered = statusFilter === "all" ? tasks : tasks.filter(t => t.status === statusFilter);

  const tasksByStatus = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
          assigneeId: assigneeId === "none" ? null : assigneeId,
          dueDate: dueDate || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create task");
      toast.success("Task created");
      setAddOpen(false);
      setTitle(""); setDesc(""); setPriority("medium"); setTaskStatus("todo"); setAssigneeId("none"); setDueDate("");
      refresh();
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
    refresh();
  }

  async function deleteTask(taskId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    refresh();
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
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
      </div>

      <div className="flex items-center justify-between gap-3">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs">All ({tasks.length})</TabsTrigger>
            <TabsTrigger value="todo" className="text-xs">To Do</TabsTrigger>
            <TabsTrigger value="in_progress" className="text-xs">In Progress</TabsTrigger>
            <TabsTrigger value="in_review" className="text-xs">Review</TabsTrigger>
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
                <Label className="text-xs">Title *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Details..." rows={2} />
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
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
                  <Label className="text-xs">Status</Label>
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
                  <Label className="text-xs">Assignee</Label>
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Due Date</Label>
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
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <CheckCircle2 className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No tasks found</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden divide-y">
          {filtered.map((task) => {
            const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
            const tsc = taskStatusConfig[task.status];
            const assignee = members.find(m => m.member.id === task.assigneeId);
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
                  <span className={cn("text-[13px] truncate block", task.status === "done" && "line-through text-muted-foreground")}>
                    {task.title}
                  </span>
                  {task.description && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{task.description}</p>}
                </div>
                {assignee && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{assignee.member.user.name?.split(" ")[0] || assignee.member.user.email}</span>
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
