"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  Expand,
  FileUp,
  HandCoins,
  HeartPulse,
  History as HistoryIcon,
  Hourglass,
  Mail,
  Minus,
  PanelRight,
  Plus,
  Search,
  SquarePen,
  TrendingUp,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ACCEPT, useAssistant, useMood, type Chat, type Rect } from "./assistant-context";
import { Composer, DropZone } from "./composer";
import { History } from "./history";
import { LatestButton, Transcript, useStickToBottom } from "./transcript";
import { TillyMark } from "./tilly-mark";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 38 };
const MIN_DOCK = 340;
const MIN_W = 360;
const MIN_H = 420;

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function IconButton({
  label,
  shortcut,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          data-no-drag
          className={cn(
            "flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-40",
            active && "bg-foreground/[0.055] text-foreground"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut && <kbd className="ml-1.5 font-mono opacity-70">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Amber when something waits for you, sky when an answer is unread, a spinning mark while working. */
function TabDot({ chat }: { chat: Chat }) {
  if (chat.busy) return <TillyMark size={10} state="thinking" />;
  if (chat.pending) return <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />;
  if (chat.unseen) return <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />;
  return null;
}

function TabStrip() {
  const { tabs, chats, activeKey, setActive, closeTab, newChat } = useAssistant();
  if (tabs.length < 2) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/60 px-2 scrollbar-none" data-no-drag>
      <AnimatePresence initial={false}>
        {tabs.map((key) => {
          const chat = chats[key];
          if (!chat) return null;
          const active = key === activeKey;
          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.18 }}
              className="shrink-0 overflow-hidden"
            >
              <div
                role="tab"
                tabIndex={0}
                aria-selected={active}
                onClick={() => setActive(key)}
                onAuxClick={(e) => {
                  if (e.button === 1) closeTab(key);
                }}
                onKeyDown={(e) => e.key === "Enter" && setActive(key)}
                className={cn(
                  "group flex h-7 max-w-[160px] cursor-pointer items-center gap-1.5 rounded-md pl-2 pr-1 text-[12px] transition-colors",
                  active ? "bg-foreground/[0.055] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
                )}
              >
                <TabDot chat={chat} />
                <span className="truncate">{chat.title}</span>
                <button
                  type="button"
                  aria-label="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(key);
                  }}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <button
        type="button"
        aria-label="New chat"
        onClick={newChat}
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <TillyMark size={40} state="muted" follow />
      <p className="mt-4 text-[14.5px] font-semibold">Tilly isn&apos;t switched on yet</p>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
        Add an <code className="rounded bg-foreground/[0.06] px-1 font-mono text-[12px]">ANTHROPIC_API_KEY</code> to your server&apos;s
        environment and restart dubbl.
      </p>
    </div>
  );
}

export const SUGGESTIONS = [
  { icon: TrendingUp, tint: "#10B981", text: "How is the business doing this month?" },
  { icon: HandCoins, tint: "#F59E0B", text: "Who owes me money, and who should I chase first?" },
  { icon: Hourglass, tint: "#0EA5E9", text: "How long will my cash last?" },
  { icon: Search, tint: "#8B5CF6", text: "Find everything from my biggest supplier this year" },
  { icon: HeartPulse, tint: "#EC4899", text: "Explain my profit and loss like I'm new to accounting" },
  { icon: Mail, tint: "#6366F1", text: "Send a friendly reminder for my most overdue invoice" },
];

function EmptyState({ chat }: { chat: Chat }) {
  const { send, setDraft, addFiles } = useAssistant();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex min-h-full flex-col justify-center py-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col items-center text-center">
        <TillyMark size={46} follow reactive />
        <p className="mt-4 text-[15px] font-semibold">Hi, I&apos;m Tilly</p>
        <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
          I can explain your numbers, find anything in your books and book receipts for you. I always ask before changing anything.
        </p>
      </motion.div>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.05 }}
        onClick={() => fileRef.current?.click()}
        className="group mt-6 flex items-center gap-3 rounded-xl border border-dashed border-tilly-300/80 bg-tilly-50/60 px-3 py-3 text-left transition-colors hover:border-tilly-400 hover:bg-tilly-50 dark:border-tilly-700/50 dark:bg-tilly-700/10"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tilly-600 text-white transition-transform group-hover:-translate-y-0.5">
          <FileUp className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium">Drop a receipt, bill or statement</span>
          <span className="block text-[12px] text-muted-foreground">I&apos;ll read it, check your books and book it with you</span>
        </span>
      </motion.button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(chat.key, e.target.files);
            if (!chat.draft) setDraft(chat.key, "Please read this and book it.");
          }
          e.target.value = "";
        }}
      />

      <p className="mb-2 mt-6 px-1 text-[12px] text-muted-foreground/80">Or ask</p>
      <div className="divide-y divide-foreground/[0.05] overflow-hidden rounded-xl border border-border/80">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s.text}
            type="button"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.04, duration: 0.25, ease: "easeOut" }}
            onClick={() => send(chat.key, s.text)}
            className="group flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-foreground/[0.025]"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${s.tint}17`, color: s.tint }}>
              <s.icon className="size-3.5" />
            </span>
            <span className="flex-1">{s.text}</span>
            <ArrowUp className="size-3.5 rotate-45 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-tilly-600" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  The panel itself, shared by every mode                             */
/* ------------------------------------------------------------------ */

function PanelBody({
  onHeaderPointerDown,
  onNavigate,
  floating,
}: {
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
  onNavigate?: () => void;
  floating?: boolean;
}) {
  const router = useRouter();
  const { active, setOpen, setMinimized, newChat, setLayout, notConfigured, decide, addFiles } = useAssistant();
  const mood = useMood(active);
  const [showHistory, setShowHistory] = useState(false);
  const { scrollRef, contentRef, away, toBottom } = useStickToBottom(active.key);
  const empty = active.messages.length === 0 && active.live.length === 0 && !active.busy && !active.loading;

  const status = active.pending
    ? "Waiting for your approval"
    : active.busy
      ? "Working on it…"
      : active.messages.length
        ? active.title
        : "Your money assistant";

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        onPointerDown={onHeaderPointerDown}
        className={cn("flex h-12 shrink-0 items-center gap-2.5 border-b border-border/60 pl-3.5 pr-2", onHeaderPointerDown && "cursor-grab active:cursor-grabbing")}
      >
        <span className="tilly-hover flex" data-no-drag>
          <TillyMark size={22} state={mood} follow reactive />
        </span>
        <div className="min-w-0 flex-1 select-none leading-tight">
          <p className="text-[13.5px] font-semibold">Tilly</p>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={status}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className={cn("truncate text-[11.5px]", active.pending ? "text-amber-600" : "text-muted-foreground", active.busy && "tilly-shimmer")}
            >
              {status}
            </motion.p>
          </AnimatePresence>
        </div>
        <IconButton label="History" onClick={() => setShowHistory((s) => !s)} active={showHistory}>
          <HistoryIcon className="size-3.5" />
        </IconButton>
        <IconButton label="New chat" shortcut="⌥N" onClick={() => { newChat(); setShowHistory(false); }}>
          <SquarePen className="size-3.5" />
        </IconButton>
        <span className="hidden lg:contents">
          {floating ? (
            <IconButton label="Dock to the side" shortcut="⌥P" onClick={() => setLayout({ mode: "docked" })}>
              <PanelRight className="size-3.5" />
            </IconButton>
          ) : (
            <IconButton label="Pop out" shortcut="⌥P" onClick={() => setLayout({ mode: "floating" })}>
              <PopOutIcon />
            </IconButton>
          )}
          <IconButton label="Open full page" onClick={() => router.push("/assistant")}>
            <Expand className="size-3.5" />
          </IconButton>
          <IconButton label="Minimise" shortcut="⌥M" onClick={() => setMinimized(true)}>
            <Minus className="size-3.5" />
          </IconButton>
        </span>
        <IconButton label="Close" shortcut="⌘I" onClick={() => setOpen(false)}>
          <X className="size-3.5" />
        </IconButton>
      </div>

      <TabStrip />

      <DropZone className="flex min-h-0 flex-1 flex-col" onFiles={(files) => addFiles(active.key, files)}>
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
            <div ref={contentRef} className="min-h-full">
              {notConfigured ? (
                <NotConfigured />
              ) : empty ? (
                <EmptyState chat={active} />
              ) : (
                <Transcript key={active.key} chat={active} onDecide={(d, always) => decide(active.key, d, always)} onNavigate={onNavigate} />
              )}
            </div>
          </div>
          <LatestButton show={away && !empty} onClick={toBottom} />
        </div>
        <div className="shrink-0 border-t border-border/60 p-2.5">
          <Composer
            chat={active}
            autoFocus
            footer={
              <p className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground/70">
                <span>Reads PDFs, photos and CSVs. Changes always ask first.</span>
                <kbd className="font-mono">⌘I</kbd>
              </p>
            }
          />
        </div>
      </DropZone>

      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-x-0 bottom-0 top-12 z-20 bg-background/40"
            />
            <motion.div
              key="history"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={SPRING}
              className="absolute bottom-0 left-0 top-12 z-30 flex w-[min(300px,85%)] flex-col border-r border-border/70 bg-card pt-2 shadow-[12px_0_40px_-20px_rgba(0,0,0,0.25)]"
            >
              <History className="flex-1" onPick={() => setShowHistory(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function PopOutIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="1.75" y="3.75" width="9.5" height="9.5" rx="2" />
      <rect x="5.25" y="1.75" width="9" height="8" rx="1.75" fill="var(--card)" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating window: drag the header, resize from any edge             */
/* ------------------------------------------------------------------ */

/** Set by the docked panel when it's torn off, so the window keeps following the pointer. */
let handoff: { dx: number; dy: number } | null = null;

const viewport = () => ({ vw: window.innerWidth, vh: window.innerHeight });

function defaultRect(): Rect {
  const { vw, vh } = viewport();
  const w = Math.min(460, vw - 32);
  const h = Math.min(680, vh - 48);
  return { x: vw - w - 24, y: vh - h - 24, w, h };
}

function clampRect(r: Rect): Rect {
  const { vw, vh } = viewport();
  const w = Math.min(Math.max(r.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(r.h, MIN_H), vh - 16);
  return { w, h, x: Math.min(Math.max(r.x, 8), vw - w - 8), y: Math.min(Math.max(r.y, 8), vh - h - 8) };
}

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const EDGES: { edge: Edge; className: string }[] = [
  { edge: "n", className: "inset-x-3 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-3 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "e", className: "inset-y-3 -right-1 w-2 cursor-ew-resize" },
  { edge: "w", className: "inset-y-3 -left-1 w-2 cursor-ew-resize" },
  { edge: "ne", className: "-right-1 -top-1 size-4 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 size-4 cursor-nesw-resize" },
  { edge: "nw", className: "-left-1 -top-1 size-4 cursor-nwse-resize" },
  { edge: "se", className: "-bottom-1 -right-1 size-4 cursor-nwse-resize" },
];

function FloatingWindow() {
  const { layout, setLayout } = useAssistant();
  const [rect, setRect] = useState<Rect>(() => clampRect(layout.rect ?? defaultRect()));
  const [moving, setMoving] = useState(false);
  const rectRef = useRef(rect);
  useLayoutEffect(() => {
    rectRef.current = rect;
  }, [rect]);

  const track = (onMove: (e: PointerEvent) => void) => {
    setMoving(true);
    document.body.style.userSelect = "none";
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      setMoving(false);
      setLayout({ rect: rectRef.current });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
  };

  const startMove = (dx: number, dy: number) =>
    track((e) => setRect((r) => clampRect({ ...r, x: e.clientX - dx, y: e.clientY - dy })));

  // Picked up from the docked panel: keep following the pointer.
  useEffect(() => {
    if (!handoff) return;
    const { dx, dy } = handoff;
    handoff = null;
    startMove(dx, dy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-drag],button,input,textarea,a")) return;
    e.preventDefault();
    startMove(e.clientX - rect.x, e.clientY - rect.y);
  };

  const startResize = (edge: Edge) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = { ...rect, px: e.clientX, py: e.clientY };
    track((ev) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      let { x, y, w, h } = start;
      if (edge.includes("e")) w = start.w + dx;
      if (edge.includes("s")) h = start.h + dy;
      if (edge.includes("w")) {
        w = Math.max(MIN_W, start.w - dx);
        x = start.x + start.w - w;
      }
      if (edge.includes("n")) {
        h = Math.max(MIN_H, start.h - dy);
        y = start.y + start.h - h;
      }
      setRect(clampRect({ x, y, w, h }));
    });
  };

  return (
    <motion.aside
      aria-label="Tilly"
      initial={{ opacity: 0, scale: 0.95, y: 14 }}
      animate={{ opacity: 1, scale: moving ? 1.005 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 14 }}
      transition={SPRING}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      className={cn(
        "fixed z-50 hidden rounded-2xl border border-border/80 bg-card lg:block",
        moving ? "shadow-[0_32px_90px_-24px_rgba(0,0,0,0.45)]" : "shadow-[0_24px_70px_-24px_rgba(0,0,0,0.35)]"
      )}
    >
      <div className="h-full overflow-hidden rounded-2xl">
        <PanelBody onHeaderPointerDown={onHeaderPointerDown} floating />
      </div>
      {EDGES.map(({ edge, className }) => (
        <div key={edge} onPointerDown={startResize(edge)} className={cn("absolute z-10", className)} />
      ))}
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Docked column: resize from the inner edge, drag the header to pop  */
/* ------------------------------------------------------------------ */

function DockedColumn() {
  const { layout, setLayout } = useAssistant();
  const [width, setWidth] = useState(layout.dockWidth);
  const [resizing, setResizing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  useLayoutEffect(() => {
    widthRef.current = width;
  }, [width]);

  const maxWidth = () => Math.max(MIN_DOCK, Math.min(760, window.innerWidth - 640));

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const move = (ev: PointerEvent) => setWidth(Math.min(maxWidth(), Math.max(MIN_DOCK, startW + (startX - ev.clientX))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setResizing(false);
      setLayout({ dockWidth: widthRef.current });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Drag the header more than a few pixels and the panel pops out under the pointer.
  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-drag],button,input,textarea,a")) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const box = ref.current?.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 16 || !box) return;
      cleanup();
      const w = 460;
      const h = Math.min(680, window.innerHeight - 48);
      // Keep the grab point at the same spot on the header, scaled to the new width.
      const dx = Math.min(w - 40, Math.max(40, ((sx - box.left) / box.width) * w));
      const dy = sy - box.top;
      handoff = { dx, dy };
      setLayout({ mode: "floating", rect: clampRect({ x: ev.clientX - dx, y: ev.clientY - dy, w, h }) });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
  };

  return (
    <motion.div
      key="tilly-dock"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: width + 8, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={resizing ? { duration: 0 } : SPRING}
      className="hidden shrink-0 overflow-hidden lg:block"
    >
      <div ref={ref} className="relative h-full py-2 pr-2" style={{ width: width + 8 }}>
        <div
          onPointerDown={startResize}
          onDoubleClick={() => {
            setWidth(420);
            setLayout({ dockWidth: 420 });
          }}
          className="group absolute inset-y-2 left-0 z-10 flex w-2 cursor-col-resize justify-center"
          title="Drag to resize"
        >
          <span className={cn("my-auto h-10 w-[3px] rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/20", resizing && "bg-tilly-400")} />
        </div>
        <aside aria-label="Tilly" className="ml-2 h-full overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <PanelBody onHeaderPointerDown={onHeaderPointerDown} />
        </aside>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Minimised: a small pill that keeps you posted                      */
/* ------------------------------------------------------------------ */

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums text-muted-foreground">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

function DockPill() {
  const { open, minimized, setOpen, setMinimized, chats, setActive, onPage } = useAssistant();
  const list = Object.values(chats);
  // The chat most worth your attention leads.
  const lead = list.find((c) => c.pending) ?? list.find((c) => c.busy) ?? list.find((c) => c.unseen);
  const mood = useMood(lead);
  const show = !onPage && ((open && minimized) || (!open && Boolean(lead)));

  const label = lead?.pending ? "Needs your approval" : lead?.busy ? "Working" : lead?.unseen ? "Answer ready" : "Tilly";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.9 }}
          transition={SPRING}
          className="fixed bottom-4 right-4 z-50 hidden lg:block"
        >
          <button
            type="button"
            onClick={() => {
              if (lead) setActive(lead.key);
              setOpen(true);
              setMinimized(false);
            }}
            className="tilly-hover group relative flex h-11 items-center gap-2.5 rounded-full border border-border/80 bg-card pl-2 pr-4 text-[13px] font-medium shadow-[0_16px_40px_-14px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5"
          >
            <TillyMark size={26} state={mood} reactive />
            <span className={cn(lead?.busy && !lead.pending && "tilly-shimmer", lead?.pending && "text-amber-600")}>{label}</span>
            {lead?.busy && lead.startedAt && <Elapsed since={lead.startedAt} />}
            {lead?.unseen && !lead.busy && !lead.pending && (
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
              </span>
            )}
            {lead && <span className="max-w-[160px] truncate text-[12px] font-normal text-muted-foreground">{lead.title}</span>}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

/** Panel shortcuts while Tilly is open: new chat, minimise, pop out, cycle tabs. */
function useShortcuts() {
  const { open, minimized, setMinimized, newChat, layout, setLayout, tabs, activeKey, setActive } = useAssistant();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const go = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (e.code === "KeyN") go(newChat);
      else if (e.code === "KeyM") go(() => setMinimized(!minimized));
      else if (e.code === "KeyP") go(() => setLayout({ mode: layout.mode === "floating" ? "docked" : "floating" }));
      else if (e.code === "BracketRight" || e.code === "BracketLeft") {
        go(() => {
          const i = tabs.indexOf(activeKey);
          const next = tabs[(i + (e.code === "BracketRight" ? 1 : -1) + tabs.length) % tabs.length];
          if (next) setActive(next);
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, minimized, setMinimized, newChat, layout.mode, setLayout, tabs, activeKey, setActive]);
}

/** Docked beside the page or floating anywhere on desktop; a drawer on small screens. */
export function AssistantDock() {
  const { open, setOpen, minimized, layout, onPage } = useAssistant();
  const desktop = useIsDesktop();
  useShortcuts();
  const visible = open && !minimized && !onPage;

  return (
    <>
      <AnimatePresence initial={false}>{visible && desktop && layout.mode === "docked" && <DockedColumn key="dock" />}</AnimatePresence>
      <AnimatePresence>{visible && desktop && layout.mode === "floating" && <FloatingWindow key="float" />}</AnimatePresence>
      <DockPill />

      <Sheet open={open && !desktop && !onPage} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md [&>button]:hidden">
          <SheetTitle className="sr-only">Tilly</SheetTitle>
          <PanelBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AssistantButton() {
  const { toggle, open, minimized, active, chats, onPage } = useAssistant();
  const mood = useMood(active);
  const anyPending = Object.values(chats).some((c) => c.pending);
  const anyUnseen = Object.values(chats).some((c) => c.unseen);
  if (onPage) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={toggle}
          aria-label="Ask Tilly"
          aria-pressed={open && !minimized}
          className={cn(
            "tilly-hover relative flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition-colors",
            open && !minimized
              ? "bg-tilly-50 text-tilly-700 dark:bg-tilly-700/15 dark:text-tilly-400"
              : "text-foreground/80 hover:bg-tilly-50 hover:text-tilly-700 dark:hover:bg-tilly-700/15"
          )}
        >
          <TillyMark size={18} state={mood} follow />
          <span className="hidden sm:inline">Ask Tilly</span>
          {(anyPending || anyUnseen) && (
            <span className={cn("absolute right-1 top-1 size-1.5 rounded-full ring-2 ring-background", anyPending ? "bg-amber-500" : "bg-sky-500")} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Ask Tilly <kbd className="ml-1 font-mono opacity-70">⌘I</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** A small warm chip that hands a question to Tilly. */
export function AskTilly({ prompt, children, className }: { prompt: string; children: React.ReactNode; className?: string }) {
  const { ask } = useAssistant();
  return (
    <button
      type="button"
      onClick={() => ask(prompt)}
      className={cn(
        "tilly-hover inline-flex h-7 items-center gap-1.5 rounded-full bg-tilly-50 pl-1.5 pr-2.5 text-[12.5px] font-medium text-tilly-700 transition-colors hover:bg-tilly-100 dark:bg-tilly-700/15 dark:text-tilly-400 dark:hover:bg-tilly-700/25",
        className
      )}
    >
      <TillyMark size={15} />
      {children}
    </button>
  );
}
