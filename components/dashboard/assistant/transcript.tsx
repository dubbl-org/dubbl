"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  Check,
  ChevronRight,
  CircleAlert,
  CornerDownRight,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block, Chat, FileRef, LiveBlock, PendingAction, Upload } from "./assistant-context";
import { actionTitle, fieldLabel, fileKind, formatBytes, formatField, stepLabel } from "./labels";
import { Markdown } from "./markdown";
import { TillyMark, TillySpark } from "./tilly-mark";

type StepStatus = "running" | "done" | "failed" | "skipped";

interface StepItem {
  id: string;
  name: string;
  status: StepStatus;
  auto?: boolean;
}

type Item =
  | { kind: "user"; key: string; text: string; files: FileRef[] }
  | { kind: "text"; key: string; text: string; streaming: boolean }
  | { kind: "steps"; key: string; steps: StepItem[] };

const SPRING = { type: "spring" as const, stiffness: 500, damping: 36 };

/* ------------------------------------------------------------------ */
/*  Building the transcript                                            */
/* ------------------------------------------------------------------ */

/**
 * Flatten saved messages and the live stream into one list, folding runs of
 * tool calls into a single trace. Items are keyed by position, so a reply
 * keeps its place (and its typing animation) when the saved copy arrives.
 */
function buildItems(chat: Chat): Item[] {
  const results = new Map<string, Extract<Block, { type: "tool_result" }>>();
  for (const m of chat.messages) if (typeof m.content !== "string") for (const b of m.content) if (b.type === "tool_result") results.set(b.tool_use_id, b);
  for (const b of chat.pendingResults) if (b.type === "tool_result") results.set(b.tool_use_id, b);

  const statusOf = (id: string): StepStatus => {
    const r = results.get(id);
    // No result yet: waiting for approval, or about to run now that it was approved.
    if (!r) return chat.pending?.id === id || chat.busy ? "running" : "skipped";
    if (r.content.startsWith("The user chose to skip") || r.content.startsWith("The user moved on") || r.content === "This action was not run.") return "skipped";
    return r.is_error ? "failed" : "done";
  };

  type Raw =
    | { kind: "user"; text: string; files: FileRef[] }
    | { kind: "text"; text: string; streaming: boolean }
    | { kind: "step"; step: StepItem };
  const raw: Raw[] = [];
  for (const m of chat.messages) {
    const blocks: Block[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (m.role === "user") {
      const text = blocks.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      const files = blocks.filter((b): b is FileRef => b.type === "file");
      if (text || files.length) raw.push({ kind: "user", text, files });
      continue;
    }
    for (const b of blocks) {
      if (b.type === "text" && b.text.trim()) raw.push({ kind: "text", text: b.text, streaming: false });
      if (b.type === "tool_use" && b.id !== chat.pending?.id) raw.push({ kind: "step", step: { id: b.id, name: b.name, status: statusOf(b.id) } });
    }
  }
  chat.live.forEach((b: LiveBlock, i) => {
    if (b.kind === "text") raw.push({ kind: "text", text: b.text, streaming: i === chat.live.length - 1 && chat.busy });
    else raw.push({ kind: "step", step: { id: b.id, name: b.name, status: b.status, auto: b.auto } });
  });

  const items: Item[] = [];
  for (const r of raw) {
    const prev = items[items.length - 1];
    if (r.kind === "step") {
      if (prev?.kind === "steps") {
        // A live step replaces its saved twin rather than repeating it.
        const at = prev.steps.findIndex((s) => s.id === r.step.id);
        if (at >= 0) prev.steps[at] = r.step;
        else prev.steps.push(r.step);
      } else items.push({ kind: "steps", key: `${items.length}-steps`, steps: [r.step] });
      continue;
    }
    items.push({ ...r, key: `${items.length}-${r.kind}` } as Item);
  }
  return items;
}

/* ------------------------------------------------------------------ */
/*  Files                                                              */
/* ------------------------------------------------------------------ */

function FileIcon({ mime, name, className }: { mime: string; name: string; className?: string }) {
  const kind = fileKind(mime, name);
  const Icon = kind === "image" ? FileImage : kind === "sheet" ? FileSpreadsheet : kind === "pdf" ? FileText : Paperclip;
  const tint = kind === "image" ? "#0EA5E9" : kind === "sheet" ? "#10B981" : kind === "pdf" ? "#EF4444" : "#71717A";
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", className)} style={{ backgroundColor: `${tint}14`, color: tint }}>
      <Icon className="size-4" />
    </span>
  );
}

