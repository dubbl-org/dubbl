"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Trash2,
  StickyNote,
  Pin,
  PinOff,
  Loader2,
  Search,
  X,
  Pencil,
  Check,
  User,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProject, type NoteData } from "../project-context";

export default function NotesPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("all");
  const [filterPinned, setFilterPinned] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");

  if (!proj) return null;

  const notes = proj.notes;

  // Unique authors
  const uniqueAuthors = Array.from(
    new Map(notes.map(n => [n.author.email, n.author])).values()
  );

  // Apply filters
  const filteredNotes = notes.filter(n => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!n.content.toLowerCase().includes(q) && !(n.author.name || n.author.email).toLowerCase().includes(q)) return false;
    }
    if (filterAuthor !== "all" && n.author.email !== filterAuthor) return false;
    if (filterPinned === "pinned" && !n.isPinned) return false;
    if (filterPinned === "unpinned" && n.isPinned) return false;
    return true;
  });

  // Sort
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    // Pinned always first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    const da = new Date(a.createdAt).getTime();
    const db = new Date(b.createdAt).getTime();
    return sortBy === "newest" ? db - da : da - db;
  });

  const hasActiveFilters = searchQuery !== "" || filterAuthor !== "all" || filterPinned !== "all";

  function clearFilters() {
    setSearchQuery("");
    setFilterAuthor("all");
    setFilterPinned("all");
  }

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
      refresh();
    } catch { toast.error("Failed to add note"); }
    finally { setSaving(false); }
  }

  async function deleteNote(noteId: string) {
    if (!orgId || deletingId) return;
    setDeletingId(noteId);
    try {
      await fetch(`/api/v1/projects/${projectId}/notes?noteId=${noteId}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      toast.success("Note deleted");
      refresh();
    } catch { toast.error("Failed to delete note"); }
    finally { setDeletingId(null); }
  }

  async function togglePin(note: NoteData) {
    if (!orgId) return;
    setTogglingPinId(note.id);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/notes?noteId=${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ isPinned: !note.isPinned }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(note.isPinned ? "Note unpinned" : "Note pinned");
      refresh();
    } catch { toast.error("Failed to update note"); }
    finally { setTogglingPinId(null); }
  }

  function startEdit(note: NoteData) {
    setEditingId(note.id);
    setEditContent(note.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  async function saveEdit() {
    if (!orgId || !editingId || !editContent.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/notes?noteId=${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Note updated");
      setEditingId(null);
      setEditContent("");
      refresh();
    } catch { toast.error("Failed to update note"); }
    finally { setEditSaving(false); }
  }

  const pinnedCount = notes.filter(n => n.isPinned).length;

  return (
    <div className="space-y-4">
      {/* Compose */}
      <div className="rounded-xl border bg-card p-4">
        <Textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write a note..."
          rows={3}
          className="resize-none border-0 p-0 focus-visible:ring-0 shadow-none text-[13px]"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && content.trim()) handleAdd();
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">
            Ctrl+Enter to submit
          </span>
          <Button size="sm" onClick={handleAdd} disabled={saving || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs">
            {saving ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </div>

      {/* Stats + Filter bar */}
      {notes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
                {hasActiveFilters && (
                  <span className="ml-1.5 text-muted-foreground/60">
                    ({sortedNotes.length} of {notes.length})
                  </span>
                )}
              </p>
              {pinnedCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-amber-600">
                  <Pin className="size-2.5" />{pinnedCount} pinned
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={v => setSortBy(v as "newest" | "oldest")}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-[280px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="h-7 text-xs pl-8"
              />
            </div>

            {uniqueAuthors.length > 1 && (
              <Select value={filterAuthor} onValueChange={setFilterAuthor}>
                <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[120px]", filterAuthor !== "all" && "border-blue-300 bg-blue-50/50")}>
                  <SelectValue placeholder="Author" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All authors</SelectItem>
                  {uniqueAuthors.map(a => (
                    <SelectItem key={a.email} value={a.email}>{a.name || a.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filterPinned} onValueChange={setFilterPinned}>
              <SelectTrigger className={cn("h-7 text-xs w-auto min-w-[110px]", filterPinned !== "all" && "border-blue-300 bg-blue-50/50")}>
                <SelectValue placeholder="Pin status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All notes</SelectItem>
                <SelectItem value="pinned">Pinned only</SelectItem>
                <SelectItem value="unpinned">Unpinned only</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2" onClick={clearFilters}>
                <X className="size-3 mr-1" />Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <StickyNote className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Write your first note above to get started.</p>
        </div>
      ) : sortedNotes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Search className="mx-auto size-6 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No notes match your filters</p>
          <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isEditing={editingId === note.id}
              editContent={editContent}
              editSaving={editSaving}
              onEditContentChange={setEditContent}
              onStartEdit={() => startEdit(note)}
              onCancelEdit={cancelEdit}
              onSaveEdit={saveEdit}
              onDelete={() => deleteNote(note.id)}
              onTogglePin={() => togglePin(note)}
              deleting={deletingId === note.id}
              togglingPin={togglingPinId === note.id}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  isEditing,
  editContent,
  editSaving,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onTogglePin,
  deleting,
  togglingPin,
  searchQuery,
}: {
  note: NoteData;
  isEditing: boolean;
  editContent: string;
  editSaving: boolean;
  onEditContentChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  deleting: boolean;
  togglingPin: boolean;
  searchQuery: string;
}) {
  return (
    <div className={cn(
      "rounded-lg border bg-card p-4 group transition-colors",
      note.isPinned && "border-amber-300 bg-amber-50/50 dark:border-amber-200/30 dark:bg-amber-950/20",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {note.isPinned && <Pin className="size-3 text-amber-500" />}
          <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5">
            <User className="size-2.5 text-muted-foreground/60" />
            <span className="text-[11px] font-medium">{note.author.name || note.author.email}</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="size-2.5" />
            {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            <span className="text-muted-foreground/50 ml-0.5">
              {new Date(note.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onTogglePin}
            disabled={togglingPin}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              note.isPinned
                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                : "text-muted-foreground hover:text-amber-500 hover:bg-amber-50",
            )}
            title={note.isPinned ? "Unpin" : "Pin"}
          >
            {togglingPin ? <Loader2 className="size-3 animate-spin" /> : note.isPinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
          </button>
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Edit"
            >
              <Pencil className="size-3" />
            </button>
          )}
          <button
            onClick={onDelete}
            disabled={deleting}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Delete"
          >
            {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          </button>
        </div>
      </div>

      {/* Content */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editContent}
            onChange={e => onEditContentChange(e.target.value)}
            rows={4}
            className="text-[13px] resize-none"
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && editContent.trim()) onSaveEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Ctrl+Enter to save, Esc to cancel
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelEdit}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={onSaveEdit}
                disabled={editSaving || !editContent.trim()}
              >
                {editSaving ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-muted-foreground">
          {searchQuery ? highlightText(note.content, searchQuery) : note.content}
        </p>
      )}
    </div>
  );
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200/60 text-foreground rounded-sm px-0.5">{part}</mark>
    ) : part
  );
}
