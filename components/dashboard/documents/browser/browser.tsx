"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownUp,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderTree,
  FolderUp,
  Keyboard,
  LayoutGrid,
  Link2,
  List,
  Lock,
  Palette,
  PanelRight,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  Search,
  Star,
  StarOff,
  Trash2,
  Unlink,
  Upload,
  Users,
  X,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useAssistant } from "@/components/dashboard/assistant/assistant-context";
import { TillyMark } from "@/components/dashboard/assistant/tilly-mark";
import { cn } from "@/lib/utils";
import { downloadFiles, openInNewTab, type BrowseData, type BrowseFile, type BrowseFolder } from "./api";
import { AttachDialog, DropOverlay, EmptyState, ShortcutsDialog, UploadPanel, moveTargets } from "./chrome";
import { DetailsPane } from "./details";
import { dropTarget, endDrag, startDrag } from "./dnd";
import { FolderGlyph, KIND_FILTERS, KIND_LABEL, filterKind, formatBytes, kindOf } from "./glyphs";
import { FileCard, FolderTile, LIST_COLS, ListRow, type Item } from "./items";
import {
  colorFolder,
  detachFiles,
  isInside,
  moveItems,
  newFolder,
  purgeFiles,
  removeFolder,
  renameFile,
  renameFolder,
  restoreFiles,
  setVisibility,
  starFiles,
  trashFiles,
} from "./ops";
import { ColorSwatches, Kbd } from "./parts";
import { QuickLook } from "./quick-look";
import { DocumentsSidebar, QUICK_VIEWS, folderPath, folderTree, useLoc } from "./sidebar";
import {
  getCut,
  getDrag,
  hrefFor,
  locQuery,
  runUndo,
  setCut,
  setPrefs,
  setRenaming,
  useBrowse,
  usePrefs,
  useUi,
  type Loc,
  type SortKey,
} from "./store";
import { enqueue, filesFromDrop, filesFromInput, hasOsFiles } from "./uploads";

type KindFilter = (typeof KIND_FILTERS)[number]["value"];

const SORTS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "modified", label: "Date added" },
  { value: "size", label: "Size" },
  { value: "kind", label: "Kind" },
];

const TILLY_TYPES = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/|application\/json)/;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
const overlayOpen = () => !!document.querySelector('[role="dialog"],[role="menu"],[data-radix-popper-content-wrapper]');

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

function sortFiles(files: BrowseFile[], sort: SortKey, dir: "asc" | "desc", trash: boolean) {
  const m = dir === "asc" ? 1 : -1;
  const date = (f: BrowseFile) => (trash && f.deletedAt ? f.deletedAt : f.createdAt);
  return [...files].sort((a, b) => {
    switch (sort) {
      case "name":
        return m * byName(a.fileName, b.fileName);
      case "size":
        return m * (a.fileSize - b.fileSize) || byName(a.fileName, b.fileName);
      case "kind":
        return m * byName(KIND_LABEL[kindOf(a.mimeType, a.fileName)], KIND_LABEL[kindOf(b.mimeType, b.fileName)]) || byName(a.fileName, b.fileName);
      default:
        return m * (date(a).localeCompare(date(b)));
    }
  });
}

function sortFolders(folders: BrowseFolder[], sort: SortKey, dir: "asc" | "desc") {
  const m = dir === "asc" ? 1 : -1;
  return [...folders].sort((a, b) =>
    sort === "modified" ? m * a.createdAt.localeCompare(b.createdAt) : sort === "size" ? m * (a.size - b.size) || byName(a.name, b.name) : (sort === "name" ? m : 1) * byName(a.name, b.name)
  );
}

/** Next item in a direction, by where items sit on screen (works for grid and list). */
function spatialNext(container: HTMLElement, fromKey: string, dir: "up" | "down") {
  const els = [...container.querySelectorAll<HTMLElement>("[data-key]")];
  const from = els.find((e) => e.dataset.key === fromKey)?.getBoundingClientRect();
  if (!from) return null;
  const cx = from.left + from.width / 2;
  let best: { key: string; score: number } | null = null;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const dy = dir === "down" ? r.top - from.bottom : from.top - r.bottom;
    if (dy < -2) continue;
    if (Math.abs(r.top - from.top) < 4) continue;
    const score = Math.max(0, dy) * 4 + Math.abs(r.left + r.width / 2 - cx);
    if (!best || score < best.score) best = { key: el.dataset.key!, score };
  }
  return best?.key ?? null;
}

