"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface PipelineStage {
  id: string;
  name: string;
  color: string;
}

interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
  isDefault: boolean;
}

const PRESET_COLORS = [
  "#94a3b8", "#64748b", "#6b7280",
  "#ef4444", "#f97316", "#f59e0b",
  "#84cc16", "#22c55e", "#10b981",
  "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e",
];

const DEFAULT_NEW_STAGES: PipelineStage[] = [
  { id: "lead", name: "Lead", color: "#94a3b8" },
  { id: "qualified", name: "Qualified", color: "#3b82f6" },
  { id: "proposal", name: "Proposal", color: "#8b5cf6" },
  { id: "negotiation", name: "Negotiation", color: "#f59e0b" },
  { id: "closed_won", name: "Won", color: "#10b981" },
  { id: "closed_lost", name: "Lost", color: "#ef4444" },
];

function generateId() {
  return `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Sortable stage row
// ---------------------------------------------------------------------------
function SortableStageRow({
  stage,
  total,
  onUpdate,
  onRemove,
}: {
  stage: PipelineStage;
  total: number;
  onUpdate: (s: PipelineStage) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [showColors, setShowColors] = useState(false);

  function save() {
    if (!name.trim()) return;
    onUpdate({ ...stage, name: name.trim() });
    setEditing(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 group",
        isDragging && "shadow-lg ring-2 ring-primary/20 opacity-95"
      )}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="touch-none text-muted-foreground/40 hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Color picker */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowColors(!showColors)}
          className="size-6 rounded-full border-2 border-background ring-1 ring-border shrink-0 transition-transform hover:scale-110"
          style={{ backgroundColor: stage.color }}
        />
        {showColors && (
          <div className="absolute top-8 left-0 z-50 grid grid-cols-5 gap-1 rounded-lg border bg-popover p-2 shadow-lg">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onUpdate({ ...stage, color: c });
                  setShowColors(false);
                }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  c === stage.color ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name */}
      {editing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(stage.name); setEditing(false); } }}
            className="h-7 text-sm flex-1"
            autoFocus
          />
          <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={save}>
            <Check className="size-3.5 text-emerald-600" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={() => { setName(stage.name); setEditing(false); }}>
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{stage.name}</span>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button type="button" variant="ghost" size="sm" className="size-7 p-0" onClick={() => { setName(stage.name); setEditing(true); }}>
            <Pencil className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0 text-destructive"
            onClick={onRemove}
            disabled={total <= 1}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pipeline editor sheet
// ---------------------------------------------------------------------------
function PipelineEditor({
  open,
  onOpenChange,
  pipeline,
  onSaved,
  orgId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipeline: Pipeline | null;
  onSaved: () => void;
  orgId: string | null;
}) {
  const isNew = !pipeline;
  const [name, setName] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (open) {
      if (pipeline) {
        setName(pipeline.name);
        setStages([...pipeline.stages]);
        setIsDefault(pipeline.isDefault);
      } else {
        setName("");
        setStages([...DEFAULT_NEW_STAGES]);
        setIsDefault(false);
      }
      setDirty(false);
    }
  }, [open, pipeline]);

  function handleClose() {
    if (dirty && !window.confirm("You have unsaved changes. Discard?")) return;
    onOpenChange(false);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStages((prev) => {
        const oldIdx = prev.findIndex((s) => s.id === active.id);
        const newIdx = prev.findIndex((s) => s.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
      setDirty(true);
    }
  }

  function updateStage(id: string, s: PipelineStage) {
    setStages((prev) => prev.map((p) => (p.id === id ? s : p)));
    setDirty(true);
  }

  function removeStage(id: string) {
    setStages((prev) => prev.filter((p) => p.id !== id));
    setDirty(true);
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { id: generateId(), name: "New Stage", color: PRESET_COLORS[prev.length % PRESET_COLORS.length] },
    ]);
    setDirty(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !name.trim() || stages.length === 0 || saving) return;
    setSaving(true);

    const url = isNew ? "/api/v1/crm/pipelines" : `/api/v1/crm/pipelines/${pipeline.id}`;
    const method = isNew ? "POST" : "PATCH";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name: name.trim(), stages, isDefault }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save pipeline");
      }
      toast.success(isNew ? "Pipeline created" : "Pipeline updated");
      setDirty(false);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v ? handleClose() : onOpenChange(v)}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
          <div>
            <SheetTitle className="text-lg">{isNew ? "New Pipeline" : "Edit Pipeline"}</SheetTitle>
            <SheetDescription>
              {isNew ? "Create a pipeline with custom stages for your deals." : "Update stages, reorder, or change colors."}
            </SheetDescription>
          </div>
        </SheetHeader>
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
            {/* Pipeline name */}
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline</p>
              <div className="space-y-2">
                <Label htmlFor="pipeline-name">Name *</Label>
                <Input
                  id="pipeline-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setDirty(true); }}
                  placeholder="e.g. Sales Pipeline"
                  required
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => { setIsDefault(e.target.checked); setDirty(true); }}
                  className="size-4 rounded border-border accent-emerald-600"
                />
                <span className="text-sm">Set as default pipeline</span>
              </label>
            </div>

            <div className="h-px bg-border" />

            {/* Stages */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stages ({stages.length})
                </p>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addStage}>
                  <Plus className="size-3" /> Add Stage
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Deals move through stages from top to bottom. Click the color to change it, or use the arrows to reorder.
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {stages.map((stage) => (
                      <SortableStageRow
                        key={stage.id}
                        stage={stage}
                        total={stages.length}
                        onUpdate={(s) => updateStage(stage.id, s)}
                        onRemove={() => removeStage(stage.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {stages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Add at least one stage to create this pipeline.
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim() || stages.length === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving..." : isNew ? "Create Pipeline" : "Save Changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function PipelinesSettingsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchPipelines = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/crm/pipelines", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setPipelines(data.pipelines || []);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  function handleEdit(p: Pipeline) {
    setEditingPipeline(p);
    setEditorOpen(true);
  }

  function handleNew() {
    setEditingPipeline(null);
    setEditorOpen(true);
  }

  async function handleDelete(p: Pipeline) {
    await confirm({
      title: `Delete "${p.name}"?`,
      description: "This pipeline will be removed. Existing deals will not be deleted but will lose their pipeline reference.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        if (!orgId) return;
        await fetch(`/api/v1/crm/pipelines/${p.id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        await fetchPipelines();
        toast.success("Pipeline deleted");
      },
    });
  }

  async function handleSetDefault(p: Pipeline) {
    if (!orgId || p.isDefault) return;
    try {
      await fetch(`/api/v1/crm/pipelines/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ isDefault: true }),
      });
      await fetchPipelines();
      toast.success(`"${p.name}" set as default`);
    } catch {
      toast.error("Failed to update default pipeline");
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Sales Pipelines</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your deal pipelines and customize stages.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleNew}>
          <Plus className="size-3" /> New Pipeline
        </Button>
      </div>

      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border bg-card">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted mb-3">
            <Plus className="size-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium">No pipelines yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Create your first pipeline to start tracking deals through custom stages.
          </p>
          <Button size="sm" className="mt-4 bg-emerald-600 hover:bg-emerald-700" onClick={handleNew}>
            Create Pipeline
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pipelines.map((p) => (
            <div key={p.id} className="rounded-xl border bg-card overflow-hidden">
              {/* Pipeline header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{p.name}</span>
                    {p.isDefault && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] dark:bg-emerald-900/60 dark:text-emerald-400">
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {p.stages.length} stage{p.stages.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!p.isDefault && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleSetDefault(p)}>
                      <Star className="size-3" /> Set Default
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleEdit(p)}>
                    <Pencil className="size-3" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleDelete(p)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>

              {/* Stage flow preview */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {p.stages.map((stage, i) => (
                    <div key={stage.id} className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                        <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                        <span className="text-xs font-medium whitespace-nowrap">{stage.name}</span>
                      </div>
                      {i < p.stages.length - 1 && (
                        <span className="text-muted-foreground/30 text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PipelineEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        pipeline={editingPipeline}
        onSaved={fetchPipelines}
        orgId={orgId}
      />

      {confirmDialog}
    </ContentReveal>
  );
}
