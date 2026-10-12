"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Files, FolderUp, Inbox, Lock, Paperclip, RotateCw, Search, Star, Trash2, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecordPicker } from "@/components/dashboard/documents/file-actions";
import { cn } from "@/lib/utils";
import type { BrowseFolder, BrowseView } from "./api";
import { FileGlyph, FolderGlyph, formatBytes } from "./glyphs";
import { Kbd } from "./parts";
import { refresh } from "./store";
import { cancelAll, cancelUpload, clearFinished, retryUpload, useUploads } from "./uploads";

/* ------------------------------------------------------------------ */
/*  Upload queue                                                        */
/* ------------------------------------------------------------------ */

export function UploadPanel() {
  const items = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  const active = items.filter((i) => i.status === "uploading" || i.status === "queued");
  const failed = items.filter((i) => i.status === "failed");
  const done = items.filter((i) => i.status === "done");
  const shown = items.filter((i) => i.status !== "cancelled");
  const bytes = active.reduce((s, i) => s + i.size, 0);
  const sent = active.reduce((s, i) => s + i.size * i.progress, 0);
  const pct = bytes ? sent / bytes : 1;

  const title = active.length
    ? `Uploading ${active.length} ${active.length === 1 ? "file" : "files"}`
    : failed.length
      ? `${failed.length} ${failed.length === 1 ? "upload" : "uploads"} failed`
      : `${done.length} ${done.length === 1 ? "upload" : "uploads"} complete`;

  return (
    <AnimatePresence>
      {shown.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute bottom-4 left-4 z-30 w-[min(340px,calc(100%-2rem))] overflow-hidden rounded-xl border border-border/80 bg-popover shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex h-11 items-center gap-2 pl-3.5 pr-1.5">
            {active.length ? (
              <span className="relative size-4">
                <svg viewBox="0 0 20 20" className="size-4 -rotate-90">
                  <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" className="stroke-foreground/10" />
                  <circle cx="10" cy="10" r="8" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-foreground transition-[stroke-dashoffset] duration-300" strokeDasharray={50.3} strokeDashoffset={50.3 * (1 - pct)} />
                </svg>
              </span>
            ) : failed.length ? (
              <AlertCircle className="size-4 text-red-500" />
            ) : (
              <CheckCircle2 className="size-4 text-emerald-500" />
            )}
            <p className="flex-1 truncate text-[13px] font-medium">{title}</p>
            {active.length > 0 && <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">{Math.round(pct * 100)}%</span>}
            <button type="button" aria-label={collapsed ? "Expand" : "Collapse"} onClick={() => setCollapsed((c) => !c)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
              <ChevronDown className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            </button>
            <button
              type="button"
              aria-label={active.length ? "Cancel all" : "Close"}
              title={active.length ? "Cancel all" : "Close"}
              onClick={() => (active.length ? cancelAll() : clearFinished())}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          {!collapsed && (
            <div className="max-h-64 overflow-y-auto border-t border-border/60 py-1">
              {shown.map((i) => (
                <div key={i.id} className="group flex items-center gap-2.5 px-3.5 py-1.5">
                  <FileGlyph mime={i.mime} name={i.name} size={22} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">{i.name}</p>
                    {i.status === "uploading" ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div className="h-full rounded-full bg-foreground transition-[width] duration-200" style={{ width: `${Math.max(3, i.progress * 100)}%` }} />
                      </div>
                    ) : (
                      <p className={cn("truncate text-[11.5px]", i.status === "failed" ? "text-red-600" : "text-muted-foreground")}>
                        {i.status === "failed" ? i.error : i.status === "queued" ? "Waiting…" : `${formatBytes(i.size)}${i.folderName ? ` · ${i.folderName}` : ""}`}
                      </p>
                    )}
                  </div>
                  {i.status === "done" && <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />}
                  {i.status === "failed" && (
                    <button type="button" title="Try again" aria-label="Try again" onClick={() => retryUpload(i.id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
                      <RotateCw className="size-3.5" />
                    </button>
                  )}
                  {(i.status === "uploading" || i.status === "queued") && (
                    <button type="button" title="Cancel" aria-label="Cancel upload" onClick={() => cancelUpload(i.id)} className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-foreground/[0.05] hover:text-foreground group-hover:opacity-100">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Dropping files in from the computer                                 */
/* ------------------------------------------------------------------ */

export function DropOverlay({ show, target }: { show: boolean; target: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="pointer-events-none absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-foreground/25 bg-foreground/[0.015]"
        >
          <motion.div
            initial={{ y: 12, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="absolute bottom-6 left-1/2 flex items-center gap-3.5 rounded-xl border border-border/80 bg-popover py-3 pl-3.5 pr-5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)]"
          >
            <motion.span animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }} className="flex size-10 items-center justify-center rounded-lg bg-foreground text-background">
              <Upload className="size-4.5" />
            </motion.span>
            <span>
              <span className="block text-[14px] font-semibold tracking-[-0.01em]">
                Drop to upload into <span className="underline decoration-foreground/25 underline-offset-2">{target}</span>
              </span>
              <span className="block text-[12px] text-muted-foreground">Drop on a folder to put them there instead. Folders keep their structure.</span>
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty views                                                         */
/* ------------------------------------------------------------------ */

const EMPTY: Record<BrowseView | "root" | "filtered", { icon: typeof Files; title: string; body: string }> = {
  root: { icon: Files, title: "Your file library", body: "Drop receipts, contracts and statements here, or upload them. Make folders to keep them tidy, then attach files to the records they belong to." },
  folder: { icon: Files, title: "This folder is empty", body: "Drop files here, or upload them from your computer." },
  recent: { icon: Clock, title: "Nothing new", body: "Files added in the last 30 days show up here." },
  starred: { icon: Star, title: "No starred files", body: "Star the files you open often. Right-click a file and choose Star, or drag it onto Starred." },
  unlinked: { icon: Inbox, title: "Everything is filed", body: "Every file is attached to a record. Files uploaded to Tilly or here that aren't attached yet will show up in this list." },
  linked: { icon: Paperclip, title: "Nothing attached yet", body: "Attach receipts and invoices to bills, expenses or transactions and they'll be listed here." },
  private: { icon: Lock, title: "No private files", body: "Files only you can see show up here. Make a file private from its menu, or drag your own files onto Only me." },
  trash: { icon: Trash2, title: "Trash is empty", body: "Deleted files stay here for 30 days, so you can bring them back." },
  record: { icon: Paperclip, title: "Nothing attached", body: "No files are attached to this kind of record yet." },
  search: { icon: Search, title: "No matches", body: "No file or folder names match your search." },
  filtered: { icon: Files, title: "Nothing of this kind here", body: "Try another filter." },
};

export function EmptyState({ kind, onUpload, onNewFolder }: { kind: keyof typeof EMPTY; onUpload?: () => void; onNewFolder?: () => void }) {
  const e = EMPTY[kind];
  const Icon = e.icon;
  const canAdd = kind === "root" || kind === "folder";
  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      {canAdd ? (
        <div className="relative mb-5 h-20 w-28">
          <span className="absolute left-2 top-4 -rotate-12"><FileGlyph mime="application/pdf" name="a.pdf" size={52} /></span>
          <span className="absolute right-2 top-4 rotate-12"><FileGlyph mime="image/jpeg" name="a.jpg" size={52} /></span>
          <span className="absolute left-1/2 top-0 -translate-x-1/2"><FolderGlyph size={60} /></span>
        </div>
      ) : (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-foreground/[0.045]">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-[15px] font-semibold tracking-[-0.01em]">{e.title}</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{e.body}</p>
      {canAdd && (
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onUpload} className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3.5 text-[13px] font-medium text-background hover:opacity-90">
            <Upload className="size-4" /> Upload files
          </button>
          <button type="button" onClick={onNewFolder} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border/80 px-3.5 text-[13px] font-medium hover:bg-foreground/[0.03]">
            <FolderUp className="size-4" /> New folder
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialogs                                                             */
/* ------------------------------------------------------------------ */

export function AttachDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[420px]">
        <DialogHeader className="px-4 pb-3 pt-4">
          <DialogTitle className="text-[15px]">Attach to a record</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {ids && ids.length > 1 ? `All ${ids.length} files will show up on the record you pick.` : "The file will show up on the record you pick."}
          </DialogDescription>
        </DialogHeader>
        <div className="border-t border-border/60">
          {ids && (
            <RecordPicker
              documentIds={ids}
              onDone={() => {
                onClose();
                refresh();
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Preview", ["Space"]],
  ["Open", ["↵"]],
  ["Move around", ["↑", "↓", "←", "→"]],
  ["Select more", ["⇧", "↑↓"]],
  ["Select all", ["⌘", "A"]],
  ["Rename", ["F2"]],
  ["Move to Trash", ["⌫"]],
  ["Cut, then paste into another folder", ["⌘", "X"]],
  ["Undo", ["⌘", "Z"]],
  ["Star", ["S"]],
  ["New folder", ["⇧", "N"]],
  ["Upload files", ["U"]],
  ["Search", ["/"]],
  ["Grid or list", ["V"]],
  ["Details", ["I"]],
  ["Up a folder", ["⌫", "or", "⌘", "↑"]],
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-[12.5px]">Type a name to jump to it.</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/50">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between py-1.5 text-[13px]">
              <span className="text-foreground/80">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k, i) => (k === "or" ? <span key={i} className="px-0.5 text-[11px] text-muted-foreground">or</span> : <Kbd key={i}>{k}</Kbd>))}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Folder targets for "Move to", indented like the tree. */
export function moveTargets(folders: BrowseFolder[], children: Map<string | null, BrowseFolder[]>) {
  const out: { folder: BrowseFolder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of children.get(parent) ?? []) {
      out.push({ folder: f, depth });
      if (depth < 8) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out.length ? out : folders.map((folder) => ({ folder, depth: 0 }));
}