export function FileBrowser() {
  const router = useRouter();
  const params = useSearchParams();
  const { loc } = useLoc();
  const entry = useBrowse(loc);
  const prefs = usePrefs();
  const { renaming, cut, dropTarget: over } = useUi();
  const { ask } = useAssistant();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // While a new search loads, keep showing the previous results instead of flashing empty
  const [stale, setStale] = useState<{ data: BrowseData; search: boolean } | null>(null);
  if (entry.data && entry.data !== stale?.data) setStale({ data: entry.data, search: loc.view === "search" });
  const data = entry.data ?? (loc.view === "search" && stale?.search ? stale.data : null);

  /* ---------- search box ---------- */
  const [text, setText] = useState(loc.q);
  const [urlQ, setUrlQ] = useState(loc.q);
  if (loc.q !== urlQ) {
    setUrlQ(loc.q);
    setText(loc.q);
  }
  const [searchFrom, setSearchFrom] = useState<Loc | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (text.trim() === loc.q) return;
    const t = setTimeout(() => {
      const q = text.trim();
      if (q) router.replace(hrefFor({ q }), { scroll: false });
      else router.replace(hrefFor(searchFrom ?? { view: "folder" }), { scroll: false });
    }, 220);
    return () => clearTimeout(t);
  }, [text, loc.q, router, searchFrom]);

  /* ---------- selection, reset when the place changes ---------- */
  const placeKey = locQuery(loc);
  const [place, setPlace] = useState(placeKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  if (place !== placeKey) {
    setPlace(placeKey);
    setSelected(new Set());
    setAnchor(null);
    setFocus(null);
    setKind("all");
  }

  const [look, setLook] = useState<string | null>(() => params.get("file"));
  const [attachIds, setAttachIds] = useState<string[] | null>(null);
  const [menuOn, setMenuOn] = useState<"items" | "background">("background");
  const [osDrag, setOsDrag] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [foldersSheet, setFoldersSheet] = useState(false);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  /* ---------- what's on screen ---------- */
  const allFolders = useMemo(() => data?.folders ?? [], [data]);
  const tree = useMemo(() => folderTree(allFolders), [allFolders]);
  const byId = useMemo(() => new Map(allFolders.map((f) => [f.id, f])), [allFolders]);
  const current = loc.view === "folder" && loc.folder ? (byId.get(loc.folder) ?? null) : null;
  const path = useMemo(() => folderPath(allFolders, current?.id ?? null), [allFolders, current]);
  const trash = loc.view === "trash";
  const pathOf = useCallback(
    (id: string | null) => (id ? folderPath(allFolders, id).map((f) => f.name).join(" / ") || "All files" : "All files"),
    [allFolders]
  );

  const title =
    loc.view === "search"
      ? `“${loc.q}”`
      : loc.view === "folder"
        ? (current?.name ?? "All files")
        : loc.view === "record"
          ? (data?.byRecord.find((r) => r.type === loc.type)?.label ?? "Attached")
          : (QUICK_VIEWS.find((v) => v.view === loc.view)?.label ?? "Files");
  useDocumentTitle(`Documents · ${title}`);

  const folderItems = useMemo(() => {
    if (kind !== "all") return [];
    if (loc.view === "folder") return sortFolders(tree.children.get(current?.id ?? null) ?? [], prefs.sort, prefs.dir);
    if (loc.view === "search") return sortFolders(allFolders.filter((f) => f.name.toLowerCase().includes(loc.q.toLowerCase())), prefs.sort, prefs.dir);
    return [];
  }, [kind, loc, tree, current, allFolders, prefs.sort, prefs.dir]);

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = { all: data?.files.length ?? 0 };
    for (const f of data?.files ?? []) {
      const k = filterKind(kindOf(f.mimeType, f.fileName));
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [data]);

  const fileItems = useMemo(() => {
    const list = (data?.files ?? []).filter((f) => kind === "all" || filterKind(kindOf(f.mimeType, f.fileName)) === kind);
    return sortFiles(list, prefs.sort, prefs.dir, trash);
  }, [data, kind, prefs.sort, prefs.dir, trash]);

  const items: Item[] = useMemo(
    () => [
      ...folderItems.map((folder) => ({ key: `f:${folder.id}`, type: "folder" as const, folder })),
      ...fileItems.map((file) => ({ key: `d:${file.id}`, type: "file" as const, file })),
    ],
    [folderItems, fileItems]
  );
  const index = useMemo(() => new Map(items.map((it, i) => [it.key, i])), [items]);

  const selFiles = useMemo(() => fileItems.filter((f) => selected.has(`d:${f.id}`)), [fileItems, selected]);
  const selFolders = useMemo(() => folderItems.filter((f) => selected.has(`f:${f.id}`)), [folderItems, selected]);
  const selCount = selFiles.length + selFolders.length;

  const uploadTarget = current ? { id: current.id, name: current.name } : { id: null, name: "All files" };

  /* ---------- actions ---------- */
  const open = (it: Item) => {
    if (it.type === "folder") router.push(hrefFor({ view: "folder", folder: it.folder.id }));
    else setLook(it.file.id);
  };

  const closeLook = () => {
    setLook(null);
    if (params.get("file")) router.replace(hrefFor(loc), { scroll: false });
  };

  const selectOnly = (key: string) => {
    setSelected(new Set([key]));
    setAnchor(key);
    setFocus(key);
  };

  const askTilly = (files: BrowseFile[]) => {
    const usable = files.filter((f) => TILLY_TYPES.test(f.mimeType)).slice(0, 8);
    if (!usable.length) return toast.error("Tilly can read PDFs, images, CSV and text files");
    if (usable.length < files.length) toast(`Sharing ${usable.length} of ${files.length} files. Tilly reads up to 8 PDFs, images or text files at once.`);
    ask(
      usable.length === 1
        ? "Please read this file. If it's a receipt or bill, check my books for a match first, then book it and attach the file to the record."
        : "Please read these files. For each receipt or bill, check my books for a match first, then book it and attach the file to the record.",
      { newTab: true, files: usable.map((f) => ({ type: "file", documentId: f.id, fileName: f.fileName, mimeType: f.mimeType, fileSize: f.fileSize })) }
    );
  };

  const copyLink = (file: BrowseFile) => {
    const base = hrefFor({ view: "folder", folder: file.folderId });
    navigator.clipboard
      .writeText(`${window.location.origin}${base}${base.includes("?") ? "&" : "?"}file=${file.id}`)
      .then(() => toast.success("Link copied. Only people in this workspace can open it."))
      .catch(() => toast.error("Couldn't copy the link"));
  };

  const deleteFolderConfirm = async (folder: BrowseFolder) => {
    const files = tree.total.get(folder.id) ?? 0;
    const ok = await confirm({
      title: `Delete “${folder.name}”?`,
      description: files
        ? `Its subfolders are deleted too, and the ${files === 1 ? "file" : `${files} files`} inside move to Trash, where you can restore them for 30 days.`
        : "It's empty, so nothing else is affected.",
      confirmLabel: "Delete folder",
      destructive: true,
    });
    if (ok) removeFolder(folder);
  };

  const trashSelection = async () => {
    if (trash) return;
    if (selFolders.length) {
      for (const f of selFolders) await deleteFolderConfirm(f);
    }
    if (selFiles.length) trashFiles(selFiles);
    setSelected(new Set());
  };

  const purgeConfirm = async (files: BrowseFile[]) => {
    const ok = await confirm({
      title: files.length === 1 ? `Delete “${files[0].fileName}” forever?` : `Delete ${files.length} files forever?`,
      description: "They're removed from storage straight away. This can't be undone.",
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (ok) {
      purgeFiles(files.map((f) => f.id));
      setSelected(new Set());
    }
  };

  const paste = () => {
    const c = getCut();
    if (!c || loc.view !== "folder") return;
    setCut(null);
    moveItems(c, uploadTarget, allFolders);
  };

  const startRename = (it: Item) => setRenaming({ kind: it.type, id: it.type === "folder" ? it.folder.id : it.file.id, surface: "main" });

  const upload = (picked: Parameters<typeof enqueue>[0]) => enqueue(picked, uploadTarget.id, uploadTarget.id ? uploadTarget.name : null);

  /* ---------- clicks ---------- */
  const click = (it: Item, e: React.MouseEvent) => {
    scrollRef.current?.focus({ preventScroll: true });
    if (e.shiftKey && anchor && index.has(anchor)) {
      const [a, b] = [index.get(anchor)!, index.get(it.key)!].sort((x, y) => x - y);
      const range = items.slice(a, b + 1).map((x) => x.key);
      setSelected((s) => new Set(e.metaKey || e.ctrlKey ? [...s, ...range] : range));
      setFocus(it.key);
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(it.key)) n.delete(it.key);
        else n.add(it.key);
        return n;
      });
      setAnchor(it.key);
      setFocus(it.key);
    } else {
      selectOnly(it.key);
    }
  };

  const toggle = (it: Item) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(it.key)) n.delete(it.key);
      else n.add(it.key);
      return n;
    });
    setAnchor(it.key);
    setFocus(it.key);
  };

  const handlersFor = (it: Item): React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean } => {
    const editing = renaming?.surface === "main" && renaming.id === (it.type === "folder" ? it.folder.id : it.file.id);
    const base = {
      draggable: !editing && !trash,
      onClick: (e: React.MouseEvent) => click(it, e),
      onDoubleClick: () => open(it),
      onContextMenu: () => {
        if (!selected.has(it.key)) selectOnly(it.key);
        setMenuOn("items");
      },
      onDragStart: (e: React.DragEvent) => {
        const keys = selected.has(it.key) ? selected : new Set([it.key]);
        if (!selected.has(it.key)) selectOnly(it.key);
        startDrag(e, {
          files: fileItems.filter((f) => keys.has(`d:${f.id}`)),
          folders: folderItems.filter((f) => keys.has(`f:${f.id}`)),
        });
      },
      onDragEnd: endDrag,
    };
    if (it.type !== "folder") return base;
    const f = it.folder;
    return {
      ...base,
      ...dropTarget(`main:${f.id}`, {
        canDrop: (p) => !p.folders.some((m) => m.id === f.id || isInside(allFolders, f.id, m.id)),
        onItems: (p) => moveItems(p, { id: f.id, name: f.name }, allFolders),
        onFiles: (picked) => enqueue(picked, f.id, f.name),
        onLinger: () => getDrag() && router.push(hrefFor({ view: "folder", folder: f.id })),
      }),
    };
  };

  /* ---------- marquee selection ---------- */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-key],button,input,a,[data-no-marquee]")) return;
    const content = contentRef.current;
    const scroller = scrollRef.current;
    if (!content || !scroller) return;
    e.preventDefault();
    scroller.focus({ preventScroll: true });
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = content.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const start = at(e);
    const c0 = content.getBoundingClientRect();
    const rects = [...content.querySelectorAll<HTMLElement>("[data-key]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.dataset.key!, x: r.left - c0.left, y: r.top - c0.top, w: r.width, h: r.height };
    });
    const additive = e.metaKey || e.ctrlKey || e.shiftKey;
    const base = additive ? new Set(selected) : new Set<string>();
    let moved = false;

    const move = (ev: MouseEvent) => {
      const p = at(ev);
      if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 4) return;
      moved = true;
      const b = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      setBox(b);
      const hits = rects.filter((r) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y).map((r) => r.key);
      const next = new Set(base);
      for (const k of hits) {
        if (additive && base.has(k) && (ev.metaKey || ev.ctrlKey)) next.delete(k);
        else next.add(k);
      }
      setSelected(next);
      const sr = scroller.getBoundingClientRect();
      if (ev.clientY > sr.bottom - 36) scroller.scrollBy(0, 18);
      else if (ev.clientY < sr.top + 36) scroller.scrollBy(0, -18);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setBox(null);
      if (!moved && !additive) {
        setSelected(new Set());
        setAnchor(null);
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /* ---------- keyboard ---------- */
  const typeahead = useRef({ text: "", at: 0 });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (look || isTyping(e.target) || overlayOpen()) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key;
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      const focused = focus && index.has(focus) ? items[index.get(focus)!] : null;
      const move = (to: string | null) => {
        if (!to) return;
        if (e.shiftKey && anchor && index.has(anchor)) {
          const [a, b] = [index.get(anchor)!, index.get(to)!].sort((x, y) => x - y);
          setSelected(new Set(items.slice(a, b + 1).map((x) => x.key)));
        } else {
          setSelected(new Set([to]));
          setAnchor(to);
        }
        setFocus(to);
        scrollRef.current?.querySelector<HTMLElement>(`[data-key="${to}"]`)?.scrollIntoView({ block: "nearest" });
      };

      if (key === "/" && !mod) return run(() => searchRef.current?.focus());
      if (mod && key.toLowerCase() === "z") return run(() => !runUndo() && toast("Nothing to undo"));
      if (mod && key === "ArrowUp") return run(() => current && router.push(hrefFor({ view: "folder", folder: current.parentId })));
      if (mod && key.toLowerCase() === "a") return run(() => setSelected(new Set(items.map((i) => i.key))));
      if (mod && key.toLowerCase() === "x" && selCount && !trash) {
        return run(() => {
          setCut({ files: selFiles, folders: selFolders });
          toast(`Cut ${selCount} ${selCount === 1 ? "item" : "items"}. Open a folder and press ⌘V to move ${selCount === 1 ? "it" : "them"} there.`);
        });
      }
      if (mod && key.toLowerCase() === "v") return run(paste);
      if (mod) return;

      if (key === "Escape") {
        if (getCut()) setCut(null);
        return run(() => setSelected(new Set()));
      }
      if (key === "?") return run(() => setShortcuts(true));
      if (!items.length) return;

      if (key === "ArrowRight" || key === "ArrowLeft") {
        const i = focused ? index.get(focused.key)! : -1;
        return run(() => move(items[Math.min(items.length - 1, Math.max(0, i + (key === "ArrowRight" ? 1 : -1)))]?.key ?? null));
      }
      if (key === "ArrowDown" || key === "ArrowUp") {
        return run(() => {
          if (!focused) return move(items[0].key);
          const next =
            prefs.layout === "list" || !scrollRef.current
              ? items[Math.min(items.length - 1, Math.max(0, index.get(focused.key)! + (key === "ArrowDown" ? 1 : -1)))]?.key
              : spatialNext(scrollRef.current, focused.key, key === "ArrowDown" ? "down" : "up");
          move(next ?? null);
        });
      }
      if (key === "Home") return run(() => move(items[0].key));
      if (key === "End") return run(() => move(items[items.length - 1].key));
      if (key === "Enter" && focused) return run(() => open(focused));
      if (key === " " && (selFiles.length || focused?.type === "file")) return run(() => setLook(focused?.type === "file" ? focused.file.id : selFiles[0].id));
      if (key === "F2" && focused && !trash) return run(() => startRename(focused));
      if ((key === "Delete" || key === "Backspace") && selCount) return run(() => (trash ? purgeConfirm(selFiles) : trashSelection()));
      if (key === "Backspace" && !selCount && current) return run(() => router.push(hrefFor({ view: "folder", folder: current.parentId })));
      if (e.shiftKey && key === "N" && loc.view === "folder") return run(() => newFolder(current?.id ?? null, allFolders, "main"));
      if (key === "u" && !trash) return run(() => fileInput.current?.click());
      if (key === "v") return run(() => setPrefs((p) => ({ layout: p.layout === "grid" ? "list" : "grid" })));
      if (key === "i") return run(() => setPrefs((p) => ({ details: !p.details })));
      if (key === "s" && selFiles.length && !trash) return run(() => starFiles(selFiles.map((f) => f.id), !selFiles.every((f) => f.starred)));

      // Type a name to jump to it
      if (key.length === 1 && /\S/.test(key)) {
        const now = Date.now();
        const t = typeahead.current;
        t.text = now - t.at > 800 ? key.toLowerCase() : t.text + key.toLowerCase();
        t.at = now;
        const hit = items.find((it) => (it.type === "folder" ? it.folder.name : it.file.fileName).toLowerCase().startsWith(t.text));
        if (hit) run(() => move(hit.key));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Don't let a stray drop outside the browser open the file in the tab
  useEffect(() => {
    const stop = (e: DragEvent) => hasOsFiles(e) && e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  /* ---------- context menu ---------- */
  const targets = useMemo(() => moveTargets(allFolders, tree.children), [allFolders, tree]);
  const moveMenu = (files: BrowseFile[], folders: BrowseFolder[]) => {
    const here = files.length && !folders.length && files.every((f) => f.folderId === files[0].folderId) ? files[0].folderId : folders.length && !files.length ? folders[0].parentId : undefined;
    return (
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <FolderInput /> Move to
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-80 w-60 overflow-y-auto">
          <ContextMenuItem disabled={here === null} onSelect={() => moveItems({ files, folders }, { id: null, name: "All files" }, allFolders)}>
            <FolderTree /> All files (top level)
          </ContextMenuItem>
          {targets.length > 0 && <ContextMenuSeparator />}
          {targets.map(({ folder, depth }) => {
            const invalid = folder.id === here || folders.some((m) => isInside(allFolders, folder.id, m.id));
            return (
              <ContextMenuItem key={folder.id} disabled={invalid} onSelect={() => moveItems({ files, folders }, { id: folder.id, name: folder.name }, allFolders)} style={{ paddingLeft: 8 + depth * 14 }}>
                <FolderGlyph color={folder.color} size={14} />
                <span className="truncate">{folder.name}</span>
              </ContextMenuItem>
            );
          })}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={async () => {
              const made = await newFolder(current?.id ?? null, allFolders, "main");
              if (made) moveItems({ files, folders }, { id: made.id, name: made.name }, [...allFolders, { ...made, fileCount: 0, size: 0, createdAt: String(made.createdAt) }]);
            }}
          >
            <FolderPlus /> New folder…
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  const itemMenu = () => {
    const one = selFiles.length === 1 && !selFolders.length ? selFiles[0] : null;
    const oneFolder = selFolders.length === 1 && !selFiles.length ? selFolders[0] : null;
    const label = selCount > 1 ? `${selCount} items` : (one?.fileName ?? oneFolder?.name ?? "");
    if (trash) {
      return (
        <>
          <ContextMenuLabel>{label}</ContextMenuLabel>
          {one && (
            <ContextMenuItem onSelect={() => setLook(one.id)}>
              <Eye /> Preview <ContextMenuShortcut>Space</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={() => restoreFiles(selFiles.map((f) => f.id))}>
            <RotateCcw /> Restore
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => purgeConfirm(selFiles)}>
            <Trash2 /> Delete forever…
          </ContextMenuItem>
        </>
      );
    }
    if (oneFolder) {
      return (
        <>
          <ContextMenuLabel>{label}</ContextMenuLabel>
          <ContextMenuItem onSelect={() => router.push(hrefFor({ view: "folder", folder: oneFolder.id }))}>
            <FolderOpen /> Open <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setTimeout(() => setRenaming({ kind: "folder", id: oneFolder.id, surface: "main" }), 60)}>
            <Pencil /> Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette /> Colour
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-0 p-1">
              <ColorSwatches value={oneFolder.color} onPick={(c) => colorFolder(oneFolder, c)} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          {moveMenu([], [oneFolder])}
          <ContextMenuItem onSelect={() => setCut({ files: [], folders: [oneFolder] })}>
            <Scissors /> Cut <ContextMenuShortcut>⌘X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => deleteFolderConfirm(oneFolder)}>
            <Trash2 /> Delete folder…
          </ContextMenuItem>
        </>
      );
    }
    const allStarred = selFiles.length > 0 && selFiles.every((f) => f.starred);
    const mine = selFiles.filter((f) => f.mine);
    const anyPrivate = mine.some((f) => f.visibility === "private");
    return (
      <>
        <ContextMenuLabel>{label}</ContextMenuLabel>
        {one && (
          <>
            <ContextMenuItem onSelect={() => setLook(one.id)}>
              <Eye /> Preview <ContextMenuShortcut>Space</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openInNewTab(one.id).catch((e: Error) => toast.error(e.message))}>
              <ExternalLink /> Open in a new tab
            </ContextMenuItem>
          </>
        )}
        {selFiles.length > 0 && (
          <ContextMenuItem onSelect={() => downloadFiles(selFiles).catch((e: Error) => toast.error(e.message))}>
            <Download /> Download{selFiles.length > 1 ? ` ${selFiles.length} files` : ""}
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        {one && (
          <ContextMenuItem onSelect={() => setTimeout(() => setRenaming({ kind: "file", id: one.id, surface: "main" }), 60)}>
            <Pencil /> Rename <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {moveMenu(selFiles, selFolders)}
        <ContextMenuItem onSelect={() => setCut({ files: selFiles, folders: selFolders })}>
          <Scissors /> Cut <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        {selFiles.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setAttachIds(selFiles.map((f) => f.id))}>
              <Link2 /> Attach to a record…
            </ContextMenuItem>
            {selFiles.some((f) => f.record) && (
              <ContextMenuItem onSelect={() => detachFiles(selFiles.filter((f) => f.record))}>
                <Unlink /> Detach from record
              </ContextMenuItem>
            )}
            <ContextMenuItem onSelect={() => askTilly(selFiles)}>
              <TillyMark size={14} /> Ask Tilly to book {selFiles.length === 1 ? "it" : "them"}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => starFiles(selFiles.map((f) => f.id), !allStarred)}>
              {allStarred ? <StarOff /> : <Star />} {allStarred ? "Remove star" : "Star"} <ContextMenuShortcut>S</ContextMenuShortcut>
            </ContextMenuItem>
            {mine.length > 0 && (
              <ContextMenuItem onSelect={() => setVisibility(mine, anyPrivate ? "organization" : "private")}>
                {anyPrivate ? <Users /> : <Lock />} {anyPrivate ? "Share with the workspace" : "Make private"}
              </ContextMenuItem>
            )}
            {one && (
              <ContextMenuItem onSelect={() => copyLink(one)}>
                <Copy /> Copy link
              </ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={trashSelection}>
          <Trash2 /> {selFolders.length ? "Delete…" : "Move to Trash"} <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </>
    );
  };

  const backgroundMenu = () => (
    <>
      {loc.view === "folder" && (
        <>
          <ContextMenuItem onSelect={() => newFolder(current?.id ?? null, allFolders, "main")}>
            <FolderPlus /> New folder <ContextMenuShortcut>⇧N</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => fileInput.current?.click()}>
            <Upload /> Upload files <ContextMenuShortcut>U</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => folderInput.current?.click()}>
            <FolderUp /> Upload a folder
          </ContextMenuItem>
          {cut && (
            <ContextMenuItem onSelect={paste}>
              <ClipboardPaste /> Move {cut.files.length + cut.folders.length} {cut.files.length + cut.folders.length === 1 ? "item" : "items"} here <ContextMenuShortcut>⌘V</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <ArrowDownUp /> Sort by
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="w-44">
          {SORTS.map((s) => (
            <ContextMenuItem key={s.value} onSelect={() => setPrefs((p) => ({ sort: s.value, dir: p.sort === s.value ? (p.dir === "asc" ? "desc" : "asc") : s.value === "name" || s.value === "kind" ? "asc" : "desc" }))}>
              {s.label}
              {prefs.sort === s.value && <Check className="ml-auto" />}
            </ContextMenuItem>
          ))}
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onSelect={() => setPrefs({ layout: prefs.layout === "grid" ? "list" : "grid" })}>
        {prefs.layout === "grid" ? <List /> : <LayoutGrid />} {prefs.layout === "grid" ? "Show as list" : "Show as grid"} <ContextMenuShortcut>V</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem disabled={!items.length} onSelect={() => setSelected(new Set(items.map((i) => i.key)))}>
        <Check /> Select all <ContextMenuShortcut>⌘A</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );

  /* ---------- render ---------- */
  const emptyKind = !items.length
    ? kind !== "all" && data?.files.length
      ? "filtered"
      : loc.view === "folder" && !current
        ? "root"
        : loc.view
    : null;
  const totalBytes = fileItems.reduce((s, f) => s + f.fileSize, 0);
  const crumbs: { id: string | null; name: string; color?: string | null }[] = [
    { id: null, name: "All files" },
    ...path.map((f) => ({ id: f.id, name: f.name, color: f.color })),
  ];
  const mainOver = over?.startsWith("main:") ? byId.get(over.slice(5)) : null;
  const sortLabel = SORTS.find((s) => s.value === prefs.sort)?.label;

  const renderItem = (it: Item) => {
    const id = it.type === "folder" ? it.folder.id : it.file.id;
    const props = {
      item: it,
      selected: selected.has(it.key),
      focused: focus === it.key,
      cut: !!cut && (it.type === "folder" ? cut.folders.some((f) => f.id === id) : cut.files.some((f) => f.id === id)),
      dropping: over === `main:${id}`,
      renaming: renaming?.surface === "main" && renaming.kind === it.type && renaming.id === id,
      selecting: selCount > 0,
      trash,
      where: loc.view === "search" ? (it.type === "folder" ? pathOf(it.folder.parentId) : pathOf(it.file.folderId)) : undefined,
      total: it.type === "folder" ? tree.total.get(id) : undefined,
      bytes: it.type === "folder" ? tree.bytes.get(id) : undefined,
      onRename: (name: string | null) => {
        setRenaming(null);
        if (!name) return;
        if (it.type === "folder") renameFolder(it.folder, name);
        else renameFile(it.file, name);
      },
      onToggle: () => toggle(it),
      handlers: handlersFor(it),
    };
    if (prefs.layout === "list") return <ListRow key={it.key} {...props} />;
    return it.type === "folder" ? <FolderTile key={it.key} {...props} /> : <FileCard key={it.key} {...props} />;
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (!getDrag() && hasOsFiles(e) && !trash) setOsDrag(true);
      }}
      onDragOver={(e) => {
        if (!getDrag() && hasOsFiles(e) && !trash) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOsDrag(false);
      }}
      onDrop={async (e) => {
        setOsDrag(false);
        if (getDrag() || !hasOsFiles(e) || trash) return;
        e.preventDefault();
        upload(await filesFromDrop(e.dataTransfer));
      }}
    >
      {/* Header: where you are, search, new */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => setFoldersSheet(true)}
          className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground lg:hidden"
          aria-label="Folders"
        >
          <FolderTree className="size-4" />
        </button>
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center gap-0.5 text-[15px]">
          {loc.view === "folder" ? (
            crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const key = `crumb:${c.id ?? "root"}`;
              const hidden = crumbs.length > 4 && i > 0 && i < crumbs.length - 2;
              if (hidden) return i === 1 ? <span key="more" className="px-1 text-muted-foreground">…</span> : null;
              return (
                <span key={key} className="flex min-w-0 items-center gap-0.5">
                  {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />}
                  <button
                    type="button"
                    onClick={() => !last && router.push(hrefFor({ view: "folder", folder: c.id }))}
                    {...dropTarget(key, {
                      canDrop: (p) => !p.folders.some((m) => c.id && isInside(allFolders, c.id, m.id)),
                      onItems: (p) => moveItems(p, { id: c.id, name: c.name }, allFolders),
                      onFiles: (picked) => enqueue(picked, c.id, c.id ? c.name : null),
                    })}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 truncate rounded-md px-1.5 py-1 tracking-[-0.01em] transition-colors",
                      last ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                      over === key && "bg-foreground/[0.08] text-foreground ring-1 ring-foreground/25"
                    )}
                  >
                    {c.color && <FolderGlyph color={c.color} size={15} />}
                    <span className="truncate">{c.name}</span>
                  </button>
                </span>
              );
            })
          ) : (
            <span className="flex min-w-0 items-center gap-1.5 px-1.5 font-semibold tracking-[-0.01em]">
              {loc.view === "record" && (
                <>
                  <span className="font-normal text-muted-foreground">Attached</span>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                </>
              )}
              {loc.view === "search" && <span className="font-normal text-muted-foreground">Search</span>}
              <span className="truncate">{title}</span>
            </span>
          )}
          {entry.loading && data && <span className="ml-2 size-1.5 shrink-0 animate-pulse rounded-full bg-foreground/40" aria-label="Refreshing" />}
        </nav>

        <div className="relative hidden w-56 sm:block md:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={text}
            onFocus={() => !loc.q && setSearchFrom(loc)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setText("");
                e.currentTarget.blur();
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                e.currentTarget.blur();
                if (items[0]) selectOnly(items[0].key);
                scrollRef.current?.focus();
              }
            }}
            placeholder="Search all files"
            aria-label="Search all files"
            className="h-8 w-full rounded-lg border border-border/80 bg-transparent pl-8 pr-8 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground/30 focus:bg-background"
          />
          {text ? (
            <button type="button" aria-label="Clear search" onClick={() => setText("")} className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90">
              <Plus className="size-3.5" /> New
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
              <Upload /> Upload files <Kbd className="ml-auto">U</Kbd>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
              <FolderUp /> Upload a folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (loc.view !== "folder") router.push(hrefFor({ view: "folder", folder: null }));
                newFolder(loc.view === "folder" ? (current?.id ?? null) : null, allFolders, "main");
              }}
            >
              <FolderPlus /> New folder <Kbd className="ml-auto">⇧N</Kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => (upload(filesFromInput(e.target.files)), (e.target.value = ""))} />
        <input
          ref={(el) => {
            folderInput.current = el;
            el?.setAttribute("webkitdirectory", "");
          }}
          type="file"
          hidden
          onChange={(e) => (upload(filesFromInput(e.target.files)), (e.target.value = ""))}
        />
      </div>

      <div className="relative px-4 pt-3 sm:hidden">
        <Search className="pointer-events-none absolute left-6.5 top-1/2 mt-1.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={text}
          onFocus={() => !loc.q && setSearchFrom(loc)}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search all files"
          aria-label="Search all files"
          className="h-9 w-full rounded-lg border border-border/80 bg-transparent pl-8 pr-3 text-[14px] outline-none placeholder:text-muted-foreground/70 focus:border-foreground/30"
        />
      </div>

      {/* Toolbar: kind filter, sort, layout */}
      <div className="flex h-11 shrink-0 items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none" role="tablist" aria-label="Kind">
          {KIND_FILTERS.filter((k) => k.value === "all" || kindCounts[k.value]).map((k) => (
            <button
              key={k.value}
              type="button"
              role="tab"
              aria-selected={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                kind === k.value ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
              )}
            >
              {k.label}
              {k.value !== "all" && <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">{kindCounts[k.value]}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="mr-2 hidden text-[12px] tabular-nums text-muted-foreground md:block">
            {data ? `${(folderItems.length + fileItems.length).toLocaleString()} ${folderItems.length + fileItems.length === 1 ? "item" : "items"}${totalBytes ? ` · ${formatBytes(totalBytes)}` : ""}` : ""}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground">
                <ArrowDownUp className="size-3.5" /> <span className="hidden sm:inline">{sortLabel}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="text-[11.5px] font-normal text-muted-foreground">Sort by</DropdownMenuLabel>
              {SORTS.map((s) => (
                <DropdownMenuItem key={s.value} onSelect={() => setPrefs({ sort: s.value, dir: s.value === "name" || s.value === "kind" ? "asc" : "desc" })}>
                  {s.label}
                  {prefs.sort === s.value && <Check className="ml-auto" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPrefs({ dir: "asc" })}>
                {prefs.sort === "modified" ? "Oldest first" : prefs.sort === "size" ? "Smallest first" : "A to Z"}
                {prefs.dir === "asc" && <Check className="ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPrefs({ dir: "desc" })}>
                {prefs.sort === "modified" ? "Newest first" : prefs.sort === "size" ? "Largest first" : "Z to A"}
                {prefs.dir === "desc" && <Check className="ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center rounded-md p-0.5" role="radiogroup" aria-label="Layout">
            {(["grid", "list"] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={prefs.layout === l}
                aria-label={l === "grid" ? "Grid" : "List"}
                title={`${l === "grid" ? "Grid" : "List"} (V)`}
                onClick={() => setPrefs({ layout: l })}
                className={cn("flex size-7 items-center justify-center rounded-md transition-colors", prefs.layout === l ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {l === "grid" ? <LayoutGrid className="size-3.5" /> : <List className="size-3.5" />}
              </button>
            ))}
          </div>
          <button
            type="button"
            title="Details (I)"
            aria-label="Details"
            aria-pressed={prefs.details}
            onClick={() => setPrefs({ details: !prefs.details })}
            className={cn("hidden size-7 items-center justify-center rounded-md transition-colors xl:flex", prefs.details ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <PanelRight className="size-3.5" />
          </button>
          <button type="button" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setShortcuts(true)} className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:flex">
            <Keyboard className="size-3.5" />
          </button>
        </div>
      </div>

      {trash && (data?.files.length ?? 0) > 0 && (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg bg-foreground/[0.035] px-3 py-2 text-[12.5px] sm:mx-6">
          <Trash2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-foreground/80">Files in Trash are deleted for good after 30 days.</span>
          <button type="button" onClick={() => purgeConfirm(data!.files)} className="shrink-0 font-medium text-red-600 hover:underline">
            Empty Trash
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={scrollRef}
              tabIndex={-1}
              role="listbox"
              aria-multiselectable
              aria-label={title}
              onMouseDown={onMouseDown}
              onContextMenu={(e) => {
                if (!(e.target as HTMLElement).closest("[data-key]")) {
                  setSelected(new Set());
                  setMenuOn("background");
                }
              }}
              className="relative min-h-0 flex-1 overflow-y-auto outline-none"
            >
              <div ref={contentRef} className="relative min-h-full px-4 pb-28 pt-1 sm:px-6">
                {!data ? (
                  entry.error ? (
                    <div className="py-20 text-center text-[13px] text-muted-foreground">{entry.error}</div>
                  ) : (
                    <div className={cn(prefs.layout === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3" : "space-y-1")}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className={cn("animate-pulse rounded-xl bg-foreground/[0.04]", prefs.layout === "grid" ? "aspect-[4/3.9]" : "h-11")} style={{ animationDelay: `${i * 60}ms` }} />
                      ))}
                    </div>
                  )
                ) : emptyKind ? (
                  <EmptyState kind={emptyKind} onUpload={() => fileInput.current?.click()} onNewFolder={() => newFolder(current?.id ?? null, allFolders, "main")} />
                ) : prefs.layout === "list" ? (
                  <>
                    <div className={cn("sticky top-0 z-10 grid h-9 items-center gap-4 border-b border-border/60 bg-content-bg px-2 text-[11.5px] font-medium text-muted-foreground", LIST_COLS)} data-no-marquee>
                      {[
                        { label: "Name", sort: "name" as SortKey, className: "pl-[54px]" },
                        { label: trash ? "Time left" : loc.view === "search" ? "Folder" : "Attached to", className: "hidden sm:block" },
                        { label: "Added by", className: "hidden xl:block" },
                        { label: trash ? "Deleted" : "Added", sort: "modified" as SortKey, className: "hidden sm:block" },
                        { label: "Size", sort: "size" as SortKey, className: "text-right" },
                      ].map((c) =>
                        c.sort ? (
                          <button
                            key={c.label}
                            type="button"
                            onClick={() => setPrefs((p) => ({ sort: c.sort!, dir: p.sort === c.sort ? (p.dir === "asc" ? "desc" : "asc") : c.sort === "name" ? "asc" : "desc" }))}
                            className={cn("truncate text-left hover:text-foreground", c.className, prefs.sort === c.sort && "text-foreground")}
                          >
                            {c.label}
                            {prefs.sort === c.sort && <span className="ml-1">{prefs.dir === "asc" ? "↑" : "↓"}</span>}
                          </button>
                        ) : (
                          <span key={c.label} className={cn("truncate", c.className)}>
                            {c.label}
                          </span>
                        )
                      )}
                    </div>
                    <div className="pt-1">{items.map(renderItem)}</div>
                  </>
                ) : (
                  <>
                    {folderItems.length > 0 && (
                      <section aria-label="Folders" className="mb-6">
                        <p className="mb-2 text-[12px] text-muted-foreground/80">Folders</p>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">{items.filter((i) => i.type === "folder").map(renderItem)}</div>
                      </section>
                    )}
                    {fileItems.length > 0 && (
                      <section aria-label="Files">
                        {folderItems.length > 0 && <p className="mb-2 text-[12px] text-muted-foreground/80">Files</p>}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-2 gap-y-3">{items.filter((i) => i.type === "file").map(renderItem)}</div>
                      </section>
                    )}
                  </>
                )}
                {data?.truncated && <p className="py-6 text-center text-[12px] text-muted-foreground">Showing the newest 2,000 files. Search or open a folder to find older ones.</p>}
                {box && <div className="pointer-events-none absolute z-20 rounded-[3px] border border-foreground/30 bg-foreground/[0.06]" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />}
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-60">{menuOn === "items" && selCount ? itemMenu() : backgroundMenu()}</ContextMenuContent>
        </ContextMenu>
      {/* Floating action bar for the selection */}
      <AnimatePresence>
        {selCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 14, x: "-50%" }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            className="absolute bottom-5 left-1/2 z-30 flex max-w-[calc(100%-2rem)] items-center gap-0.5 overflow-x-auto rounded-xl border border-border/80 bg-popover p-1 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.4)] scrollbar-none"
            data-no-marquee
          >
            <span className="shrink-0 px-2.5 text-[12.5px] font-medium tabular-nums">{selCount} selected</span>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
            {trash ? (
              <>
                <BarButton onClick={() => restoreFiles(selFiles.map((f) => f.id)).then(() => setSelected(new Set()))}>
                  <RotateCcw className="size-3.5" /> Restore
                </BarButton>
                <BarButton danger onClick={() => purgeConfirm(selFiles)}>
                  <Trash2 className="size-3.5" /> Delete forever
                </BarButton>
              </>
            ) : (
              <>
                {selFiles.length === 1 && !selFolders.length && (
                  <BarButton onClick={() => setLook(selFiles[0].id)}>
                    <Eye className="size-3.5" /> Preview
                  </BarButton>
                )}
                {selFiles.length > 0 && (
                  <BarButton onClick={() => downloadFiles(selFiles).catch((e: Error) => toast.error(e.message))}>
                    <Download className="size-3.5" /> Download
                  </BarButton>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-foreground/[0.05]">
                      <FolderInput className="size-3.5" /> Move
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" side="top" className="max-h-80 w-60 overflow-y-auto">
                    <DropdownMenuItem onSelect={() => moveItems({ files: selFiles, folders: selFolders }, { id: null, name: "All files" }, allFolders)}>
                      <FolderTree /> All files (top level)
                    </DropdownMenuItem>
                    {targets.length > 0 && <DropdownMenuSeparator />}
                    {targets.map(({ folder, depth }) => (
                      <DropdownMenuItem
                        key={folder.id}
                        disabled={selFolders.some((m) => isInside(allFolders, folder.id, m.id))}
                        onSelect={() => moveItems({ files: selFiles, folders: selFolders }, { id: folder.id, name: folder.name }, allFolders)}
                        style={{ paddingLeft: 8 + depth * 14 }}
                      >
                        <FolderGlyph color={folder.color} size={14} />
                        <span className="truncate">{folder.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {selFiles.length > 0 && (
                  <>
                    <BarButton onClick={() => setAttachIds(selFiles.map((f) => f.id))}>
                      <Link2 className="size-3.5" /> Attach
                    </BarButton>
                    <BarButton onClick={() => starFiles(selFiles.map((f) => f.id), !selFiles.every((f) => f.starred))}>
                      <Star className={cn("size-3.5", selFiles.every((f) => f.starred) && "fill-amber-400 text-amber-400")} /> {selFiles.every((f) => f.starred) ? "Unstar" : "Star"}
                    </BarButton>
                    <button
                      type="button"
                      onClick={() => askTilly(selFiles)}
                      className="tilly-hover inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-tilly-50 px-2.5 text-[13px] font-medium text-tilly-700 transition-colors hover:bg-tilly-100 dark:bg-tilly-700/15 dark:text-tilly-400"
                    >
                      <TillyMark size={15} /> Ask Tilly
                    </button>
                  </>
                )}
                <BarButton danger onClick={trashSelection}>
                  <Trash2 className="size-3.5" /> {selFolders.length ? "Delete" : "Trash"}
                </BarButton>
              </>
            )}
            <button type="button" aria-label="Clear selection" onClick={() => setSelected(new Set())} className="ml-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

        </div>

        {prefs.details && (
          <DetailsPane
            files={selFiles}
            folders={selFolders}
            place={{ title, folder: current }}
            placeStats={{ files: fileItems.length, folders: folderItems.length, bytes: totalBytes }}
            pathOf={pathOf}
            onPreview={(f) => setLook(f.id)}
            onAttach={(fs) => setAttachIds(fs.map((f) => f.id))}
            onClose={() => setPrefs({ details: false })}
          />
        )}
      </div>

      <UploadPanel />
      <DropOverlay show={osDrag} target={mainOver?.name ?? uploadTarget.name} />
      <QuickLook files={fileItems} id={look} onChange={setLook} onClose={closeLook} onAttach={(f) => setAttachIds([f.id])} />
      <AttachDialog ids={attachIds} onClose={() => setAttachIds(null)} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <Sheet open={foldersSheet} onOpenChange={setFoldersSheet}>
        <SheetContent side="left" className="w-[290px] gap-0 bg-shell p-0 pt-4">
          <SheetTitle className="px-5 pb-3 text-[14px]">Documents</SheetTitle>
          <DocumentsSidebar className="min-h-0 flex-1 px-2.5" onNavigate={() => setFoldersSheet(false)} />
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </div>
  );
}

function BarButton({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        danger ? "text-red-600 hover:bg-red-500/10" : "hover:bg-foreground/[0.05]"
      )}
    >
      {children}
    </button>
  );
}
