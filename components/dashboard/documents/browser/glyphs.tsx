"use client";

import { cn } from "@/lib/utils";

export type Kind = "pdf" | "image" | "sheet" | "doc" | "text" | "archive" | "other";

export function kindOf(mime: string, name: string): Kind {
  const ext = extOf(name);
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (/csv|tab-separated|spreadsheet|excel/.test(mime) || ["csv", "tsv", "xls", "xlsx", "numbers", "ods"].includes(ext)) return "sheet";
  if (/word|opendocument\.text|rtf/.test(mime) || ["doc", "docx", "pages", "odt", "rtf"].includes(ext)) return "doc";
  if (mime.startsWith("text/") || mime === "application/json" || ["txt", "md", "json", "xml"].includes(ext)) return "text";
  if (/zip|compressed|tar|gzip/.test(mime) || ["zip", "gz", "tar", "7z", "rar"].includes(ext)) return "archive";
  return "other";
}

export const KIND_LABEL: Record<Kind, string> = {
  pdf: "PDF",
  image: "Image",
  sheet: "Spreadsheet",
  doc: "Document",
  text: "Text",
  archive: "Archive",
  other: "File",
};

/** Filter chips group a few kinds together. */
export const KIND_FILTERS: { value: "all" | "pdf" | "image" | "sheet" | "other"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pdf", label: "PDFs" },
  { value: "image", label: "Images" },
  { value: "sheet", label: "Spreadsheets" },
  { value: "other", label: "Other" },
];

export const filterKind = (k: Kind) => (k === "pdf" || k === "image" || k === "sheet" ? k : "other");

const TINT: Record<Kind, string> = {
  pdf: "#e5484d",
  image: "#8e4ec6",
  sheet: "#30a46c",
  doc: "#3e63dd",
  text: "#6f6e77",
  archive: "#c48a12",
  other: "#6f6e77",
};

export const extOf = (name: string) => {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** A sheet of paper with a folded corner and the file's extension. */
export function FileGlyph({ mime, name, size = 40, className }: { mime: string; name: string; size?: number; className?: string }) {
  const kind = kindOf(mime, name);
  const tint = TINT[kind];
  const ext = (extOf(name) || KIND_LABEL[kind]).slice(0, 4).toUpperCase();
  const w = size * 0.8;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: w, height: size }} aria-hidden>
      <svg viewBox="0 0 32 40" width={w} height={size} className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.06)]">
        <path d="M4 1.5h16.5L30.5 11.5V36A2.5 2.5 0 0 1 28 38.5H4A2.5 2.5 0 0 1 1.5 36V4A2.5 2.5 0 0 1 4 1.5Z" className="fill-background stroke-foreground/15" strokeWidth="1" />
        <path d="M20.5 1.5V9a2.5 2.5 0 0 0 2.5 2.5h7.5" className="fill-foreground/[0.05] stroke-foreground/15" strokeWidth="1" />
      </svg>
      {size >= 28 ? (
        <span
          className="absolute bottom-[18%] left-[-6%] rounded-[3px] px-[0.3em] font-semibold leading-[1.45] tracking-[0.02em] text-white"
          style={{ backgroundColor: tint, fontSize: Math.max(7, size * 0.2) }}
        >
          {ext}
        </span>
      ) : (
        <span className="absolute bottom-[22%] left-[22%] h-[14%] w-[56%] rounded-[1px]" style={{ backgroundColor: tint }} />
      )}
    </span>
  );
}

export const FOLDER_COLORS = [
  { value: null, label: "No colour" },
  { value: "#e5484d", label: "Red" },
  { value: "#f76b15", label: "Orange" },
  { value: "#e2a336", label: "Yellow" },
  { value: "#30a46c", label: "Green" },
  { value: "#12a594", label: "Teal" },
  { value: "#3e63dd", label: "Blue" },
  { value: "#8e4ec6", label: "Purple" },
  { value: "#d6409f", label: "Pink" },
] as const;

/** A folder, tinted with its label colour. */
export function FolderGlyph({ color, size = 18, open, className }: { color?: string | null; size?: number; open?: boolean; className?: string }) {
  const fill = color ?? "currentColor";
  return (
    <svg viewBox="0 0 24 20" width={size} height={(size * 20) / 24} className={cn("shrink-0", !color && "text-foreground/40", className)} aria-hidden>
      <path d="M2 3.2C2 2 2.9 1 4.1 1h5.2c.6 0 1.1.2 1.5.6l1.4 1.5c.4.4.9.6 1.5.6h6.2C21.1 3.7 22 4.7 22 5.9V16.8c0 1.2-.9 2.2-2.1 2.2H4.1C2.9 19 2 18 2 16.8V3.2Z" fill={fill} opacity={color ? 0.9 : 0.55} />
      <path
        d={open ? "M3.6 8.2c.2-.9 1-1.5 1.9-1.5h16c1.1 0 1.8 1 1.6 2l-1.6 8.3c-.2.9-1 1.5-1.9 1.5H3.9c-1.1 0-1.9-1-1.7-2l1.4-8.3Z" : "M2 7.4c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v9.4c0 1.2-.9 2.2-2.1 2.2H4.1C2.9 19 2 18 2 16.8V7.4Z"}
        fill={fill}
      />
      <path d="M2 7.4c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2" fill="none" stroke="white" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}

export function relativeDay(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
