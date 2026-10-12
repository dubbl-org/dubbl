"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { Eye, FolderOpen, Loader2, Paperclip, RotateCcw, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileGlyph, formatBytes, KIND_LABEL, kindOf } from "@/components/dashboard/documents/browser/glyphs";
import { cn } from "@/lib/utils";

/**
 * Attachments
 * ===========
 * Attach any number of receipts / invoices / contracts to a record (a bank
 * transaction, an expense, an invoice…) through the shared document library.
 * Files can be dropped (several at once), browsed, pasted from the clipboard
 * or picked from files already in Documents. Each upload shows its progress,
 * a failed upload is cleaned up and can be retried, and the list shows what's
 * attached with view / remove. Used everywhere a record takes attachments so
 * the behaviour is identical: categorize, match, transfer and split drawers,
 * the transaction rows, the reconcile screen, invoices and bills.
 */

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

interface Pending {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
}

const PARALLEL = 3;
const CHANGED = "dubbl:attachments-changed";

type ChangedDetail = { entityType: string; entityId: string; count: number };

const activeOrg = (orgId?: string | null) =>
  orgId ?? (typeof window === "undefined" ? null : localStorage.getItem("activeOrgId"));

const orgHeaders = (orgId: string, json = false): Record<string, string> => ({
  "x-organization-id": orgId,
  ...(json ? { "content-type": "application/json" } : {}),
});

const mimeOf = (f: File) => f.type || "application/octet-stream";

/** Tell every attachment count on screen (row paperclips…) about a change. */
function announce(detail: ChangedDetail) {
  window.dispatchEvent(new CustomEvent<ChangedDetail>(CHANGED, { detail }));
}

/** Live attachment count for a record, kept in sync with any open panel. */
function useAttachmentCount(entityType: string, entityId: string | null, initial: number) {
  const [count, setCount] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setCount(initial);
  }
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ChangedDetail>).detail;
      if (d.entityType === entityType && d.entityId === entityId) setCount(d.count);
    };
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, [entityType, entityId]);
  return count;
}

// Only the most recently opened panel takes pasted files, so a drawer opened
// over a page with its own panel doesn't upload the clipboard twice.
const pasteStack: string[] = [];

