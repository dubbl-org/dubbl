"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, StickyNote, Pin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useProject } from "../project-context";

export default function NotesPage() {
  const { project: proj, orgId, projectId, refresh } = useProject();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!proj) return null;

  const notes = proj.notes;
  const pinnedNotes = notes.filter(n => n.isPinned);
  const unpinnedNotes = notes.filter(n => !n.isPinned);

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
      await fetch(`/api/v1/projects/${projectId}/notes?noteId=${noteId}`, { method: "DELETE", headers: { "x-organization-id": orgId } });
      refresh();
    } finally { setDeletingId(null); }
  }

  return (
    <div className="space-y-4">
      {/* Compose */}
      <div className="rounded-lg border bg-card p-4">
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write a note..." rows={3} className="resize-none border-0 p-0 focus-visible:ring-0 shadow-none text-[13px]" />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handleAdd} disabled={saving || !content.trim()} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs">
            {saving ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center min-h-[30vh] flex flex-col items-center justify-center">
          <StickyNote className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Pinned first */}
          {pinnedNotes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={deleteNote} deleting={deletingId === note.id} />
          ))}
          {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
            <div className="h-px bg-border" />
          )}
          {unpinnedNotes.map((note) => (
            <NoteCard key={note.id} note={note} onDelete={deleteNote} deleting={deletingId === note.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, onDelete, deleting }: { note: { id: string; content: string; isPinned: boolean; createdAt: string; author: { name: string | null; email: string } }; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3.5 group", note.isPinned && "border-amber-200 bg-amber-50/30")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {note.isPinned && <Pin className="size-2.5 text-amber-500" />}
            <span className="text-[11px] font-medium">{note.author.name || note.author.email}</span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(note.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <p className="text-[13px] whitespace-pre-wrap leading-relaxed text-muted-foreground">{note.content}</p>
        </div>
        <button onClick={() => onDelete(note.id)} disabled={deleting} className={cn("opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600 transition-opacity shrink-0 mt-1", deleting && "opacity-50 pointer-events-none")}>
          {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </button>
      </div>
    </div>
  );
}
