"use client";

import { useEffect, useState } from "react";
import { Check, FileImage, FileSpreadsheet, FileText, File as FileIcon, FolderInput, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatDay } from "@/components/dashboard/explorer/cells";

export type FileKind = "pdf" | "image" | "sheet" | "other";

export function fileKind(mime: string): FileKind {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("spreadsheet") || mime.includes("csv") || mime.includes("excel")) return "sheet";
  return "other";
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_ICON = { pdf: FileText, image: FileImage, sheet: FileSpreadsheet, other: FileIcon };

export function FileName({ name, mime }: { name: string; mime: string }) {
  const Icon = KIND_ICON[fileKind(mime)];
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="truncate font-medium">{name}</span>
    </span>
  );
}

function headers(json = false): Record<string, string> {
  const orgId = localStorage.getItem("activeOrgId");
  return { ...(orgId ? { "x-organization-id": orgId } : {}), ...(json ? { "content-type": "application/json" } : {}) };
}

export async function patchDocument(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/v1/documents/${id}`, { method: "PATCH", headers: headers(true), body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Couldn't update the file");
  return data;
}

export async function deleteDocument(id: string) {
  const res = await fetch(`/api/v1/documents/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) throw new Error("Couldn't delete the file");
}

export async function openDocument(id: string) {
  // Open the tab first so pop-up blockers treat it as a direct click
  const tab = window.open("", "_blank");
  try {
    const res = await fetch(`/api/v1/documents/${id}/download`, { headers: headers() });
    const data = (await res.json()) as { downloadUrl?: string };
    if (!data.downloadUrl) throw new Error("This file isn't available right now");
    if (tab) tab.location.href = data.downloadUrl;
    else window.location.href = data.downloadUrl;
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** A small picture of an image file, so you can tell receipts apart without opening them. */
export function FileThumb({ id, mime }: { id: string; mime: string }) {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  const isImage = mime.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetch(`/api/v1/documents/${id}/download`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setState({ id, url: d?.downloadUrl ?? null }))
      .catch(() => !cancelled && setState({ id, url: null }));
    return () => {
      cancelled = true;
    };
  }, [id, isImage]);

  if (!isImage) return null;
  if (state?.id !== id) return <Skeleton className="mt-5 h-48 w-full rounded-xl" />;
  if (!state.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, not optimisable
    <img src={state.url} alt="" className="mt-5 max-h-72 w-full rounded-xl border border-border/80 bg-foreground/[0.02] object-contain" />
  );
}

const RECORD_TYPES: { value: string; label: string }[] = [
  { value: "bill", label: "Bill" },
  { value: "expense", label: "Expense" },
  { value: "invoice", label: "Invoice" },
  { value: "bank_transaction", label: "Bank transaction" },
  { value: "quote", label: "Quote" },
  { value: "payment", label: "Payment" },
  { value: "journal_entry", label: "Journal entry" },
  { value: "contact", label: "Contact" },
];

interface RecordOption {
  id: string;
  label: string;
  sub: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
}

/** Pick a bill, expense, invoice… and attach the files to it. */
export function RecordPicker({ documentIds, onDone }: { documentIds: string[]; onDone: () => void }) {
  const [type, setType] = useState("bill");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<{ key: string; options: RecordOption[] } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const key = `${type}:${search}`;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/v1/documents/link-targets?${new URLSearchParams({ type, search })}`, { headers: headers() })
        .then((r) => (r.ok ? r.json() : { options: [] }))
        .then((d) => !cancelled && setResult({ key: `${type}:${search}`, options: d.options ?? [] }))
        .catch(() => !cancelled && setResult({ key: `${type}:${search}`, options: [] }));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [type, search]);

  async function attach(option: RecordOption) {
    setSaving(option.id);
    try {
      for (const id of documentIds) await patchDocument(id, { entityType: type, entityId: option.id });
      toast.success(`Attached to ${RECORD_TYPES.find((r) => r.value === type)?.label.toLowerCase()} ${option.label}`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't attach the file");
    } finally {
      setSaving(null);
    }
  }

  const loading = result?.key !== key;

  return (
    <>
      <div className="flex flex-wrap gap-1 border-b border-border/60 p-2">
        {RECORD_TYPES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => setType(r.value)}
            className={cn(
              "h-6 rounded-md px-2 text-[12px] font-medium transition-colors",
              type === r.value ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="relative border-b border-border/60">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by number, name or description…"
          className="h-9 w-full bg-transparent pl-8 pr-3 text-[13px] outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <div className="max-h-72 overflow-y-auto p-1">
        {loading ? (
          <div className="space-y-1 p-1">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-3/4" />
          </div>
        ) : result.options.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nothing matches</p>
        ) : (
          result.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => attach(o)}
              disabled={saving != null}
              className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{o.label}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {[o.sub, o.date ? formatDay(o.date) : null].filter(Boolean).join(" · ") || "—"}
                </span>
              </span>
              {o.amount != null && <span className="shrink-0 text-[12.5px] tabular-nums text-foreground/80">{formatMoney(o.amount, o.currency || "USD")}</span>}
              {saving === o.id && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
            </button>
          ))
        )}
      </div>
    </>
  );
}

/** A button that opens {@link RecordPicker}. */
export function AttachToRecord({ documentIds, onDone, primary }: { documentIds: string[]; onDone: () => void; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={documentIds.length === 0}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
            primary ? "bg-foreground text-background hover:opacity-90" : "border border-border/80 hover:bg-foreground/[0.03]"
          )}
        >
          <Link2 className="size-3.5" />
          {documentIds.length > 1 ? `Attach ${documentIds.length} to a record` : "Attach to a record"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-0">
        {open && (
          <RecordPicker
            documentIds={documentIds}
            onDone={() => {
              setOpen(false);
              onDone();
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
}

/** Move files into a folder (or back to the top level). */
export function MoveToFolder({ documentIds, currentFolderId, onDone }: { documentIds: string[]; currentFolderId?: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open || folders) return;
    fetch("/api/v1/documents/folders", { headers: headers() })
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then((d) => setFolders(d.folders ?? []))
      .catch(() => setFolders([]));
  }, [open, folders]);

  // Show nested folders as "Parent / Child"
  const path = (f: Folder): string => {
    const parent = f.parentId ? folders?.find((p) => p.id === f.parentId) : undefined;
    return parent ? `${path(parent)} / ${f.name}` : f.name;
  };

  async function move(folderId: string | null) {
    setSaving(folderId ?? "root");
    try {
      for (const id of documentIds) await patchDocument(id, { folderId });
      toast.success(folderId ? "Moved to folder" : "Moved to the top level");
      setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move the file");
    } finally {
      setSaving(null);
    }
  }

  const options = [{ id: null as string | null, label: "Top level (no folder)" }, ...(folders ?? []).map((f) => ({ id: f.id as string | null, label: path(f) })).sort((a, b) => a.label.localeCompare(b.label))];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={documentIds.length === 0}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03] disabled:pointer-events-none disabled:opacity-40"
        >
          <FolderInput className="size-3.5" />
          Move to folder
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {!folders ? (
          <div className="space-y-1 p-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.id ?? "root"}
                type="button"
                onClick={() => move(o.id)}
                disabled={saving != null}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-foreground/[0.04] disabled:opacity-60"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {saving === (o.id ?? "root") ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  (currentFolderId ?? null) === o.id && <Check className="size-3.5 text-muted-foreground" />
                )}
              </button>
            ))}
            {folders.length === 0 && <p className="px-2.5 pb-2 pt-1 text-[12px] text-muted-foreground">No folders yet. Create one on the All documents page.</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
