"use client";

import { memo, useState } from "react";
import { Check, Lock, Paperclip, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrowseFile, BrowseFolder } from "./api";
import { FileGlyph, FolderGlyph, KIND_LABEL, formatBytes, kindOf, relativeDay } from "./glyphs";
import { RenameInput } from "./parts";

export type Item = { key: string; type: "folder"; folder: BrowseFolder } | { key: string; type: "file"; file: BrowseFile };

export interface ItemProps {
  item: Item;
  selected: boolean;
  focused: boolean;
  cut: boolean;
  dropping: boolean;
  renaming: boolean;
  /** Something is selected, so checkboxes stay visible. */
  selecting: boolean;
  trash: boolean;
  /** Folder path shown in search results. */
  where?: string | null;
  /** Total files in a folder, subfolders included. */
  total?: number;
  /** Bytes in a folder, subfolders included. */
  bytes?: number;
  onRename: (name: string | null) => void;
  onToggle: () => void;
  handlers: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean };
}

const daysLeft = (deletedAt: string | null) => {
  if (!deletedAt) return null;
  const left = 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000);
  return Math.max(0, left);
};

function Thumb({ file, size }: { file: BrowseFile; size: number }) {
  const [failed, setFailed] = useState(false);
  if (file.thumbUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, not optimisable
      <img
        src={file.thumbUrl}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    );
  }
  return <FileGlyph mime={file.mimeType} name={file.fileName} size={size} />;
}

