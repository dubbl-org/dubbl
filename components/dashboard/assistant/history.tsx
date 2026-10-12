"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pencil, Search, SquarePen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssistant, type HistoryItem } from "./assistant-context";
import { TillyMark } from "./tilly-mark";

function groupOf(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000;
  if (diff <= 0) return "Today";
  if (diff <= 1) return "Yesterday";
  if (diff < 7) return "This week";
  if (diff < 31) return "This month";
  return "Earlier";
}

function timeOf(iso: string) {
  const d = new Date(iso);
  const g = groupOf(iso);
  if (g === "Today" || g === "Yesterday") return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Past conversations, newest first and grouped by day. Rename with the pencil
 * or a double-click, delete from the row.
 */
export function History({ onPick, className, showNew = true }: { onPick?: () => void; className?: string; showNew?: boolean }) {
  const { history, refreshHistory, openConversation, deleteConversation, renameConversation, clearHistory, newChat, active, chats } = useAssistant();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const running = useMemo(() => new Set(Object.values(chats).flatMap((c) => (c.busy && c.id ? [c.id] : []))), [chats]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (history ?? []).filter((h) => !q || h.title.toLowerCase().includes(q));
    const out: { label: string; items: HistoryItem[] }[] = [];
    for (const h of list) {
      const label = groupOf(h.updatedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(h);
      else out.push({ label, items: [h] });
    }
    return out;
  }, [history, query]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="shrink-0 space-y-1.5 px-2 pb-2">
        {showNew && (
          <button
            type="button"
            onClick={() => {
              newChat();
              onPick?.();
            }}
            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-foreground/[0.04]"
          >
            <SquarePen className="size-3.5 text-tilly-600" />
            New chat
            <kbd className="ml-auto font-mono text-[10.5px] text-muted-foreground/60">⌥N</kbd>
          </button>
        )}
        <label className="flex h-8 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 text-[12.5px]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 scrollbar-none">
        {history === null ? (
          <div className="space-y-1.5 px-1 pt-2">
            {[70, 55, 82, 64].map((w, i) => (
              <div key={i} className="h-7 animate-pulse rounded-md bg-foreground/[0.04]" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center px-4 pt-10 text-center">
            <TillyMark size={26} state="muted" />
            <p className="mt-3 text-[12.5px] text-muted-foreground">{query ? "No chats match that." : "Your conversations with Tilly will show up here."}</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mt-2 first:mt-0">
              <p className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-muted-foreground/80">{g.label}</p>
              <AnimatePresence initial={false}>
                {g.items.map((h) => {
                  const isActive = active.id === h.id;
                  return (
                    <motion.div
                      key={h.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      {editing === h.id ? (
                        <input
                          autoFocus
                          defaultValue={h.title}
                          onBlur={(e) => {
                            const t = e.target.value.trim();
                            if (t && t !== h.title) renameConversation(h.id, t);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="h-8 w-full rounded-lg border border-tilly-300 bg-background px-2.5 text-[13px] outline-none ring-[3px] ring-tilly-100"
                        />
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            openConversation(h.id, h.title);
                            onPick?.();
                          }}
                          onDoubleClick={() => setEditing(h.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              openConversation(h.id, h.title);
                              onPick?.();
                            }
                          }}
                          className={cn(
                            "group flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
                            isActive ? "bg-foreground/[0.055] text-foreground" : "text-foreground/80 hover:bg-foreground/[0.035]"
                          )}
                        >
                          {running.has(h.id) ? (
                            <TillyMark size={10} state="thinking" />
                          ) : h.waiting ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-amber-500" title="Waiting for your approval" />
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{h.title}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground/60 group-hover:hidden">{timeOf(h.updatedAt)}</span>
                          <span className="hidden shrink-0 items-center group-hover:flex">
                            <button
                              type="button"
                              aria-label="Rename"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(h.id);
                              }}
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                            >
                              <Pencil className="size-3" />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteConversation(h.id);
                              }}
                              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      {history && history.length > 0 && (
        <div className="shrink-0 border-t border-border/60 px-2 py-2">
          {confirmClear ? (
            <div className="flex items-center gap-2 px-1 text-[12px]">
              <span className="flex-1 text-muted-foreground">Delete every chat?</span>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setConfirmClear(false);
                }}
                className="h-7 rounded-md bg-red-600 px-2.5 font-medium text-white hover:bg-red-700"
              >
                Delete all
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="h-7 rounded-md px-2 hover:bg-foreground/[0.05]">
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="h-7 w-full rounded-md px-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              Clear history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
