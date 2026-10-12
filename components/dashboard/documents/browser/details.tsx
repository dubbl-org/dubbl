"use client";

import Link from "next/link";
import { Download, Eye, Link2, Lock, Paperclip, Star, Unlink, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadFiles, type BrowseFile, type BrowseFolder } from "./api";
import { FileGlyph, FolderGlyph, KIND_LABEL, formatBytes, fullDate, kindOf } from "./glyphs";
import { detachFiles, setVisibility, starFiles } from "./ops";
import { Kbd } from "./parts";

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-1.5 text-[12.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/85">{children}</dd>
    </div>
  );
}

function PaneButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 text-[12.5px] font-medium transition-colors hover:bg-foreground/[0.03]",
        active && "bg-foreground/[0.055]"
      )}
    >
      {children}
    </button>
  );
}

/** The info column: what's selected, or the place you're in. */
export function DetailsPane({
  files,
  folders,
  place,
  placeStats,
  pathOf,
  onPreview,
  onAttach,
  onClose,
}: {
  files: BrowseFile[];
  folders: BrowseFolder[];
  place: { title: string; folder: BrowseFolder | null };
  placeStats: { files: number; folders: number; bytes: number };
  pathOf: (folderId: string | null) => string;
  onPreview: (file: BrowseFile) => void;
  onAttach: (files: BrowseFile[]) => void;
  onClose: () => void;
}) {
  const count = files.length + folders.length;
  const one = files.length === 1 && !folders.length ? files[0] : null;
  const oneFolder = folders.length === 1 && !files.length ? folders[0] : null;

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border/70 xl:flex" aria-label="Details">
      <div className="flex h-11 shrink-0 items-center justify-between px-4">
        <p className="text-[12px] font-medium text-muted-foreground">Details</p>
        <button type="button" aria-label="Hide details" onClick={onClose} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {one ? (
          <>
            <button
              type="button"
              onClick={() => onPreview(one)}
              className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-foreground/[0.025]"
            >
              {one.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, not optimisable
                <img src={one.thumbUrl} alt="" className="size-full object-contain" />
              ) : (
                <FileGlyph mime={one.mimeType} name={one.fileName} size={72} />
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/50 to-transparent pb-2 pt-6 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Eye className="size-3.5" /> Preview <Kbd className="h-4 border-white/30 bg-white/15 text-white">space</Kbd>
              </span>
            </button>
            <p className="mt-3 break-words text-[14px] font-semibold leading-snug tracking-[-0.01em]">{one.fileName}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {KIND_LABEL[kindOf(one.mimeType, one.fileName)]} · {formatBytes(one.fileSize)}
            </p>
            {!one.deletedAt && (
              <div className="mt-3 flex gap-1.5">
                <PaneButton label="Download" onClick={() => downloadFiles([one]).catch((e: Error) => toast.error(e.message))}>
                  <Download className="size-3.5" />
                </PaneButton>
                <PaneButton label={one.starred ? "Unstar" : "Star"} active={one.starred} onClick={() => starFiles([one.id], !one.starred)}>
                  <Star className={cn("size-3.5", one.starred && "fill-amber-400 text-amber-400")} />
                </PaneButton>
                <PaneButton label="Attach to a record" onClick={() => onAttach([one])}>
                  <Link2 className="size-3.5" />
                </PaneButton>
              </div>
            )}

            <div className="mt-5">
              <p className="mb-1 text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">Attached to</p>
              {one.record ? (
                <div className="flex items-center gap-2 rounded-lg border border-border/70 px-2.5 py-2">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] text-muted-foreground">{one.record.kind}</p>
                    {one.record.href ? (
                      <Link href={one.record.href} className="block truncate text-[13px] font-medium hover:underline">
                        {one.record.label ?? "Open record"}
                      </Link>
                    ) : (
                      <p className="truncate text-[13px] font-medium">{one.record.label ?? "A deleted record"}</p>
                    )}
                  </div>
                  {!one.deletedAt && (
                    <button type="button" title="Detach" aria-label="Detach from record" onClick={() => detachFiles([one])} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
                      <Unlink className="size-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!!one.deletedAt}
                  onClick={() => onAttach([one])}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:pointer-events-none"
                >
                  <Link2 className="size-3.5" /> Not attached. Attach to a bill, expense, invoice…
                </button>
              )}
            </div>

            <dl className="mt-5 divide-y divide-border/50">
              <Prop label="Where">{one.deletedAt ? "Trash" : pathOf(one.folderId)}</Prop>
              <Prop label="Added">{fullDate(one.createdAt)}</Prop>
              <Prop label="Added by">{one.mine ? "You" : (one.uploader?.name ?? "Someone who left")}</Prop>
              {one.deletedAt && <Prop label="Deleted">{fullDate(one.deletedAt)}</Prop>}
              <Prop label="Who sees it">
                <span className="flex flex-col items-start gap-1">
                  <span className="flex items-center gap-1.5">
                    {one.visibility === "private" ? <Lock className="size-3 shrink-0" /> : <Users className="size-3 shrink-0" />}
                    {one.visibility === "private" ? "Only you" : "Everyone in the workspace"}
                  </span>
                  {one.mine && !one.deletedAt && (
                    <button
                      type="button"
                      onClick={() => setVisibility([one], one.visibility === "private" ? "organization" : "private")}
                      className="text-[12px] font-medium text-foreground underline underline-offset-2 decoration-foreground/30 hover:decoration-foreground"
                    >
                      {one.visibility === "private" ? "Share" : "Make private"}
                    </button>
                  )}
                </span>
              </Prop>
            </dl>
          </>
        ) : oneFolder ? (
          <>
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-border/70 bg-foreground/[0.025]">
              <FolderGlyph color={oneFolder.color} size={80} />
            </div>
            <p className="mt-3 break-words text-[14px] font-semibold tracking-[-0.01em]">{oneFolder.name}</p>
            <dl className="mt-4 divide-y divide-border/50">
              <Prop label="Where">{pathOf(oneFolder.parentId)}</Prop>
              <Prop label="Files here">{oneFolder.fileCount.toLocaleString()}</Prop>
              <Prop label="Size">{formatBytes(oneFolder.size)}</Prop>
              <Prop label="Created">{fullDate(oneFolder.createdAt)}</Prop>
            </dl>
          </>
        ) : count > 1 ? (
          <>
            <div className="relative mx-auto mt-4 h-28 w-28">
              {[...files.slice(0, 3)].reverse().map((f, i, arr) => (
                <span key={f.id} className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) rotate(${(i - (arr.length - 1) / 2) * 9}deg)` }}>
                  <FileGlyph mime={f.mimeType} name={f.fileName} size={72} />
                </span>
              ))}
              {!files.length && <FolderGlyph size={80} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />}
            </div>
            <p className="mt-4 text-center text-[14px] font-semibold">{count} items selected</p>
            <p className="mt-0.5 text-center text-[12px] text-muted-foreground">
              {[files.length && `${files.length} ${files.length === 1 ? "file" : "files"}`, folders.length && `${folders.length} ${folders.length === 1 ? "folder" : "folders"}`].filter(Boolean).join(", ")}
              {files.length > 0 && ` · ${formatBytes(files.reduce((s, f) => s + f.fileSize, 0))}`}
            </p>
            {files.length > 0 && !files[0].deletedAt && (
              <div className="mt-4 flex gap-1.5">
                <PaneButton label="Download all" onClick={() => downloadFiles(files).catch((e: Error) => toast.error(e.message))}>
                  <Download className="size-3.5" /> Download
                </PaneButton>
                <PaneButton label="Attach to a record" onClick={() => onAttach(files)}>
                  <Link2 className="size-3.5" /> Attach
                </PaneButton>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-border/70 bg-foreground/[0.025]">
              <FolderGlyph color={place.folder?.color} size={80} />
            </div>
            <p className="mt-3 text-[14px] font-semibold tracking-[-0.01em]">{place.title}</p>
            <dl className="mt-4 divide-y divide-border/50">
              <Prop label="Files">{placeStats.files.toLocaleString()}</Prop>
              {placeStats.folders > 0 && <Prop label="Folders">{placeStats.folders.toLocaleString()}</Prop>}
              <Prop label="Size">{formatBytes(placeStats.bytes)}</Prop>
              {place.folder && <Prop label="Created">{fullDate(place.folder.createdAt)}</Prop>}
            </dl>
            <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">Select a file to see where it&apos;s attached, who added it and who can see it.</p>
          </>
        )}
      </div>
    </aside>
  );
}
