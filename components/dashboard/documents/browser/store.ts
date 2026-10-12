"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchBrowse, orgId, type BrowseData, type BrowseFile, type BrowseFolder, type BrowseView } from "./api";

/* ------------------------------------------------------------------ */
/*  Where you are: the URL is the source of truth                       */
/* ------------------------------------------------------------------ */

export interface Loc {
  view: BrowseView;
  folder: string | null;
  type: string | null;
  q: string;
}

const VIEW_SET = new Set<BrowseView>(["folder", "recent", "starred", "unlinked", "linked", "private", "trash", "record", "search"]);

export function parseLoc(params: URLSearchParams | null): Loc {
  const q = params?.get("q")?.trim() ?? "";
  const raw = params?.get("view") as BrowseView | null;
  const view: BrowseView = q ? "search" : raw && VIEW_SET.has(raw) && raw !== "search" ? raw : "folder";
  return { view, folder: view === "folder" ? (params?.get("folder") ?? null) : null, type: view === "record" ? (params?.get("type") ?? null) : null, q };
}

/** Query string for both the page URL and the browse API. */
export function locQuery(loc: Partial<Loc>) {
  const p = new URLSearchParams();
  if (loc.q) {
    p.set("q", loc.q);
  } else {
    if (loc.view && loc.view !== "folder") p.set("view", loc.view);
    if ((loc.view ?? "folder") === "folder" && loc.folder) p.set("folder", loc.folder);
    if (loc.view === "record" && loc.type) p.set("type", loc.type);
  }
  return p.toString();
}

export const hrefFor = (loc: Partial<Loc>) => {
  const q = locQuery(loc);
  return q ? `/documents?${q}` : "/documents";
};

const apiQuery = (loc: Loc) => {
  const p = new URLSearchParams({ view: loc.view });
  if (loc.folder) p.set("folder", loc.folder);
  if (loc.type) p.set("type", loc.type);
  if (loc.q) p.set("q", loc.q);
  return p.toString();
};

export const sameLoc = (a: Loc, b: Partial<Loc>) =>
  a.view === (b.view ?? "folder") && (a.folder ?? null) === (b.folder ?? null) && (a.type ?? null) === (b.type ?? null) && !a.q === !b.q;

