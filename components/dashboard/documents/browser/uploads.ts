"use client";

import { useSyncExternalStore } from "react";
import { bulk, createFolder, headers } from "./api";
import { refresh } from "./store";

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  folderId: string | null;
  /** Where it's going, for the queue panel. */
  folderName: string | null;
  status: "queued" | "uploading" | "done" | "failed" | "cancelled";
  progress: number;
  error?: string;
  file: File;
}

export interface PickedFile {
  file: File;
  /** "Receipts/March/uber.jpg" when a whole folder was picked or dropped. */
  path?: string;
}

const PARALLEL = 3;
let items: UploadItem[] = [];
const listeners = new Set<() => void>();
const running = new Map<string, XMLHttpRequest>();
let seq = 0;

const emit = () => listeners.forEach((l) => l());
const update = (id: string, patch: Partial<UploadItem>) => {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
};

export function useUploads() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items
  );
}

const mimeOf = (f: File) => f.type || "application/octet-stream";

/**
 * Queue files for upload into a folder. Files picked from a folder keep their
 * structure: missing subfolders are created first.
 */
export async function enqueue(picked: PickedFile[], folderId: string | null, folderName: string | null) {
  if (!picked.length) return;
  const folderFor = new Map<string, { id: string | null; name: string | null }>([["", { id: folderId, name: folderName }]]);

  const ensure = async (dir: string): Promise<{ id: string | null; name: string | null }> => {
    const hit = folderFor.get(dir);
    if (hit) return hit;
    const slash = dir.lastIndexOf("/");
    const parent = await ensure(slash < 0 ? "" : dir.slice(0, slash));
    const name = dir.slice(slash + 1);
    const folder = await createFolder({ name, parentId: parent.id });
    const made = { id: folder.id, name };
    folderFor.set(dir, made);
    return made;
  };

  const queued: UploadItem[] = [];
  let madeFolders = false;
  for (const p of picked) {
    const parts = (p.path ?? p.file.name).split("/").filter(Boolean);
    const dir = parts.slice(0, -1).join("/");
    let target = folderFor.get(dir);
    if (!target) {
      try {
        target = await ensure(dir);
        madeFolders = true;
      } catch {
        target = { id: folderId, name: folderName };
      }
    }
    queued.push({
      id: `u${Date.now().toString(36)}${(seq++).toString(36)}`,
      name: p.file.name,
      size: p.file.size,
      mime: mimeOf(p.file),
      folderId: target.id,
      folderName: target.name,
      status: "queued",
      progress: 0,
      file: p.file,
    });
  }
  items = [...items.filter((i) => i.status !== "done" && i.status !== "cancelled"), ...queued];
  emit();
  if (madeFolders) refresh();
  pump();
}

function pump() {
  while (running.size < PARALLEL) {
    const next = items.find((i) => i.status === "queued");
    if (!next) break;
    start(next);
  }
}

async function start(item: UploadItem) {
  update(item.id, { status: "uploading", progress: 0, error: undefined });
  const xhr = new XMLHttpRequest();
  running.set(item.id, xhr);
  let documentId: string | null = null;

  const finish = (patch: Partial<UploadItem>) => {
    running.delete(item.id);
    update(item.id, patch);
    pump();
    if (!items.some((i) => i.status === "uploading" || i.status === "queued")) refresh();
  };

  try {
    // 1. Ask for a place to put it (also checks the storage allowance)
    const res = await fetch("/api/v1/documents", {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({ fileName: item.name, fileSize: Math.max(1, item.size), mimeType: item.mime, folderId: item.folderId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; uploadUrl?: string; document?: { id: string } };
    if (!res.ok || !data.uploadUrl || !data.document) throw new Error(data.error || (res.status === 503 ? "File storage isn't set up" : "Couldn't start the upload"));
    documentId = data.document.id;
    if (items.find((i) => i.id === item.id)?.status === "cancelled") throw new Error("cancelled");

    // 2. Send the bytes straight to storage
    await new Promise<void>((resolve, reject) => {
      xhr.open("PUT", data.uploadUrl!);
      xhr.setRequestHeader("content-type", item.mime);
      xhr.upload.onprogress = (e) => e.lengthComputable && update(item.id, { progress: e.loaded / e.total });
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the file (${xhr.status})`)));
      xhr.onerror = () => reject(new Error("Network error while uploading"));
      xhr.onabort = () => reject(new Error("cancelled"));
      xhr.send(item.file);
    });
    finish({ status: "done", progress: 1 });
  } catch (err) {
    const cancelled = err instanceof Error && err.message === "cancelled";
    // The library row exists but the bytes don't: take it back out
    if (documentId) await bulk("trash", [documentId]).then(() => bulk("purge", [documentId!])).catch(() => {});
    finish(cancelled ? { status: "cancelled" } : { status: "failed", error: err instanceof Error ? err.message : "Upload failed" });
  }
}

export function cancelUpload(id: string) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  if (item.status === "queued") return update(id, { status: "cancelled" });
  if (item.status === "uploading") {
    update(id, { status: "cancelled" });
    running.get(id)?.abort();
  }
}

export function retryUpload(id: string) {
  update(id, { status: "queued", progress: 0, error: undefined });
  pump();
}

export function cancelAll() {
  for (const i of items) cancelUpload(i.id);
}

export function clearFinished() {
  items = items.filter((i) => i.status === "uploading" || i.status === "queued");
  emit();
}

/* ------------------------------------------------------------------ */
/*  Reading what was dropped, folders included                          */
/* ------------------------------------------------------------------ */

type Entry = FileSystemEntry & { isFile: boolean; isDirectory: boolean };

const readFile = (entry: FileSystemFileEntry) => new Promise<File>((res, rej) => entry.file(res, rej));
const readDir = (entry: FileSystemDirectoryEntry) =>
  new Promise<FileSystemEntry[]>((res, rej) => {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    // readEntries hands back at most ~100 entries per call
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return res(all);
        all.push(...batch);
        next();
      }, rej);
    next();
  });

async function walk(entry: Entry, prefix: string, out: PickedFile[]) {
  if (entry.isFile) {
    const file = await readFile(entry as unknown as FileSystemFileEntry);
    if (!file.name.startsWith(".")) out.push({ file, path: `${prefix}${file.name}` });
  } else if (entry.isDirectory) {
    for (const child of await readDir(entry as unknown as FileSystemDirectoryEntry)) {
      await walk(child as Entry, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Files from a drop, walking into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => (i.webkitGetAsEntry?.() as Entry | null) ?? null);
  if (entries.length && entries.every(Boolean)) {
    const out: PickedFile[] = [];
    for (const e of entries) await walk(e!, "", out);
    return out;
  }
  return [...dt.files].map((file) => ({ file }));
}

/** Files from an <input type=file>, keeping folder paths when a folder was picked. */
export const filesFromInput = (list: FileList | null): PickedFile[] =>
  [...(list ?? [])].filter((f) => !f.name.startsWith(".")).map((file) => ({ file, path: file.webkitRelativePath || undefined }));

export const hasOsFiles = (e: React.DragEvent | DragEvent) => !!e.dataTransfer?.types.includes("Files");
