"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Clock, Files, FolderPlus, Inbox, Lock, Paperclip, Pencil, Plus, Send, Star, Trash2, FolderOpen, Palette } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";
import type { BrowseFolder, ViewCounts } from "./api";
import { dropTarget, endDrag, startDrag } from "./dnd";
import { FolderGlyph } from "./glyphs";
import { colorFolder, isInside, moveItems, newFolder, removeFolder, renameFolder, setVisibility, starFiles, trashFiles } from "./ops";
import { ColorSwatches, RenameInput, StorageMeter } from "./parts";
import { hrefFor, parseLoc, setRenaming, toggleExpanded, useBrowse, useLatest, usePrefs, useUi, type Loc } from "./store";
import { enqueue } from "./uploads";

/** Where the browser is pointed, read from the URL. */
export function useLoc() {
  const params = useSearchParams();
  const pathname = usePathname();
  const onBrowser = pathname === "/documents";
  const loc = useMemo(() => parseLoc(onBrowser ? params : null), [onBrowser, params]);
  return { loc, onBrowser };
}

/** Folders keyed by parent, sorted by name. */
export function folderTree(folders: BrowseFolder[]) {
  const children = new Map<string | null, BrowseFolder[]>();
  for (const f of folders) children.set(f.parentId, [...(children.get(f.parentId) ?? []), f]);
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  // Folders whose parent was deleted show at the top level
  const ids = new Set(folders.map((f) => f.id));
  for (const [parent, list] of [...children]) {
    if (parent && !ids.has(parent)) {
      children.set(null, [...(children.get(null) ?? []), ...list]);
      children.delete(parent);
    }
  }
  const total = new Map<string, number>();
  const bytes = new Map<string, number>();
  const seen = new Set<string>();
  const count = (f: BrowseFolder): [number, number] => {
    if (seen.has(f.id)) return [0, 0];
    seen.add(f.id);
    let n = f.fileCount;
    let b = f.size;
    for (const c of children.get(f.id) ?? []) {
      const [cn, cb] = count(c);
      n += cn;
      b += cb;
    }
    total.set(f.id, n);
    bytes.set(f.id, b);
    return [n, b];
  };
  for (const f of children.get(null) ?? []) count(f);
  return { children, total, bytes };
}

/** "Clients / Acme / 2026" for a folder id. */
export function folderPath(folders: BrowseFolder[], id: string | null) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: BrowseFolder[] = [];
  for (let cur = id ? byId.get(id) : undefined, guard = 0; cur && guard < 64; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard++) {
    path.unshift(cur);
  }
  return path;
}

interface QuickView {
  key: keyof ViewCounts | "folder";
  view: Loc["view"];
  label: string;
  icon: typeof Files;
  hint: string;
}

export const QUICK_VIEWS: QuickView[] = [
  { key: "all", view: "folder", label: "All files", icon: Files, hint: "Every folder and file in the workspace" },
  { key: "recent", view: "recent", label: "Recent", icon: Clock, hint: "Added in the last 30 days" },
  { key: "starred", view: "starred", label: "Starred", icon: Star, hint: "Files you starred. Drop files here to star them" },
  { key: "unlinked", view: "unlinked", label: "Not attached", icon: Inbox, hint: "Files that aren't attached to a record yet" },
  { key: "linked", view: "linked", label: "Attached", icon: Paperclip, hint: "Files attached to an invoice, bill, expense or other record" },
  { key: "private", view: "private", label: "Only me", icon: Lock, hint: "Your private files. Drop your files here to make them private" },
  { key: "trash", view: "trash", label: "Trash", icon: Trash2, hint: "Deleted files stay here for 30 days. Drop files here to delete them" },
];

const pluralLabel = (l: string) => (l.endsWith("y") ? `${l.slice(0, -1)}ies` : l.endsWith("s") ? l : `${l}s`);

const row =
  "group/row relative flex h-8 w-full items-center gap-2 rounded-[7px] px-2.5 text-[13.5px] tracking-[-0.005em] transition-colors";
const rowIdle = "text-foreground/65 hover:bg-foreground/[0.035] hover:text-foreground";
const rowActive = "bg-foreground/[0.055] font-medium text-foreground";
const rowDrop = "bg-foreground/[0.08] text-foreground ring-1 ring-inset ring-foreground/25";

const Count = ({ n }: { n: number | undefined }) =>
  n ? <span className="ml-auto pl-2 font-mono text-[11.5px] tabular-nums text-muted-foreground/70">{n.toLocaleString()}</span> : null;