/* ------------------------------------------------------------------ */
/*  A tiny external store                                               */
/* ------------------------------------------------------------------ */

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T | ((v: T) => T)) {
      value = typeof next === "function" ? (next as (v: T) => T)(value) : next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

function useStore<T>(store: ReturnType<typeof createStore<T>>, server?: T) {
  return useSyncExternalStore(store.subscribe, store.get, () => server ?? store.get());
}

/* ------------------------------------------------------------------ */
/*  Data: one cached response per view, shared by sidebar and browser   */
/* ------------------------------------------------------------------ */

export interface Entry {
  data: BrowseData | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: Entry = { data: null, loading: true, error: null };
const cache = createStore<{ entries: Record<string, Entry>; latest: BrowseData | null }>({ entries: {}, latest: null });
const inflight = new Map<string, Promise<void>>();
const generation = new Map<string, number>();
const mounted = new Map<string, number>();

const keyFor = (loc: Loc) => `${orgId() ?? ""}|${apiQuery(loc)}`;

function load(key: string, force = false) {
  const running = inflight.get(key);
  if (running && !force) return running;
  // Only the newest request for a key may write, so a slow old answer can't win
  const gen = (generation.get(key) ?? 0) + 1;
  generation.set(key, gen);
  const current = () => generation.get(key) === gen;
  const query = key.slice(key.indexOf("|") + 1);
  cache.set((c) => ({ ...c, entries: { ...c.entries, [key]: { ...(c.entries[key] ?? EMPTY), loading: true } } }));
  const p: Promise<void> = fetchBrowse(query)
    .then((data) => {
      if (current()) cache.set((c) => ({ latest: data, entries: { ...c.entries, [key]: { data, loading: false, error: null } } }));
    })
    .catch((err: Error) => {
      if (current()) cache.set((c) => ({ ...c, entries: { ...c.entries, [key]: { ...(c.entries[key] ?? EMPTY), loading: false, error: err.message } } }));
    })
    .finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Files, folders and counts for a location. Keeps showing the last answer while it refreshes. */
export function useBrowse(loc: Loc) {
  const key = keyFor(loc);
  const snap = useSyncExternalStore(
    cache.subscribe,
    () => cache.get().entries[key] ?? EMPTY,
    () => EMPTY
  );
  useEffect(() => {
    mounted.set(key, (mounted.get(key) ?? 0) + 1);
    load(key);
    return () => {
      const n = (mounted.get(key) ?? 1) - 1;
      if (n <= 0) mounted.delete(key);
      else mounted.set(key, n);
    };
  }, [key]);
  return snap;
}

/** The newest response from any view: enough for folder trees and counts. */
export function useLatest() {
  return useSyncExternalStore(cache.subscribe, () => cache.get().latest, () => null);
}

/** Refetch whatever is on screen; drop everything else so it reloads on visit. */
export function refresh() {
  const keep = new Set(mounted.keys());
  cache.set((c) => ({ ...c, entries: Object.fromEntries(Object.entries(c.entries).filter(([k]) => keep.has(k))) }));
  return Promise.all([...keep].map((k) => load(k, true)));
}

/** Change what's on screen right away, before the server confirms. */
export function optimistic(fn: (d: BrowseData) => BrowseData) {
  cache.set((c) => ({
    latest: c.latest ? fn(c.latest) : null,
    entries: Object.fromEntries(Object.entries(c.entries).map(([k, e]) => [k, e.data ? { ...e, data: fn(e.data) } : e])),
  }));
}

/* ------------------------------------------------------------------ */
/*  Preferences                                                         */
/* ------------------------------------------------------------------ */

export type SortKey = "name" | "modified" | "size" | "kind";
export interface Prefs {
  layout: "grid" | "list";
  sort: SortKey;
  dir: "asc" | "desc";
  details: boolean;
  /** Folder ids expanded in the sidebar tree. */
  expanded: string[];
}

const PREFS_KEY = "dubbl.files.prefs";
const DEFAULT_PREFS: Prefs = { layout: "grid", sort: "modified", dir: "desc", details: false, expanded: [] };
const prefs = createStore<Prefs>(DEFAULT_PREFS);
let prefsLoaded = false;

function loadPrefs() {
  if (prefsLoaded || typeof window === "undefined") return;
  prefsLoaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (saved) prefs.set({ ...DEFAULT_PREFS, ...saved });
  } catch {
    // ignore
  }
}

export function usePrefs() {
  useEffect(loadPrefs, []);
  return useStore(prefs, DEFAULT_PREFS);
}

export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  prefs.set((p) => {
    const next = { ...p, ...(typeof patch === "function" ? patch(p) : patch) };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    return next;
  });
}

export function toggleExpanded(id: string, open?: boolean) {
  setPrefs((p) => {
    const has = p.expanded.includes(id);
    const want = open ?? !has;
    if (want === has) return {};
    return { expanded: want ? [...p.expanded, id] : p.expanded.filter((x) => x !== id) };
  });
}

/* ------------------------------------------------------------------ */
/*  Shared UI state: renaming, dragging, cut-and-paste, undo            */
/* ------------------------------------------------------------------ */

export interface Renaming {
  kind: "file" | "folder";
  id: string;
  /** Which surface shows the text box. */
  surface: "main" | "tree";
}

const ui = createStore<{ renaming: Renaming | null; cut: DragPayload | null; dropTarget: string | null }>({
  renaming: null,
  cut: null,
  dropTarget: null,
});

export const useUi = () => useStore(ui);
export const setRenaming = (renaming: Renaming | null) => ui.set((u) => ({ ...u, renaming }));
export const setCut = (cut: DragPayload | null) => ui.set((u) => ({ ...u, cut }));
export const setDropTarget = (dropTarget: string | null) => ui.get().dropTarget !== dropTarget && ui.set((u) => ({ ...u, dropTarget }));
export const getCut = () => ui.get().cut;

/** What's being dragged inside dubbl; `dataTransfer` can't be read during dragover. */
export interface DragPayload {
  files: BrowseFile[];
  folders: BrowseFolder[];
}
let drag: DragPayload | null = null;
export const DRAG_MIME = "application/x-dubbl-files";
export const setDrag = (d: DragPayload | null) => {
  drag = d;
  if (!d) setDropTarget(null);
};
export const getDrag = () => drag;

let lastUndo: (() => void) | null = null;
export const setUndo = (fn: (() => void) | null) => {
  lastUndo = fn;
};
export const runUndo = () => {
  const fn = lastUndo;
  lastUndo = null;
  fn?.();
  return !!fn;
};