export function FileChip({ file, onOpen }: { file: FileRef; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex max-w-[240px] items-center gap-2.5 rounded-xl border border-border/80 bg-card py-1.5 pl-1.5 pr-3 text-left transition-colors hover:bg-foreground/[0.02]"
    >
      <FileIcon mime={file.mimeType} name={file.fileName} />
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium">{file.fileName}</span>
        <span className="block text-[11px] text-muted-foreground">{formatBytes(file.fileSize)}</span>
      </span>
    </button>
  );
}

/** A file waiting in the composer: thumbnail or icon, a progress ring while it uploads. */
export function UploadChip({ upload, onRemove }: { upload: Upload; onRemove: () => void }) {
  const failed = upload.status === "failed";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={SPRING}
      className={cn(
        "group relative flex max-w-[220px] items-center gap-2 rounded-xl border bg-card py-1.5 pl-1.5 pr-7",
        failed ? "border-red-200 dark:border-red-900/60" : "border-border/80"
      )}
      title={upload.error || upload.name}
    >
      {upload.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={upload.preview} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <FileIcon mime={upload.type} name={upload.name} />
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium">{upload.name}</span>
        <span className={cn("block text-[11px]", failed ? "text-red-600" : "text-muted-foreground")}>
          {failed ? upload.error || "Upload failed" : upload.status === "uploading" ? `Uploading ${Math.round(upload.progress * 100)}%` : formatBytes(upload.size)}
        </span>
      </span>
      {upload.status === "uploading" && (
        <svg className="absolute left-1.5 top-1.5 size-8 -rotate-90" viewBox="0 0 32 32" aria-hidden>
          <circle cx="16" cy="16" r="14" fill="rgb(255 255 255 / 0.6)" />
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="none"
            stroke="var(--color-tilly-500)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={69.1}
            strokeDashoffset={69.1 * (1 - Math.max(0.06, upload.progress))}
            className="transition-[stroke-dashoffset] duration-200"
          />
        </svg>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${upload.name}`}
        className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Text that types itself out                                         */
/* ------------------------------------------------------------------ */

function SmoothText({ text, streaming, onNavigate, className }: { text: string; streaming: boolean; onNavigate?: () => void; className?: string }) {
  // Saved replies show at once; streamed ones type out and catch up quickly.
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const target = text.length;

  useEffect(() => {
    if (shown >= target) return;
    const id = requestAnimationFrame(() => setShown((s) => Math.min(target, s + Math.max(1, Math.ceil((target - s) / 14)))));
    return () => cancelAnimationFrame(id);
  }, [shown, target]);

  const typing = streaming || shown < target;
  return (
    <div className={className}>
      <Markdown text={text.slice(0, shown)} onNavigate={onNavigate} tail={typing ? <span className="tilly-caret" /> : undefined} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The trace of steps                                                 */
/* ------------------------------------------------------------------ */

function StepIcon({ status }: { status: StepStatus }) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "running" ? (
          <motion.span key="run" exit={{ opacity: 0, scale: 0.5 }} className="flex">
            <TillySpark />
          </motion.span>
        ) : status === "done" ? (
          <motion.span
            key="done"
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            className="flex size-4 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
          >
            <Check className="size-2.5" strokeWidth={3} />
          </motion.span>
        ) : status === "skipped" ? (
          <motion.span key="skip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex">
            <CornerDownRight className="size-3.5 text-muted-foreground/60" />
          </motion.span>
        ) : (
          <motion.span key="fail" initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex">
            <CircleAlert className="size-3.5 text-red-500" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function StepRow({ step }: { step: StepItem }) {
  const label = step.status === "skipped" ? `Skipped: ${actionTitle(step.name).toLowerCase()}` : stepLabel(step.name, step.status !== "running");
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex min-h-7 items-center gap-2.5 text-[12.5px]"
    >
      <StepIcon status={step.status} />
      <span className={cn("truncate", step.status === "running" ? "tilly-shimmer text-muted-foreground" : "text-muted-foreground")}>{label}</span>
      {step.auto && <span className="shrink-0 rounded-full bg-foreground/[0.05] px-1.5 text-[10.5px] text-muted-foreground">auto-approved</span>}
    </motion.div>
  );
}

function ActivityTrace({ steps }: { steps: StepItem[] }) {
  const running = steps.some((s) => s.status === "running");
  const done = steps.filter((s) => s.status === "done").length;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? (running || steps.length <= 2);

  if (steps.length === 1) {
    return (
      <div className="pl-0.5">
        <StepRow step={steps[0]} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-foreground/[0.015]">
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {running ? <TillySpark /> : <Check className="size-3.5 text-emerald-600" strokeWidth={2.5} />}
        <span className={cn("font-medium", running && "tilly-shimmer")}>{running ? "Working" : `Ran ${steps.length} steps`}</span>
        <span className="tabular-nums text-muted-foreground/70">
          {running ? `${done} of ${steps.length}` : steps.some((s) => s.status === "failed") ? "· some failed" : ""}
        </span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.18 }} className="ml-auto flex">
          <ChevronRight className="size-3.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-[17px] border-l border-foreground/10 pb-1.5 pl-3">
              {steps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Working status, with a running clock                               */
/* ------------------------------------------------------------------ */

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, (now - since) / 1000);
  return <span className="tabular-nums text-muted-foreground/60">{s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`}</span>;
}

function workingLabel(chat: Chat) {
  const running = [...chat.live].reverse().find((b) => b.kind === "tool" && b.status === "running");
  if (running && running.kind === "tool") return stepLabel(running.name, false);
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const hasFiles = typeof lastUser?.content !== "string" && lastUser?.content.some((b) => b.type === "file");
  if (chat.live.length === 0) return hasFiles ? "Reading your files" : "Thinking";
  return "Working out the next step";
}

function WorkingStatus({ chat }: { chat: Chat }) {
  const label = workingLabel(chat);
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex h-6 items-center gap-2.5 pl-0.5 text-[12.5px]">
      <TillyMark size={15} state="thinking" />
      <span className="relative inline-flex overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={label}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="tilly-shimmer whitespace-nowrap text-muted-foreground"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
      {chat.startedAt && <Elapsed since={chat.startedAt} />}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Approval                                                           */
/* ------------------------------------------------------------------ */

function FieldValue({ k, v, cents }: { k: string; v: unknown; cents: Set<string> }) {
  // Line items and other lists read as a short list, not raw JSON.
  if (Array.isArray(v) && v.every((x) => x && typeof x === "object")) {
    return (
      <ul className="space-y-0.5">
        {v.slice(0, 6).map((row, i) => {
          const r = row as Record<string, unknown>;
          const name = r.description ?? r.name ?? r.title ?? r.accountName ?? `Item ${i + 1}`;
          const moneyKey = Object.keys(r).find((x) => /amount|total|unitPrice|price/i.test(x) && typeof r[x] === "number");
          const qty = typeof r.quantity === "number" ? r.quantity : null;
          return (
            <li key={i} className="flex gap-2">
              <span className="min-w-0 flex-1 truncate">{String(name)}</span>
              {qty != null && <span className="text-muted-foreground">×{qty}</span>}
              {moneyKey && <span className="tabular-nums">{formatField(moneyKey, r[moneyKey], cents)}</span>}
            </li>
          );
        })}
        {v.length > 6 && <li className="text-muted-foreground">and {v.length - 6} more</li>}
      </ul>
    );
  }
  if (Array.isArray(v)) return <>{v.map((x) => formatField(k, x, cents)).join(", ")}</>;
  return <>{formatField(k, v, cents)}</>;
}

export function ApprovalCard({
  action,
  onDecide,
  busy,
}: {
  action: PendingAction;
  onDecide: (d: "approve" | "deny", always?: boolean) => void;
  busy: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [always, setAlways] = useState(false);
  const cents = new Set(action.cents ?? []);
  // Raw record ids mean nothing to people; they stay under "All details".
  const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const entries = Object.entries(action.input ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== "" && !isId(v) && !(Array.isArray(v) && v.length === 0)
  );
  const send = action.risk === "send";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING}
      className="overflow-hidden rounded-xl border border-tilly-200/80 bg-card shadow-[0_12px_32px_-16px_rgba(194,78,44,0.4)] dark:border-tilly-700/40"
    >
      <div className="flex h-9 items-center gap-2 border-b border-tilly-100 bg-tilly-50 px-3 text-[12px] font-medium text-tilly-700 dark:border-tilly-700/30 dark:bg-tilly-700/15 dark:text-tilly-400">
        <TillyMark size={14} state="attention" />
        {send ? "Ready to send" : "Waiting for your approval"}
        <span className="ml-auto flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] dark:bg-black/20">
          {send && <Mail className="size-3" />}
          {send ? "Sends email" : "Changes data"}
        </span>
      </div>
      <div className="p-3.5">
        <p className="text-[14px] font-semibold">{actionTitle(action.name)}</p>
        {entries.length > 0 && (
          <dl className="mt-2.5 space-y-1.5">
            {(showAll ? entries : entries.slice(0, 7)).map(([k, v]) => (
              <div key={k} className="flex gap-3 text-[12.5px]">
                <dt className="w-28 shrink-0 text-muted-foreground">{fieldLabel(k)}</dt>
                <dd className="min-w-0 flex-1 break-words font-medium">
                  <FieldValue k={k} v={v} cents={cents} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <AnimatePresence initial={false}>
          {showAll && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-2.5 max-h-48 overflow-auto rounded-lg bg-foreground/[0.04] p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              {JSON.stringify(action.input, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
        {!send && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={always}
              onChange={(e) => setAlways(e.target.checked)}
              className="size-3.5 rounded accent-[var(--color-tilly-600)]"
            />
            Don&apos;t ask again for this in this chat
          </label>
        )}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide("approve", always)}
            className="h-8 rounded-lg bg-tilly-600 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-tilly-700 active:scale-[0.98] disabled:opacity-50"
          >
            {send ? "Send" : "Approve"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide("deny")}
            className="h-8 rounded-lg border border-border px-3.5 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03] active:scale-[0.98] disabled:opacity-50"
          >
            Skip
          </button>
          <button type="button" onClick={() => setShowAll((s) => !s)} className="ml-auto text-[12px] text-muted-foreground transition-colors hover:text-foreground">
            {showAll ? "Fewer details" : "All details"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Scrolling                                                          */
/* ------------------------------------------------------------------ */

/** Follow new content while you're at the bottom; offer a way back when you've scrolled up. */
export function useStickToBottom(resetKey: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [away, setAway] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Jumping to the bottom fires a scroll event, which clears `away`.
    stuck.current = true;
    el.scrollTop = el.scrollHeight;
  }, [resetKey]);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
      stuck.current = atBottom;
      setAway(!atBottom);
    };
    const ro = new ResizeObserver(() => {
      if (stuck.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const toBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    stuck.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return { scrollRef, contentRef, away, toBottom };
}

export function LatestButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={onClick}
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={SPRING}
          className="absolute bottom-3 left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/80 bg-card px-3 text-[12px] font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.25)]"
        >
          <ArrowDown className="size-3" />
          Latest
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  The transcript                                                     */
/* ------------------------------------------------------------------ */

export function Transcript({
  chat,
  onDecide,
  onNavigate,
  size = "panel",
}: {
  chat: Chat;
  onDecide: (d: "approve" | "deny", always?: boolean) => void;
  onNavigate?: () => void;
  size?: "panel" | "page";
}) {
  const items = buildItems(chat);
  const writing = items[items.length - 1]?.kind === "text" && chat.busy && chat.live[chat.live.length - 1]?.kind === "text";
  const page = size === "page";
  const body = page ? "text-[14.5px] leading-[1.7]" : "text-[13.5px] leading-relaxed";

  if (chat.loading && chat.messages.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading conversation
      </div>
    );
  }

  const rendered: ReactNode[] = items.map((item) => {
    if (item.kind === "user") {
      return (
        <motion.div
          key={item.key}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={SPRING}
          className="flex flex-col items-end gap-1.5"
          style={{ transformOrigin: "bottom right" }}
        >
          {item.files.length > 0 && (
            <div className="flex max-w-[90%] flex-wrap justify-end gap-1.5">
              {item.files.map((f) => (
                <FileChip key={f.documentId} file={f} />
              ))}
            </div>
          )}
          {item.text && (
            <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-tilly-600 px-3.5 py-2 text-white", body)}>{item.text}</div>
          )}
        </motion.div>
      );
    }
    if (item.kind === "steps") {
      return (
        <motion.div key={item.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <ActivityTrace steps={item.steps} />
        </motion.div>
      );
    }
    return <SmoothText key={item.key} text={item.text} streaming={item.streaming} onNavigate={onNavigate} className={cn("text-foreground/90", body)} />;
  });

  return (
    <div className={page ? "space-y-5" : "space-y-4"}>
      <AnimatePresence initial={false}>{rendered}</AnimatePresence>
      {chat.busy && !writing && <WorkingStatus chat={chat} />}
      {chat.pending && <ApprovalCard key={chat.pending.id} action={chat.pending} onDecide={onDecide} busy={chat.busy} />}
      {chat.error && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {chat.error}
        </motion.div>
      )}
    </div>
  );
}