export function DocumentsSidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loc, onBrowser } = useLoc();
  // On other Documents pages, load something light just for the tree and counts
  useBrowse(onBrowser ? loc : { view: "recent", folder: null, type: null, q: "" });
  const data = useLatest();
  const { expanded } = usePrefs();
  const { renaming, dropTarget: over } = useUi();
  const { confirm, dialog } = useConfirm();
  const [menuFolder, setMenuFolder] = useState<BrowseFolder | null>(null);

  const folders = useMemo(() => data?.folders ?? [], [data]);
  const tree = useMemo(() => folderTree(folders), [folders]);
  const activePath = useMemo(() => new Set(folderPath(folders, loc.view === "folder" ? loc.folder : null).map((f) => f.id)), [folders, loc]);

  const go = (href: string) => {
    router.push(href);
    onNavigate?.();
  };
  const isActive = (v: Partial<Loc>) =>
    onBrowser && !loc.q && loc.view === v.view && (v.view !== "folder" || (loc.folder ?? null) === (v.folder ?? null)) && (v.view !== "record" || loc.type === v.type);

  const quickDrop = (v: QuickView) => {
    const key = `quick:${v.key}`;
    if (v.view === "folder") return dropTarget(key, { onItems: (p) => moveItems(p, { id: null, name: "All files" }, folders), onFiles: (f) => enqueue(f, null, null) });
    if (v.view === "starred") return dropTarget(key, { canDrop: (p) => p.files.length > 0, onItems: (p) => starFiles(p.files.map((f) => f.id), true) });
    if (v.view === "private") return dropTarget(key, { canDrop: (p) => p.files.some((f) => f.mine), onItems: (p) => setVisibility(p.files, "private") });
    if (v.view === "trash") return dropTarget(key, { canDrop: (p) => p.files.length > 0 && !p.folders.length, onItems: (p) => trashFiles(p.files) });
    return {};
  };

  async function deleteWithConfirm(folder: BrowseFolder) {
    const files = tree.total.get(folder.id) ?? 0;
    const subs = (tree.children.get(folder.id) ?? []).length;
    const ok = await confirm({
      title: `Delete “${folder.name}”?`,
      description: [
        subs ? `Its subfolders are deleted too.` : null,
        files ? `The ${files === 1 ? "file" : `${files} files`} inside move${files === 1 ? "s" : ""} to Trash, where you can restore them for 30 days.` : "It's empty.",
      ]
        .filter(Boolean)
        .join(" "),
      confirmLabel: "Delete folder",
      destructive: true,
    });
    if (!ok) return;
    if (onBrowser && loc.view === "folder" && loc.folder && isInside(folders, loc.folder, folder.id)) go(hrefFor({ view: "folder", folder: folder.parentId }));
    removeFolder(folder);
  }

  const renderFolder = (folder: BrowseFolder, depth: number): React.ReactNode => {
    const kids = tree.children.get(folder.id) ?? [];
    const open = expanded.includes(folder.id) || (activePath.has(folder.id) && loc.folder !== folder.id);
    const active = isActive({ view: "folder", folder: folder.id });
    const key = `tree:${folder.id}`;
    const editing = renaming?.kind === "folder" && renaming.id === folder.id && renaming.surface === "tree";
    return (
      <div key={folder.id} role="treeitem" aria-expanded={kids.length ? open : undefined} aria-selected={active}>
        <div
          draggable={!editing}
          onDragStart={(e) => startDrag(e, { files: [], folders: [folder] })}
          onDragEnd={endDrag}
          {...dropTarget(key, {
            canDrop: (p) => !p.folders.some((f) => isInside(folders, folder.id, f.id)),
            onItems: (p) => moveItems(p, { id: folder.id, name: folder.name }, folders),
            onFiles: (f) => enqueue(f, folder.id, folder.name),
            onLinger: () => kids.length && toggleExpanded(folder.id, true),
          })}
          onContextMenu={() => setMenuFolder(folder)}
          onClick={() => !editing && go(hrefFor({ view: "folder", folder: folder.id }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") go(hrefFor({ view: "folder", folder: folder.id }));
            if (e.key === "F2") setRenaming({ kind: "folder", id: folder.id, surface: "tree" });
          }}
          tabIndex={0}
          title={folder.name}
          className={cn(
            row,
            "cursor-default pr-2 outline-none focus-visible:ring-2 focus-visible:ring-foreground/15",
            over === key ? rowDrop : active ? rowActive : menuFolder?.id === folder.id ? "bg-foreground/[0.045] text-foreground" : rowIdle
          )}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(folder.id, !open);
            }}
            className={cn("flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground", !kids.length && "invisible")}
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} />
          </button>
          <FolderGlyph color={folder.color} size={16} open={active} />
          {editing ? (
            <RenameInput
              value={folder.name}
              onDone={(name) => {
                setRenaming(null);
                if (name) renameFolder(folder, name);
              }}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          )}
          {!editing && <Count n={tree.total.get(folder.id)} />}
        </div>
        {open && kids.length > 0 && <div role="group">{kids.map((k) => renderFolder(k, depth + 1))}</div>}
      </div>
    );
  };

  const roots = tree.children.get(null) ?? [];

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-none">
        <div className="flex flex-col gap-px">
          {QUICK_VIEWS.map((v) => {
            const Icon = v.icon;
            const href = hrefFor({ view: v.view });
            const key = `quick:${v.key}`;
            const n = v.key === "folder" ? undefined : data?.counts[v.key as keyof ViewCounts];
            return (
              <Link
                key={v.key}
                href={href}
                onClick={onNavigate}
                title={v.hint}
                aria-current={isActive({ view: v.view }) ? "page" : undefined}
                {...quickDrop(v)}
                className={cn(row, over === key ? rowDrop : isActive({ view: v.view }) ? rowActive : rowIdle)}
              >
                <Icon className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
                <span className="flex-1 truncate">{v.label}</span>
                {v.key !== "trash" && v.key !== "all" && <Count n={n} />}
                {v.key === "trash" && !!n && <span className="ml-auto font-mono text-[11.5px] tabular-nums text-muted-foreground/60">{n}</span>}
              </Link>
            );
          })}
        </div>

        <div className="mt-5">
          <div className="group/head flex items-center justify-between px-2.5 pb-1.5">
            <p className="text-[12px] text-muted-foreground/75">Folders</p>
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() => newFolder(null, folders, "tree")}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <ContextMenu onOpenChange={(o) => !o && setTimeout(() => setMenuFolder(null), 150)}>
            <ContextMenuTrigger asChild>
              <div role="tree" aria-label="Folders" className="flex flex-col gap-px">
                {!data ? (
                  [0, 1, 2].map((i) => <div key={i} className="mx-2.5 my-1.5 h-5 animate-pulse rounded bg-foreground/[0.05]" style={{ width: `${70 - i * 15}%` }} />)
                ) : roots.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => newFolder(null, folders, "tree")}
                    className={cn(row, rowIdle, "text-muted-foreground")}
                  >
                    <FolderPlus className="size-[15px]" strokeWidth={1.75} />
                    Make your first folder
                  </button>
                ) : (
                  roots.map((f) => renderFolder(f, 0))
                )}
              </div>
            </ContextMenuTrigger>
            {menuFolder && (
              <ContextMenuContent className="w-52">
                <ContextMenuItem onSelect={() => go(hrefFor({ view: "folder", folder: menuFolder.id }))}>
                  <FolderOpen /> Open
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    toggleExpanded(menuFolder.id, true);
                    newFolder(menuFolder.id, folders, "tree");
                  }}
                >
                  <FolderPlus /> New folder inside
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => setTimeout(() => setRenaming({ kind: "folder", id: menuFolder.id, surface: "tree" }), 60)}>
                  <Pencil /> Rename
                </ContextMenuItem>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Palette /> Colour
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent className="min-w-0 p-1">
                    <ColorSwatches value={menuFolder.color} onPick={(c) => colorFolder(menuFolder, c)} />
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => deleteWithConfirm(menuFolder)}>
                  <Trash2 /> Delete folder…
                </ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
        </div>

        {data && data.byRecord.length > 0 && (
          <div className="mt-5">
            <p className="px-2.5 pb-1.5 text-[12px] text-muted-foreground/75">Attached to</p>
            <div className="flex flex-col gap-px">
              {data.byRecord.map((r) => {
                const active = isActive({ view: "record", type: r.type });
                return (
                  <Link
                    key={r.type}
                    href={hrefFor({ view: "record", type: r.type })}
                    onClick={onNavigate}
                    className={cn(row, active ? rowActive : rowIdle)}
                  >
                    <Paperclip className="size-[15px] shrink-0 opacity-60" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{pluralLabel(r.label)}</span>
                    <Count n={r.count} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="px-2.5 pb-1.5 text-[12px] text-muted-foreground/75">Email</p>
          <Link
            href="/documents/emails"
            onClick={onNavigate}
            aria-current={pathname === "/documents/emails" ? "page" : undefined}
            className={cn(row, pathname === "/documents/emails" ? rowActive : rowIdle)}
            title="Every invoice, quote and other document emailed from dubbl, with delivery status"
          >
            <Send className="size-[15px] shrink-0 opacity-80" strokeWidth={1.75} />
            <span className="flex-1 truncate">Sent emails</span>
          </Link>
        </div>
      </div>
      {data && <StorageMeter used={data.storage.usedBytes} max={data.storage.maxBytes} className="shrink-0 border-t border-border/60 pb-3 pt-3" />}
      {dialog}
    </div>
  );
}
