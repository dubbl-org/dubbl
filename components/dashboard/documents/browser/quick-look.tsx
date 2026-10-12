"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Link2, Loader2, Paperclip, Star, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadFiles, fileUrl, openInNewTab, type BrowseFile } from "./api";
import { FileGlyph, KIND_LABEL, formatBytes, fullDate, kindOf } from "./glyphs";
import { starFiles } from "./ops";
import { Kbd } from "./parts";

type Body =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "url"; url: string }
  | { state: "table"; url: string; rows: string[][]; more: boolean }
  | { state: "text"; url: string; text: string };

const MAX_ROWS = 300;

/** Splits CSV/TSV, honouring quoted cells. */
function parseDelimited(text: string, sep: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length <= MAX_ROWS; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

function usePreview(file: BrowseFile | null) {
  const [body, setBody] = useState<{ id: string; body: Body } | null>(null);
  const id = file?.id ?? null;
  const mime = file?.mimeType ?? "";
  const name = file?.fileName ?? "";

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const set = (b: Body) => !cancelled && setBody({ id, body: b });
    const kind = kindOf(mime, name);
    const delimited = /csv|tab-separated/.test(mime) || /\.(csv|tsv)$/i.test(name);
    fileUrl(id)
      .then(async (url) => {
        if (delimited) {
          const text = await fetch(url).then((r) => r.text());
          const sep = /\.tsv$/i.test(name) || mime.includes("tab-separated") ? "\t" : ",";
          const rows = parseDelimited(text, sep);
          return set({ state: "table", url, rows: rows.slice(0, MAX_ROWS), more: rows.length > MAX_ROWS });
        }
        if (kind === "text") {
          const text = await fetch(url).then((r) => r.text());
          let shown = text.slice(0, 200_000);
          if (mime === "application/json" || /\.json$/i.test(name)) {
            try {
              shown = JSON.stringify(JSON.parse(text), null, 2).slice(0, 200_000);
            } catch {
              // show it as it is
            }
          }
          return set({ state: "text", url, text: shown });
        }
        set({ state: "url", url });
      })
      .catch((err: Error) => set({ state: "error", message: err.message || "This file can't be previewed" }));
    return () => {
      cancelled = true;
    };
  }, [id, mime, name]);
  return id && body?.id === id ? body.body : ({ state: "loading" } as Body);
}

