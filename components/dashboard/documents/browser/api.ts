import type { BrowseFile, BrowseFolder, BrowseView } from "@/lib/documents/browse";

export type { BrowseFile, BrowseFolder, BrowseView };

export interface ViewCounts {
  all: number;
  recent: number;
  unlinked: number;
  linked: number;
  private: number;
  trash: number;
  starred: number;
}

export interface BrowseData {
  files: BrowseFile[];
  truncated: boolean;
  folders: BrowseFolder[];
  counts: ViewCounts;
  byRecord: { type: string; label: string; count: number }[];
  storage: { usedBytes: number; maxBytes: number; plan: string };
}

export type BulkAction = "move" | "trash" | "restore" | "purge" | "star" | "unstar" | "share" | "private";

export const orgId = () => (typeof window === "undefined" ? null : localStorage.getItem("activeOrgId"));

export function headers(json = false): Record<string, string> {
  const id = orgId();
  return { ...(id ? { "x-organization-id": id } : {}), ...(json ? { "content-type": "application/json" } : {}) };
}

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: headers(init?.json !== undefined),
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export const fetchBrowse = (query: string) => call<BrowseData>(`/api/v1/documents/browse?${query}`);

export const bulk = (action: BulkAction, ids: string[], folderId?: string | null) =>
  call<{ count: number; skipped?: number }>("/api/v1/documents/bulk", { method: "POST", json: { action, ids, ...(action === "move" ? { folderId: folderId ?? null } : {}) } });

export const createFolder = (body: { name: string; parentId?: string | null; color?: string | null }) =>
  call<{ folder: BrowseFolder }>("/api/v1/documents/folders", { method: "POST", json: body }).then((r) => r.folder);

export const updateFolder = (id: string, body: { name?: string; parentId?: string | null; color?: string | null }) =>
  call<{ folder: BrowseFolder }>(`/api/v1/documents/folders/${id}`, { method: "PATCH", json: body });

export const deleteFolder = (id: string) => call<{ folders: number; files: number }>(`/api/v1/documents/folders/${id}`, { method: "DELETE" });

export const updateFile = (id: string, body: { fileName?: string; entityType?: null; entityId?: null }) =>
  call<{ document: unknown }>(`/api/v1/documents/${id}`, { method: "PATCH", json: body });

/** A short-lived link to the file's bytes. `download` makes the browser save it. */
export async function fileUrl(id: string, download = false) {
  const data = await call<{ downloadUrl?: string }>(`/api/v1/documents/${id}/download${download ? "?download=1" : ""}`);
  if (!data.downloadUrl) throw new Error("This file isn't available right now");
  return data.downloadUrl;
}

export async function downloadFiles(files: { id: string; fileName: string }[]) {
  for (const f of files) {
    const url = await fileUrl(f.id, true);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Browsers drop rapid-fire downloads; give each a moment
    if (files.length > 1) await new Promise((r) => setTimeout(r, 350));
  }
}

export async function openInNewTab(id: string) {
  // Open the tab first so pop-up blockers treat it as a direct click
  const tab = window.open("", "_blank");
  try {
    const url = await fileUrl(id);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (err) {
    tab?.close();
    throw err;
  }
}