function Checkbox({ checked, visible, onToggle, className }: { checked: boolean; visible: boolean; onToggle: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Deselect" : "Select"}
      tabIndex={-1}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex size-[18px] items-center justify-center rounded-[5px] border transition-all",
        checked ? "border-foreground bg-foreground text-background" : "border-foreground/25 bg-background/90 text-transparent hover:border-foreground/50",
        visible || checked ? "opacity-100" : "opacity-0 group-hover/item:opacity-100",
        className
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}

const stateClass = (p: Pick<ItemProps, "selected" | "dropping" | "cut">) =>
  cn(
    p.dropping
      ? "bg-foreground/[0.08] ring-2 ring-foreground/30"
      : p.selected
        ? "bg-foreground/[0.065] border-foreground/[0.1]"
        : "hover:bg-foreground/[0.025]",
    p.cut && "opacity-45"
  );

const focusRing = "outline-none data-[focused=true]:ring-2 data-[focused=true]:ring-foreground/20";

/* ------------------------------------------------------------------ */
/*  Grid                                                                */
/* ------------------------------------------------------------------ */

export const FolderTile = memo(function FolderTile(p: ItemProps) {
  if (p.item.type !== "folder") return null;
  const f = p.item.folder;
  return (
    <div
      data-key={p.item.key}
      data-focused={p.focused}
      aria-selected={p.selected}
      role="option"
      title={f.name}
      {...p.handlers}
      className={cn("group/item relative flex h-[54px] cursor-default select-none items-center gap-3 rounded-xl border border-border/70 px-3 transition-colors", focusRing, stateClass(p))}
    >
      <FolderGlyph color={f.color} size={24} open={p.dropping} />
      <div className="min-w-0 flex-1">
        {p.renaming ? (
          <RenameInput value={f.name} onDone={p.onRename} />
        ) : (
          <p className="truncate text-[13.5px] font-medium tracking-[-0.005em]">{f.name}</p>
        )}
        <p className="truncate text-[11.5px] text-muted-foreground">
          {p.where ? `in ${p.where}` : p.total ? `${p.total.toLocaleString()} ${p.total === 1 ? "file" : "files"}` : "Empty"}
        </p>
      </div>
      <Checkbox checked={p.selected} visible={p.selecting} onToggle={p.onToggle} className="shrink-0" />
    </div>
  );
});

export const FileCard = memo(function FileCard(p: ItemProps) {
  if (p.item.type !== "file") return null;
  const f = p.item.file;
  const kind = kindOf(f.mimeType, f.fileName);
  const left = p.trash ? daysLeft(f.deletedAt) : null;
  return (
    <div
      data-key={p.item.key}
      data-focused={p.focused}
      aria-selected={p.selected}
      role="option"
      title={f.fileName}
      {...p.handlers}
      className={cn("group/item relative flex cursor-default select-none flex-col rounded-xl border border-transparent p-1.5 transition-colors", focusRing, stateClass(p))}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[9px] border border-border/60 bg-foreground/[0.025]">
        <Thumb file={f} size={52} />
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          {f.visibility === "private" && (
            <span title="Only you can see this" className="flex size-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm">
              <Lock className="size-3" />
            </span>
          )}
          {f.starred && (
            <span title="Starred" className="flex size-5 items-center justify-center rounded-md bg-background/90 text-amber-500 shadow-sm">
              <Star className="size-3 fill-current" />
            </span>
          )}
        </div>
        {f.record && (
          <span
            title={`Attached to ${f.record.kind.toLowerCase()}${f.record.label ? ` ${f.record.label}` : ""}`}
            className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded-md bg-background/95 px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/75 shadow-sm"
          >
            <Paperclip className="size-2.5 shrink-0" />
            <span className="truncate">{f.record.label ?? f.record.kind}</span>
          </span>
        )}
        <Checkbox checked={p.selected} visible={p.selecting} onToggle={p.onToggle} className="absolute left-1.5 top-1.5" />
      </div>
      <div className="px-1 pb-0.5 pt-2">
        {p.renaming ? (
          <RenameInput value={f.fileName} onDone={p.onRename} />
        ) : (
          <p className="truncate text-[13px] font-medium leading-5 tracking-[-0.005em]">{f.fileName}</p>
        )}
        <p className="truncate text-[11.5px] leading-4 text-muted-foreground">
          {left != null
            ? `${left === 0 ? "Deleted today for good" : `${left} ${left === 1 ? "day" : "days"} left`} · ${formatBytes(f.fileSize)}`
            : p.where
              ? `${p.where} · ${formatBytes(f.fileSize)}`
              : `${KIND_LABEL[kind]} · ${formatBytes(f.fileSize)} · ${relativeDay(f.createdAt)}`}
        </p>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  List                                                                */
/* ------------------------------------------------------------------ */

export const LIST_COLS = "grid-cols-[minmax(0,1fr)_64px] sm:grid-cols-[minmax(0,1fr)_minmax(0,0.6fr)_96px_76px] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.35fr)_110px_80px]";

export const ListRow = memo(function ListRow(p: ItemProps) {
  const isFolder = p.item.type === "folder";
  const name = isFolder ? (p.item as { folder: BrowseFolder }).folder.name : (p.item as { file: BrowseFile }).file.fileName;
  const file = isFolder ? null : (p.item as { file: BrowseFile }).file;
  const folder = isFolder ? (p.item as { folder: BrowseFolder }).folder : null;
  const left = file && p.trash ? daysLeft(file.deletedAt) : null;
  return (
    <div
      data-key={p.item.key}
      data-focused={p.focused}
      aria-selected={p.selected}
      role="option"
      title={name}
      {...p.handlers}
      className={cn("group/item grid h-11 cursor-default select-none items-center gap-4 rounded-lg border border-transparent px-2 text-[13px] transition-colors", LIST_COLS, focusRing, stateClass(p))}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Checkbox checked={p.selected} visible={p.selecting} onToggle={p.onToggle} className="shrink-0" />
        {folder ? (
          <span className="flex w-7 justify-center">
            <FolderGlyph color={folder.color} size={20} open={p.dropping} />
          </span>
        ) : file?.thumbUrl ? (
          <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-border/60">
            <Thumb file={file} size={22} />
          </span>
        ) : (
          <span className="flex w-7 justify-center">
            <FileGlyph mime={file!.mimeType} name={file!.fileName} size={24} />
          </span>
        )}
        {p.renaming ? (
          <RenameInput value={name} onDone={p.onRename} className="max-w-sm" />
        ) : (
          <span className="truncate font-medium tracking-[-0.005em]">{name}</span>
        )}
        {file?.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label="Starred" />}
        {file?.visibility === "private" && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Only you" />}
      </div>
      <div className="hidden min-w-0 sm:block">
        {p.trash ? (
          <span className="text-muted-foreground">{left != null ? `${left} ${left === 1 ? "day" : "days"} left` : "—"}</span>
        ) : p.where !== undefined ? (
          <span className="truncate text-muted-foreground">{p.where ?? "All files"}</span>
        ) : file?.record ? (
          <span className="flex min-w-0 items-center gap-1.5 text-foreground/80">
            <Paperclip className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">
              <span className="text-muted-foreground">{file.record.kind}</span> {file.record.label}
            </span>
          </span>
        ) : folder ? (
          <span className="text-muted-foreground">{p.total ? `${p.total.toLocaleString()} ${p.total === 1 ? "file" : "files"}` : "Empty"}</span>
        ) : (
          <span className="text-muted-foreground/60">—</span>
        )}
      </div>
      <div className="hidden min-w-0 truncate text-muted-foreground xl:block">{file ? (file.mine ? "You" : (file.uploader?.name ?? "—")) : "—"}</div>
      <div className="hidden truncate text-muted-foreground sm:block">{relativeDay(file ? (p.trash && file.deletedAt ? file.deletedAt : file.createdAt) : folder!.createdAt)}</div>
      <div className="truncate text-right tabular-nums text-muted-foreground">{file ? formatBytes(file.fileSize) : p.bytes ? formatBytes(p.bytes) : "—"}</div>
    </div>
  );
});