function Preview({ file, body, zoom, onZoom }: { file: BrowseFile; body: Body; zoom: boolean; onZoom: () => void }) {
  const kind = kindOf(file.mimeType, file.fileName);
  if (body.state === "loading") {
    return (
      <div className="flex size-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/60" />
      </div>
    );
  }
  if (body.state === "error" || (body.state === "url" && kind !== "image" && kind !== "pdf")) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-4 text-center">
        <FileGlyph mime={file.mimeType} name={file.fileName} size={96} />
        <div>
          <p className="text-[14px] font-medium text-white">{body.state === "error" ? body.message : "No preview for this kind of file"}</p>
          <p className="mt-1 text-[12.5px] text-white/55">Download it to open it on your computer.</p>
        </div>
        <button
          type="button"
          onClick={() => downloadFiles([file]).catch((e: Error) => toast.error(e.message))}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3.5 text-[13px] font-medium text-black hover:bg-white/90"
        >
          <Download className="size-4" /> Download
        </button>
      </div>
    );
  }
  if (body.state === "table") {
    const [head, ...rest] = body.rows;
    return (
      <div className="size-full overflow-auto rounded-lg bg-background">
        <table className="min-w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="w-10 border-b border-r border-border/70 px-2 py-1.5 text-right font-normal text-muted-foreground" />
              {head?.map((h, i) => (
                <th key={i} className="whitespace-nowrap border-b border-r border-border/70 px-3 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rest.map((r, i) => (
              <tr key={i} className="odd:bg-foreground/[0.015]">
                <td className="border-b border-r border-border/50 px-2 py-1 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</td>
                {r.map((c, j) => (
                  <td key={j} className={cn("max-w-[320px] truncate whitespace-nowrap border-b border-r border-border/50 px-3 py-1", /^-?[\d,.]+$/.test(c.trim()) && "text-right tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {body.more && <p className="p-3 text-center text-[12px] text-muted-foreground">Showing the first {MAX_ROWS} rows. Download the file to see the rest.</p>}
      </div>
    );
  }
  if (body.state === "text") {
    return (
      <pre className="size-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-background p-5 font-mono text-[12.5px] leading-relaxed text-foreground/90">{body.text}</pre>
    );
  }
  if (kind === "pdf") {
    return <iframe title={file.fileName} src={`${body.url}#view=FitH`} className="size-full rounded-lg bg-white" />;
  }
  return (
    <div className={cn("flex size-full", zoom ? "overflow-auto" : "items-center justify-center overflow-hidden")} onClick={onZoom}>
      {/* eslint-disable-next-line @next/next/no-img-element -- presigned storage URL, not optimisable */}
      <img
        src={body.url}
        alt={file.fileName}
        draggable={false}
        className={cn("select-none", zoom ? "m-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in rounded-md object-contain shadow-2xl")}
      />
    </div>
  );
}

/**
 * Space-bar preview, Finder style: big, fast, arrow keys to flip through the
 * files around it, Esc or Space to close.
 */
export function QuickLook({
  files,
  id,
  onChange,
  onClose,
  onAttach,
}: {
  files: BrowseFile[];
  id: string | null;
  onChange: (id: string) => void;
  onClose: () => void;
  onAttach: (file: BrowseFile) => void;
}) {
  const index = useMemo(() => files.findIndex((f) => f.id === id), [files, id]);
  const file = index >= 0 ? files[index] : null;
  const body = usePreview(file);
  const [zoomFor, setZoomFor] = useState<string | null>(null);
  const zoom = zoomFor === file?.id;

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === " " && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        if (index < files.length - 1) onChange(files[index + 1].id);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        if (index > 0) onChange(files[index - 1].id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [file, files, index, onChange, onClose]);

  if (typeof document === "undefined") return null;
  const kind = file ? kindOf(file.mimeType, file.fileName) : "other";

  return createPortal(
    <AnimatePresence>
      {file && (
        <motion.div
          key="ql"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[60] flex flex-col bg-[rgba(12,12,12,0.86)] backdrop-blur-md"
          role="dialog"
          aria-modal
          aria-label={`Preview of ${file.fileName}`}
          onClick={onClose}
        >
          <div className="flex h-14 shrink-0 items-center gap-3 px-4 text-white sm:px-6" onClick={(e) => e.stopPropagation()}>
            <FileGlyph mime={file.mimeType} name={file.fileName} size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{file.fileName}</p>
              <p className="truncate text-[11.5px] text-white/55">
                {KIND_LABEL[kind]} · {formatBytes(file.fileSize)} · {fullDate(file.createdAt)}
                {file.uploader?.name ? ` · ${file.mine ? "you" : file.uploader.name}` : ""}
              </p>
            </div>
            {files.length > 1 && <span className="hidden font-mono text-[12px] tabular-nums text-white/55 sm:block">{index + 1} / {files.length}</span>}
            <div className="flex items-center gap-1">
              {file.record?.href ? (
                <Link
                  href={file.record.href}
                  onClick={onClose}
                  className="hidden h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12.5px] font-medium hover:bg-white/15 md:inline-flex"
                >
                  <Paperclip className="size-3.5" />
                  <span className="max-w-[180px] truncate">{file.record.label ?? file.record.kind}</span>
                </Link>
              ) : (
                !file.deletedAt && (
                  <button type="button" onClick={() => onAttach(file)} className="hidden h-8 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 text-[12.5px] font-medium hover:bg-white/15 md:inline-flex">
                    <Link2 className="size-3.5" /> Attach to a record
                  </button>
                )
              )}
              {kind === "image" && body.state === "url" && (
                <QlButton label={zoom ? "Fit to screen" : "Actual size"} onClick={() => setZoomFor(zoom ? null : file.id)}>
                  {zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                </QlButton>
              )}
              {!file.deletedAt && (
                <QlButton label={file.starred ? "Unstar" : "Star"} onClick={() => starFiles([file.id], !file.starred)}>
                  <Star className={cn("size-4", file.starred && "fill-amber-400 text-amber-400")} />
                </QlButton>
              )}
              <QlButton label="Open in a new tab" onClick={() => openInNewTab(file.id).catch((e: Error) => toast.error(e.message))}>
                <ExternalLink className="size-4" />
              </QlButton>
              <QlButton label="Download" onClick={() => downloadFiles([file]).catch((e: Error) => toast.error(e.message))}>
                <Download className="size-4" />
              </QlButton>
              <QlButton label="Close (Esc)" onClick={onClose}>
                <X className="size-4.5" />
              </QlButton>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-stretch gap-2 px-2 pb-4 sm:px-4 sm:pb-6">
            <SideArrow dir="prev" disabled={index <= 0} onClick={() => onChange(files[index - 1].id)} />
            <motion.div
              key={file.id}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Preview file={file} body={body} zoom={zoom} onZoom={() => setZoomFor(zoom ? null : file.id)} />
            </motion.div>
            <SideArrow dir="next" disabled={index >= files.length - 1} onClick={() => onChange(files[index + 1].id)} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 hidden justify-center gap-3 text-[11px] text-white/45 md:flex">
            <span className="flex items-center gap-1.5"><Kbd className="border-white/15 bg-white/10 text-white/60">←</Kbd><Kbd className="border-white/15 bg-white/10 text-white/60">→</Kbd> flip through</span>
            <span className="flex items-center gap-1.5"><Kbd className="border-white/15 bg-white/10 text-white/60">space</Kbd> close</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function QlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex size-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}

function SideArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous file" : "Next file"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="hidden w-10 shrink-0 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/5 hover:text-white disabled:pointer-events-none disabled:opacity-0 sm:flex"
    >
      <Icon className="size-6" />
    </button>
  );
}