function filesFromClipboard(e: ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (!f) continue;
    // Screenshots arrive as "image.png" — give them a findable name
    const name =
      f.name && f.name !== "image.png"
        ? f.name
        : `Pasted ${new Date().toISOString().slice(0, 19).replace("T", " ").replace(/:/g, ".")}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    out.push(name === f.name ? f : new File([f], name, { type: f.type }));
  }
  return out;
}

export function ReceiptAttachments({
  orgId: orgIdProp,
  entityType,
  entityId,
  label = "Attachments",
  hint = "Receipts, invoices or anything that backs this up",
  initialFiles,
  compact = false,
  className,
}: {
  orgId?: string | null;
  entityType: string;
  entityId: string | null;
  label?: string;
  hint?: string;
  /** Files to upload as soon as the panel opens (e.g. dropped on a row). */
  initialFiles?: File[] | null;
  /** Tighter layout for popovers. */
  compact?: boolean;
  className?: string;
}) {
  const orgId = activeOrg(orgIdProp);
  const [docs, setDocs] = useState<Attachment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const panelId = useId();
  const queue = useRef<Pending[]>([]);
  const running = useRef(0);
  const docsRef = useRef<Attachment[]>([]);

  const commit = useCallback(
    (next: Attachment[]) => {
      docsRef.current = next;
      setDocs(next);
      if (entityId) announce({ entityType, entityId, count: next.length });
    },
    [entityType, entityId]
  );

  const load = useCallback(async () => {
    if (!orgId || !entityId) return;
    try {
      const res = await fetch(
        `/api/v1/documents?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}&limit=100`,
        { headers: orgHeaders(orgId) }
      );
      const data = await res.json();
      const list: Attachment[] = (data.data ?? []).map((d: Attachment) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
      }));
      commit(list);
    } catch {
      // leave the list as-is
    } finally {
      setLoaded(true);
    }
  }, [orgId, entityType, entityId, commit]);

  useEffect(() => {
    docsRef.current = [];
    queue.current = [];
    setDocs([]);
    setPending([]);
    setLoaded(false);
    load();
  }, [load]);

  const patchPending = (key: string, patch: Partial<Pending>) =>
    setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const uploadOne = useCallback(
    async (item: Pending) => {
      if (!orgId || !entityId) return;
      let documentId: string | null = null;
      try {
        const res = await fetch("/api/v1/documents", {
          method: "POST",
          headers: orgHeaders(orgId, true),
          body: JSON.stringify({
            fileName: item.file.name,
            fileSize: Math.max(1, item.file.size),
            mimeType: mimeOf(item.file),
            entityType,
            entityId,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          uploadUrl?: string;
          document?: Attachment;
        };
        if (!res.ok || !data.uploadUrl || !data.document) {
          throw new Error(data.error || (res.status === 503 ? "File storage isn't set up" : "Couldn't start the upload"));
        }
        documentId = data.document.id;
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", data.uploadUrl!);
          xhr.setRequestHeader("content-type", mimeOf(item.file));
          xhr.upload.onprogress = (e) => e.lengthComputable && patchPending(item.key, { progress: e.loaded / e.total });
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the file (${xhr.status})`));
          xhr.onerror = () => reject(new Error("Network error while uploading"));
          xhr.send(item.file);
        });
        const doc = data.document;
        setPending((p) => p.filter((x) => x.key !== item.key));
        commit([
          ...docsRef.current,
          { id: doc.id, fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize },
        ]);
      } catch (err) {
        // The library row exists but the bytes don't: take it back out
        if (documentId) {
          const ids = [documentId];
          await fetch("/api/v1/documents/bulk", {
            method: "POST",
            headers: orgHeaders(orgId, true),
            body: JSON.stringify({ action: "trash", ids }),
          })
            .then(() =>
              fetch("/api/v1/documents/bulk", {
                method: "POST",
                headers: orgHeaders(orgId, true),
                body: JSON.stringify({ action: "purge", ids }),
              })
            )
            .catch(() => {});
        }
        patchPending(item.key, { status: "failed", error: err instanceof Error ? err.message : "Upload failed" });
      }
    },
    [orgId, entityType, entityId, commit]
  );

  const pump = useCallback(() => {
    while (running.current < PARALLEL && queue.current.length) {
      const next = queue.current.shift()!;
      running.current++;
      uploadOne(next).finally(() => {
        running.current--;
        pump();
      });
    }
  }, [uploadOne]);

  const upload = useCallback(
    (files: File[]) => {
      const usable = files.filter((f) => !f.name.startsWith("."));
      if (!usable.length || !entityId) return;
      const items = usable.map<Pending>((file, i) => ({
        key: `${Date.now().toString(36)}-${i}-${file.name}`,
        file,
        progress: 0,
        status: "uploading",
      }));
      setPending((p) => [...p, ...items]);
      queue.current.push(...items);
      pump();
    },
    [entityId, pump]
  );

  function retry(item: Pending) {
    patchPending(item.key, { status: "uploading", progress: 0, error: undefined });
    queue.current.push({ ...item, status: "uploading", progress: 0 });
    pump();
  }

  // Files handed over by the opener (dropped on a row) upload once
  const handed = useRef<File[] | null>(null);
  useEffect(() => {
    if (!initialFiles?.length || handed.current === initialFiles || !entityId) return;
    handed.current = initialFiles;
    upload(initialFiles);
  }, [initialFiles, entityId, upload]);

  // Paste a screenshot or copied file straight in
  useEffect(() => {
    if (!entityId) return;
    pasteStack.push(panelId);
    const onPaste = (e: ClipboardEvent) => {
      if (pasteStack[pasteStack.length - 1] !== panelId) return;
      const files = filesFromClipboard(e);
      if (!files.length) return;
      e.preventDefault();
      upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      const i = pasteStack.lastIndexOf(panelId);
      if (i >= 0) pasteStack.splice(i, 1);
    };
  }, [entityId, panelId, upload]);

  async function view(id: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/documents/${id}/download`, { headers: orgHeaders(orgId) });
      const data = await res.json();
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank", "noopener");
      else throw new Error();
    } catch {
      toast.error("Couldn't open the file");
    }
  }

  async function remove(d: Attachment) {
    if (!orgId) return;
    const prev = docsRef.current;
    commit(prev.filter((x) => x.id !== d.id));
    try {
      const res = await fetch(`/api/v1/documents/${d.id}`, { method: "DELETE", headers: orgHeaders(orgId) });
      if (!res.ok) throw new Error();
      toast.success(`Removed ${d.fileName}`, { description: "It's in Documents → Trash for 30 days." });
    } catch {
      commit(prev);
      toast.error("Couldn't remove the file");
    }
  }

  async function linkExisting(picked: Attachment[]) {
    if (!orgId || !entityId) return;
    const ok: Attachment[] = [];
    for (const d of picked) {
      try {
        const res = await fetch(`/api/v1/documents/${d.id}`, {
          method: "PATCH",
          headers: orgHeaders(orgId, true),
          body: JSON.stringify({ entityType, entityId }),
        });
        if (res.ok) ok.push(d);
      } catch {
        // reported below
      }
    }
    if (ok.length) commit([...docsRef.current, ...ok.filter((d) => !docsRef.current.some((x) => x.id === d.id))]);
    if (ok.length < picked.length) toast.error(`Couldn't attach ${picked.length - ok.length} file${picked.length - ok.length === 1 ? "" : "s"}`);
  }

  if (!entityId) return null;

  const hasOsFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");
  const uploading = pending.filter((p) => p.status === "uploading").length;

  return (
    <div
      className={cn("space-y-2", className)}
      onDragEnter={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">
          {label}
          {docs.length > 0 && <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">{docs.length}</span>}
        </Label>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
          title="Attach files already in Documents"
        >
          <FolderOpen className="size-3" />
          From Documents
        </button>
      </div>

      {(docs.length > 0 || pending.length > 0) && (
        <ul className={cn("divide-y rounded-lg border", compact ? "max-h-56 overflow-y-auto" : "max-h-72 overflow-y-auto")}>
          {docs.map((d) => (
            <li key={d.id} className="group/att flex items-center gap-2.5 px-2.5 py-1.5">
              <FileGlyph mime={d.mimeType} name={d.fileName} size={24} />
              <button
                type="button"
                onClick={() => view(d.id)}
                className="min-w-0 flex-1 text-left"
                title={`Open ${d.fileName}`}
              >
                <span className="block truncate text-xs font-medium hover:underline">{d.fileName}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {KIND_LABEL[kindOf(d.mimeType, d.fileName)]}
                  {d.fileSize ? <> · {formatBytes(d.fileSize)}</> : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => view(d.id)}
                className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                title="View"
              >
                <Eye className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(d)}
                className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                title="Remove"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} className="flex items-center gap-2.5 px-2.5 py-1.5">
              <FileGlyph mime={mimeOf(p.file)} name={p.file.name} size={24} className={cn(p.status === "uploading" && "opacity-60")} />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{p.file.name}</span>
                {p.status === "uploading" ? (
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                    <span
                      className="block h-full rounded-full bg-foreground/60 transition-[width]"
                      style={{ width: `${Math.max(4, Math.round(p.progress * 100))}%` }}
                    />
                  </span>
                ) : (
                  <span className="block truncate text-[10px] text-red-600 dark:text-red-400">{p.error}</span>
                )}
              </div>
              {p.status === "failed" ? (
                <>
                  <button
                    type="button"
                    onClick={() => retry(p)}
                    className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                    title="Try again"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}
                    className="rounded p-1 text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground"
                    title="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(p.progress * 100)}%
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loaded && docs.length === 0 && pending.length === 0 ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center transition-colors",
            compact ? "px-3 py-3" : "px-4 py-5",
            dragging
              ? "border-foreground/40 bg-foreground/[0.055]"
              : "border-foreground/15 hover:border-foreground/30 hover:bg-foreground/[0.03]"
          )}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            {uploading > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {dragging ? "Drop to attach" : uploading > 0 ? `Uploading ${uploading}…` : "Drop files or click to browse"}
          </span>
          {!compact && (
            <span className="text-[11px] text-muted-foreground">
              {hint} · several at once · paste a screenshot with ⌘V
            </span>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      <PickFromDocuments
        open={picking}
        onOpenChange={setPicking}
        orgId={orgId}
        exclude={docs.map((d) => d.id)}
        onPick={linkExisting}
      />
    </div>
  );
}

/** Choose files already in Documents that aren't attached to anything yet. */
function PickFromDocuments({
  open,
  onOpenChange,
  orgId,
  exclude,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  exclude: string[];
  onPick: (docs: Attachment[]) => Promise<void>;
}) {
  const [files, setFiles] = useState<Attachment[] | null>(null);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return;
    let live = true;
    fetch("/api/v1/documents?linked=none&limit=100", { headers: orgHeaders(orgId) })
      .then((r) => r.json())
      .then((data) => live && setFiles(data.data ?? []))
      .catch(() => live && setFiles([]));
    return () => {
      live = false;
      setFiles(null);
      setChosen(new Set());
      setSearch("");
    };
  }, [open, orgId]);

  const q = search.trim().toLowerCase();
  const list = (files ?? []).filter((f) => !exclude.includes(f.id) && (!q || f.fileName.toLowerCase().includes(q)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Attach from Documents</DialogTitle>
          <DialogDescription>Files in Documents that aren&apos;t attached to anything yet.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files" className="h-8 pl-8 text-sm" />
        </div>
        <div className="max-h-80 min-h-32 overflow-y-auto rounded-lg border">
          {files === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              {q ? "No files match." : "Every file in Documents is already attached to something."}
            </p>
          ) : (
            <ul className="divide-y">
              {list.map((f) => {
                const on = chosen.has(f.id);
                return (
                  <li key={f.id}>
                    <label className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2", on ? "bg-foreground/[0.055]" : "hover:bg-foreground/[0.03]")}>
                      <Checkbox
                        checked={on}
                        onCheckedChange={(c) =>
                          setChosen((s) => {
                            const n = new Set(s);
                            if (c === true) n.add(f.id);
                            else n.delete(f.id);
                            return n;
                          })
                        }
                      />
                      <FileGlyph mime={f.mimeType} name={f.fileName} size={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{f.fileName}</span>
                        <span className="block text-[10px] text-muted-foreground">{formatBytes(f.fileSize)}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!chosen.size || saving}
            onClick={async () => {
              setSaving(true);
              await onPick((files ?? []).filter((f) => chosen.has(f.id)));
              setSaving(false);
              onOpenChange(false);
            }}
          >
            {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Attach{chosen.size ? ` ${chosen.size} file${chosen.size === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Paperclip + count for a list row. Opens the attachments panel in a popover;
 * pass `dropped` to open it and upload files dropped onto the row.
 */
export function AttachmentsButton({
  orgId,
  entityType,
  entityId,
  count: initialCount = 0,
  dropped,
  className,
}: {
  orgId?: string | null;
  entityType: string;
  entityId: string;
  count?: number;
  dropped?: File[] | null;
  className?: string;
}) {
  const count = useAttachmentCount(entityType, entityId, initialCount);
  const [open, setOpen] = useState(false);
  const [seenDrop, setSeenDrop] = useState<File[] | null>(null);
  if (dropped && dropped !== seenDrop) {
    setSeenDrop(dropped);
    setOpen(true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs tabular-nums transition-colors hover:bg-foreground/[0.055] data-[state=open]:bg-foreground/[0.055]",
            count > 0
              ? "text-foreground/80"
              : "text-muted-foreground/60 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
            className
          )}
          title={count > 0 ? `${count} attachment${count === 1 ? "" : "s"}` : "Attach receipts or files"}
          aria-label={count > 0 ? `${count} attachments` : "Attach files"}
        >
          <Paperclip className="size-3.5" />
          {count > 0 && <span>{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <ReceiptAttachments
          orgId={orgId}
          entityType={entityType}
          entityId={entityId}
          initialFiles={seenDrop}
          compact
        />
      </PopoverContent>
    </Popover>
  );
}
