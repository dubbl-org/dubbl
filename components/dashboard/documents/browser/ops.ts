"use client";

import { toast } from "sonner";
import { bulk, createFolder, deleteFolder, updateFile, updateFolder, type BrowseData, type BrowseFile, type BrowseFolder } from "./api";
import { optimistic, refresh, setRenaming, setUndo, type Renaming } from "./store";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fail = (err: unknown, fallback: string) => {
  toast.error(err instanceof Error ? err.message : fallback);
  refresh();
};

const withoutFiles = (ids: Set<string>) => (d: BrowseData) => ({ ...d, files: d.files.filter((f) => !ids.has(f.id)) });
const patchFiles = (ids: Set<string>, patch: Partial<BrowseFile>) => (d: BrowseData) => ({
  ...d,
  files: d.files.map((f) => (ids.has(f.id) ? { ...f, ...patch } : f)),
});
const patchFolder = (id: string, patch: Partial<BrowseFolder>) => (d: BrowseData) => ({
  ...d,
  folders: d.folders.map((f) => (f.id === id ? { ...f, ...patch } : f)),
});

export async function trashFiles(files: BrowseFile[]) {
  if (!files.length) return;
  const ids = files.map((f) => f.id);
  optimistic(withoutFiles(new Set(ids)));
  try {
    await bulk("trash", ids);
    const undo = () => restoreFiles(ids, true);
    setUndo(undo);
    toast(files.length === 1 ? `Moved “${files[0].fileName}” to Trash` : `Moved ${plural(files.length, "file")} to Trash`, {
      action: { label: "Undo", onClick: undo },
    });
  } catch (err) {
    fail(err, "Couldn't move to Trash");
  }
  refresh();
}

export async function restoreFiles(ids: string[], quiet = false) {
  if (!ids.length) return;
  optimistic(withoutFiles(new Set(ids)));
  try {
    const { count } = await bulk("restore", ids);
    if (!quiet) toast.success(count === 1 ? "File restored" : `${plural(count, "file")} restored`);
  } catch (err) {
    fail(err, "Couldn't restore");
  }
  refresh();
}

export async function purgeFiles(ids: string[]) {
  if (!ids.length) return;
  optimistic(withoutFiles(new Set(ids)));
  try {
    const { count } = await bulk("purge", ids);
    toast.success(count === 1 ? "Deleted forever" : `${plural(count, "file")} deleted forever`);
  } catch (err) {
    fail(err, "Couldn't delete");
  }
  refresh();
}

export async function starFiles(ids: string[], starred: boolean) {
  if (!ids.length) return;
  optimistic((d) => ({
    ...patchFiles(new Set(ids), { starred })(d),
    counts: { ...d.counts, starred: Math.max(0, d.counts.starred + (starred ? 1 : -1) * ids.length) },
  }));
  try {
    await bulk(starred ? "star" : "unstar", ids);
  } catch (err) {
    fail(err, "Couldn't update the star");
  }
  refresh();
}

export async function setVisibility(files: BrowseFile[], visibility: "organization" | "private") {
  const own = files.filter((f) => f.mine);
  if (!own.length) return toast.error("Only the person who uploaded a file can change who sees it");
  optimistic(patchFiles(new Set(own.map((f) => f.id)), { visibility }));
  try {
    const { skipped } = await bulk(visibility === "private" ? "private" : "share", own.map((f) => f.id));
    const what = visibility === "private" ? "Only you can see" : "Everyone in the workspace can see";
    toast.success(`${what} ${own.length === 1 ? "this file" : `these ${own.length} files`}${skipped || files.length > own.length ? ". Files others uploaded were left as they were." : ""}`);
  } catch (err) {
    fail(err, "Couldn't change who sees it");
  }
  refresh();
}

export async function detachFiles(files: BrowseFile[]) {
  try {
    for (const f of files) await updateFile(f.id, { entityType: null, entityId: null });
    toast.success(files.length === 1 ? "Detached from its record" : `Detached ${plural(files.length, "file")}`);
  } catch (err) {
    fail(err, "Couldn't detach");
  }
  refresh();
}

export async function renameFile(file: BrowseFile, name: string) {
  const next = name.trim();
  if (!next || next === file.fileName) return;
  optimistic(patchFiles(new Set([file.id]), { fileName: next }));
  try {
    await updateFile(file.id, { fileName: next });
  } catch (err) {
    fail(err, "Couldn't rename");
  }
  refresh();
}

export async function renameFolder(folder: BrowseFolder, name: string) {
  const next = name.trim();
  if (!next || next === folder.name) return;
  optimistic(patchFolder(folder.id, { name: next }));
  try {
    await updateFolder(folder.id, { name: next });
  } catch (err) {
    fail(err, "Couldn't rename the folder");
  }
  refresh();
}

export async function colorFolder(folder: BrowseFolder, color: string | null) {
  optimistic(patchFolder(folder.id, { color }));
  try {
    await updateFolder(folder.id, { color });
  } catch (err) {
    fail(err, "Couldn't change the colour");
  }
  refresh();
}

/** Makes "New folder" (or "New folder 2"…) and puts its name up for editing. */
export async function newFolder(parentId: string | null, siblings: BrowseFolder[], surface: Renaming["surface"]) {
  const taken = new Set(siblings.filter((f) => f.parentId === parentId).map((f) => f.name.toLowerCase()));
  let name = "New folder";
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `New folder ${i}`;
  try {
    const folder = await createFolder({ name, parentId });
    optimistic((d) => ({ ...d, folders: [...d.folders, { ...folder, fileCount: 0, size: 0, createdAt: String(folder.createdAt) }] }));
    setRenaming({ kind: "folder", id: folder.id, surface });
    refresh();
    return folder;
  } catch (err) {
    fail(err, "Couldn't create the folder");
  }
}

export async function removeFolder(folder: BrowseFolder) {
  optimistic((d) => ({ ...d, folders: d.folders.filter((f) => f.id !== folder.id) }));
  try {
    const { folders, files } = await deleteFolder(folder.id);
    const bits = [folders > 1 ? `${plural(folders - 1, "subfolder")} removed` : null, files ? `${plural(files, "file")} moved to Trash` : null].filter(Boolean);
    toast.success(`Deleted “${folder.name}”${bits.length ? `. ${bits.join(", ")}.` : ""}`);
  } catch (err) {
    fail(err, "Couldn't delete the folder");
  }
  refresh();
}

/** True when `id` is `ancestor` or sits somewhere inside it. */
export function isInside(folders: BrowseFolder[], id: string | null, ancestor: string) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (let cur = id, guard = 0; cur && guard < 64; cur = byId.get(cur)?.parentId ?? null, guard++) {
    if (cur === ancestor) return true;
  }
  return false;
}

/** Moves files and folders into `target` (null = top level), with undo. */
export async function moveItems(
  items: { files: BrowseFile[]; folders: BrowseFolder[] },
  target: { id: string | null; name: string },
  allFolders: BrowseFolder[]
) {
  const folders = items.folders.filter((f) => f.parentId !== target.id && !(target.id && isInside(allFolders, target.id, f.id)));
  const files = items.files.filter((f) => f.folderId !== target.id);
  if (items.folders.length && !folders.length && !files.length && target.id && items.folders.some((f) => isInside(allFolders, target.id, f.id))) {
    return toast.error("A folder can't go inside itself");
  }
  if (!files.length && !folders.length) return;

  const fileIds = new Set(files.map((f) => f.id));
  optimistic((d) => ({
    ...d,
    files: d.files.map((f) => (fileIds.has(f.id) ? { ...f, folderId: target.id } : f)),
    folders: d.folders.map((f) => (folders.some((m) => m.id === f.id) ? { ...f, parentId: target.id } : f)),
  }));

  try {
    if (files.length) await bulk("move", [...fileIds], target.id);
    for (const f of folders) await updateFolder(f.id, { parentId: target.id });
    const undo = async () => {
      const byFolder = new Map<string | null, string[]>();
      for (const f of files) byFolder.set(f.folderId, [...(byFolder.get(f.folderId) ?? []), f.id]);
      for (const [folderId, ids] of byFolder) await bulk("move", ids, folderId);
      for (const f of folders) await updateFolder(f.id, { parentId: f.parentId });
      refresh();
    };
    setUndo(undo);
    const count = files.length + folders.length;
    const what = count === 1 ? `“${files[0]?.fileName ?? folders[0].name}”` : plural(count, "item");
    toast(`Moved ${what} to ${target.name}`, { action: { label: "Undo", onClick: undo } });
  } catch (err) {
    fail(err, "Couldn't move");
  }
  refresh();
}
