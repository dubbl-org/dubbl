"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  CheckCheck,
  CircleDot,
  Inbox,
  Mail,
  MailOpen,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorState } from "@/components/dashboard/error-state";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { useApiCache, useApiRecords } from "@/lib/query/use-api";
import {
  CATEGORIES,
  DAY_GROUPS,
  categoryOf,
  dayGroup,
  fullTime,
  recordLink,
  shortTime,
  typeMeta,
  type CategoryKey,
  type InboxNotification,
} from "./meta";
import { PreferencesSheet } from "./preferences-sheet";

type Filter = "all" | "unread" | CategoryKey;

const LIST_URL = "/api/v1/notifications";
const UNDO_MS = 5000;
const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Requests                                                           */
/* ------------------------------------------------------------------ */

async function call<T = unknown>(url: string, init?: { method?: string; body?: unknown; keepalive?: boolean }): Promise<T> {
  const orgId = localStorage.getItem("activeOrgId");
  const headers: Record<string, string> = {};
  if (orgId) headers["x-organization-id"] = orgId;
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    keepalive: init?.keepalive,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function sendBulk(ids: string[], action: "read" | "unread" | "delete", keepalive = false) {
  for (let i = 0; i < ids.length; i += 500) {
    await call("/api/v1/notifications/bulk", { method: "POST", body: { ids: ids.slice(i, i + 500), action }, keepalive });
  }
}

/* ------------------------------------------------------------------ */
/*  Inbox                                                              */
/* ------------------------------------------------------------------ */

/** `openPreferences` starts with the preferences panel open. */
export function NotificationsInbox({ openPreferences = false }: { openPreferences?: boolean } = {}) {
  const router = useRouter();

  // Data
  const { rows, truncated, data, loading, error: loadError, refetch } = useApiRecords<InboxNotification>(LIST_URL);
  const error = loadError && !data ? "We couldn't load your notifications. Check your connection and try again." : null;
  // Removed rows stay hidden through the undo window (and any refresh that lands meanwhile)
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = useMemo(() => (hidden.size === 0 ? rows : rows.filter((r) => !hidden.has(r.id))), [rows, hidden]);
  const [intro, setIntro] = useState(true);
  const [now, setNow] = useState(() => new Date());

  // View
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Read while looking at "Unread": they stay put until the filter changes, so rows don't jump away
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [prefsOpen, setPrefsOpen] = useState(openPreferences);
  const searchRef = useRef<HTMLInputElement>(null);
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; ids: string[] }>());

  /* ----------------------------- load ----------------------------- */

  // Optimistic changes go straight into the cached pages; the next refresh confirms them
  const cache = useApiCache();
  const patchCache = useCallback(
    (fn: (list: InboxNotification[]) => InboxNotification[]) => cache.updateRows<InboxNotification>(LIST_URL, fn),
    [cache]
  );
  const setReadAt = useCallback(
    (readAt: Map<string, string | null>) => patchCache((list) => list.map((n) => (readAt.has(n.id) ? { ...n, readAt: readAt.get(n.id) ?? null } : n))),
    [patchCache]
  );
  const dropFromCache = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    patchCache((list) => list.filter((n) => !idSet.has(n.id)));
  }, [patchCache]);

  const reload = useCallback(() => void refetch(), [refetch]);

  // Rows slide in once, on first load; after that changes are instant
  useEffect(() => {
    if (loading || !intro) return;
    const t = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(t);
  }, [loading, intro]);

  // Keep "12m" honest
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Removals wait for the undo window; if the user leaves first, send them anyway
  useEffect(() => {
    const map = pending.current;
    const flush = () => {
      for (const [key, p] of map) {
        clearTimeout(p.timer);
        sendBulk(p.ids, "delete", true).catch(() => {});
        dropFromCache(p.ids);
        map.delete(key);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [dropFromCache]);

  /* ---------------------------- derive ---------------------------- */

  const q = search.trim().toLowerCase();
  const searched = useMemo(() => {
    if (!q) return items;
    return items.filter((n) =>
      [n.title, n.body ?? "", typeMeta(n.type).label, recordLink(n)?.label ?? ""].some((s) => s.toLowerCase().includes(q))
    );
  }, [items, q]);

  const unreadTotal = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const counts = useMemo(() => {
    const out = { all: searched.length, unread: 0, cat: {} as Record<string, { total: number; unread: number }> };
    for (const c of CATEGORIES) out.cat[c.key] = { total: 0, unread: 0 };
    for (const n of searched) {
      const c = out.cat[categoryOf(n.type)];
      c.total++;
      if (!n.readAt) {
        c.unread++;
        out.unread++;
      }
    }
    return out;
  }, [searched]);

  const visible = useMemo(() => {
    if (filter === "all") return searched;
    if (filter === "unread") return searched.filter((n) => !n.readAt || kept.has(n.id));
    return searched.filter((n) => categoryOf(n.type) === filter);
  }, [searched, filter, kept]);

  const groups = useMemo(
    () =>
      DAY_GROUPS.map((g) => ({ ...g, items: visible.filter((n) => dayGroup(n.createdAt, now) === g.key) })).filter(
        (g) => g.items.length > 0
      ),
    [visible, now]
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const order = useMemo(() => new Map(flat.map((n, i) => [n.id, i])), [flat]);

  const selectedIds = useMemo(() => flat.filter((n) => selected.has(n.id)).map((n) => n.id), [flat, selected]);
  const selectedUnread = useMemo(() => flat.filter((n) => selected.has(n.id) && !n.readAt).length, [flat, selected]);
  const allSelected = flat.length > 0 && selectedIds.length === flat.length;

  useDocumentTitle(unreadTotal > 0 ? `(${unreadTotal}) Notifications` : "Notifications");

  /* ---------------------------- actions --------------------------- */

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setKept(new Set());
    setSelected(new Set());
    setCursor(null);
  };

  const setRead = useCallback(
    async (ids: string[], read: boolean) => {
      const idSet = new Set(ids);
      const before = new Map(items.filter((n) => idSet.has(n.id) && Boolean(n.readAt) !== read).map((n) => [n.id, n.readAt]));
      if (before.size === 0) return;
      const stamp = new Date().toISOString();
      setReadAt(new Map([...before.keys()].map((id) => [id, read ? stamp : null])));
      if (read && filter === "unread") setKept((k) => new Set([...k, ...before.keys()]));
      try {
        const changed = [...before.keys()];
        if (changed.length === 1) await call(`/api/v1/notifications/${changed[0]}/read`, { method: read ? "POST" : "DELETE" });
        else await sendBulk(changed, read ? "read" : "unread");
      } catch {
        setReadAt(before);
        toast.error(read ? "Couldn't mark as read. Try again." : "Couldn't mark as unread. Try again.");
      }
    },
    [items, filter, setReadAt]
  );

  const markAllRead = async () => {
    const before = new Map(items.filter((n) => !n.readAt).map((n) => [n.id, n.readAt]));
    if (before.size === 0) return;
    const stamp = new Date().toISOString();
    setReadAt(new Map([...before.keys()].map((id) => [id, stamp])));
    if (filter === "unread") setKept((k) => new Set([...k, ...before.keys()]));
    try {
      await call("/api/v1/notifications/read-all", { method: "POST" });
      toast.success(`Marked ${before.size} as read`);
    } catch {
      setReadAt(before);
      toast.error("Couldn't mark everything as read. Try again.");
    }
  };

  const remove = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const removed = items.filter((n) => idSet.has(n.id));
      if (removed.length === 0) return;

      // Keep the keyboard cursor on the row that slides up into place
      if (cursor && idSet.has(cursor)) {
        const idx = flat.findIndex((n) => n.id === cursor);
        const next = flat.slice(idx + 1).find((n) => !idSet.has(n.id)) ?? flat.slice(0, idx).reverse().find((n) => !idSet.has(n.id));
        setCursor(next?.id ?? null);
      }
      setHidden((prev) => new Set([...prev, ...idSet]));
      setSelected((prev) => new Set([...prev].filter((id) => !idSet.has(id))));

      const key = removed[0].id;
      const restore = () => setHidden((prev) => new Set([...prev].filter((id) => !idSet.has(id))));
      const commit = async () => {
        pending.current.delete(key);
        try {
          if (removed.length === 1) await call(`/api/v1/notifications/${removed[0].id}`, { method: "DELETE" });
          else await sendBulk(removed.map((n) => n.id), "delete");
          dropFromCache(removed.map((n) => n.id));
        } catch {
          restore();
          toast.error("Couldn't remove that. It's back in your inbox.");
        }
      };
      pending.current.set(key, { timer: setTimeout(commit, UNDO_MS), ids: removed.map((n) => n.id) });

      toast(removed.length === 1 ? "Notification removed" : `${removed.length} notifications removed`, {
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            const p = pending.current.get(key);
            if (!p) return;
            clearTimeout(p.timer);
            pending.current.delete(key);
            restore();
          },
        },
      });
    },
    [items, cursor, flat, dropFromCache]
  );

  const open = useCallback(
    (n: InboxNotification) => {
      setCursor(n.id);
      if (!n.readAt) setRead([n.id], true);
      const href = recordLink(n)?.href;
      if (href) router.push(href);
      else
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(n.id)) next.delete(n.id);
          else next.add(n.id);
          return next;
        });
    },
    [router, setRead]
  );

  const clickRow = (n: InboxNotification) => {
    setCursor(n.id);
    if (!n.readAt) setRead([n.id], true);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* --------------------------- keyboard --------------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (prefsOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"],[role="menu"]')) return;

      const idx = cursor ? flat.findIndex((n) => n.id === cursor) : -1;
      const current = idx >= 0 ? flat[idx] : null;
      const move = (delta: number) => {
        if (flat.length === 0) return;
        const next = idx < 0 ? (delta > 0 ? 0 : flat.length - 1) : Math.min(flat.length - 1, Math.max(0, idx + delta));
        setCursor(flat[next].id);
      };

      let handled = true;
      switch (e.key) {
        case "/":
          searchRef.current?.focus();
          break;
        case "j":
          move(1);
          break;
        case "k":
          move(-1);
          break;
        case "ArrowDown":
          if (idx < 0) handled = false;
          else move(1);
          break;
        case "ArrowUp":
          if (idx < 0) handled = false;
          else move(-1);
          break;
        case "Enter":
          if (current) open(current);
          else handled = false;
          break;
        case "e":
        case "m": {
          const ids = selectedIds.length > 0 ? selectedIds : current ? [current.id] : [];
          if (ids.length === 0) break;
          const anyUnread = flat.some((n) => ids.includes(n.id) && !n.readAt);
          setRead(ids, anyUnread);
          break;
        }
        case "x":
          if (current) toggleSelect(current.id);
          break;
        case "#":
        case "Delete": {
          const ids = selectedIds.length > 0 ? selectedIds : current ? [current.id] : [];
          if (ids.length > 0) remove(ids);
          break;
        }
        case "Escape":
          if (selectedIds.length > 0) setSelected(new Set());
          else if (cursor) setCursor(null);
          else handled = false;
          break;
        default:
          handled = false;
      }
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefsOpen, cursor, flat, selectedIds, open, setRead, remove]);

  useEffect(() => {
    if (cursor) document.getElementById(`notif-${cursor}`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  /* ---------------------------- render ---------------------------- */

  const activeCategory = CATEGORIES.find((c) => c.key === filter);

  return (
    <div className="@container">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em]">Notifications</h2>
          <div className="mt-1 flex h-5 items-center text-[13.5px] text-muted-foreground">
            {loading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <span>
                {unreadTotal > 0 ? (
                  <>
                    <span className="font-medium tabular-nums text-foreground">{unreadTotal}</span> unread
                  </>
                ) : items.length > 0 ? (
                  "Nothing unread"
                ) : (
                  "Nothing needs you right now"
                )}
                {items.length > 0 && (
                  <>
                    <span className="text-muted-foreground/60"> · </span>
                    <span className="tabular-nums">{items.length.toLocaleString()}</span> in your inbox
                  </>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ToolbarButton onClick={markAllRead} disabled={loading || unreadTotal === 0}>
            <CheckCheck className="size-3.5" />
            Mark all as read
          </ToolbarButton>
          <ToolbarButton onClick={() => setPrefsOpen(true)} aria-label="Notification preferences">
            <Settings2 className="size-3.5" />
            <span className="hidden @lg:inline">Preferences</span>
          </ToolbarButton>
        </div>
      </div>

      <div className="mt-5 grid gap-6 @3xl:grid-cols-[208px_minmax(0,1fr)]">
        {/* Filters: a column when there's room */}
        <nav aria-label="Filter notifications" className="hidden @3xl:block">
          <div className="space-y-px">
            <FilterItem icon={Inbox} label="All" count={counts.all} active={filter === "all"} onClick={() => changeFilter("all")} loading={loading} />
            <FilterItem icon={CircleDot} label="Unread" count={counts.unread} active={filter === "unread"} onClick={() => changeFilter("unread")} loading={loading} strong />
          </div>
          <p className="mb-1 mt-5 px-2.5 text-[11.5px] font-medium text-muted-foreground">Categories</p>
          <div className="space-y-px">
            {CATEGORIES.map((c) => (
              <FilterItem
                key={c.key}
                dot={c.color}
                label={c.label}
                count={counts.cat[c.key].total}
                hasUnread={counts.cat[c.key].unread > 0}
                active={filter === c.key}
                onClick={() => changeFilter(filter === c.key ? "all" : c.key)}
                loading={loading}
              />
            ))}
          </div>
        </nav>

        <div className="min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card">
          {/* Filters: a row when the column doesn't fit */}
          <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-2 scrollbar-none @3xl:hidden">
            <Chip label="All" count={counts.all} active={filter === "all"} onClick={() => changeFilter("all")} />
            <Chip label="Unread" count={counts.unread} active={filter === "unread"} onClick={() => changeFilter("unread")} />
            {CATEGORIES.filter((c) => counts.cat[c.key].total > 0 || filter === c.key).map((c) => (
              <Chip
                key={c.key}
                dot={c.color}
                label={c.label}
                count={counts.cat[c.key].total}
                active={filter === c.key}
                onClick={() => changeFilter(filter === c.key ? "all" : c.key)}
              />
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 border-b border-border/60 py-2 pl-3.5 pr-3">
            <Checkbox
              checked={allSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(flat.map((n) => n.id)))}
              disabled={flat.length === 0}
              aria-label="Select all"
            />
            <div className="relative min-w-0 flex-1 @3xl:max-w-[340px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search notifications…"
                className="h-8 w-full rounded-lg bg-foreground/[0.04] pl-8 pr-8 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-border"
              />
              {search ? (
                <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground/60">/</kbd>
              )}
            </div>
            <span className="ml-auto hidden shrink-0 text-[12.5px] tabular-nums text-muted-foreground @xl:inline">
              {loading ? "" : activeCategory ? `${visible.length} in ${activeCategory.label.toLowerCase()}` : `${visible.length.toLocaleString()} shown`}
            </span>
          </div>

          {/* List */}
          <div className="max-h-[max(440px,calc(100svh-282px))] overflow-y-auto overscroll-contain" aria-label="Notifications">
            {error ? (
              <ErrorState message={error} onRetry={reload} />
            ) : loading ? (
              <ListSkeleton />
            ) : flat.length === 0 ? (
              <EmptyInbox
                kind={q ? "search" : items.length === 0 ? "none" : filter === "unread" ? "unread" : "filter"}
                query={search.trim()}
                category={activeCategory?.label}
                onClearSearch={() => setSearch("")}
                onShowAll={() => changeFilter("all")}
                onPreferences={() => setPrefsOpen(true)}
              />
            ) : (
              <AnimatePresence initial={false}>
                {groups.map((g) => {
                  const groupUnread = g.items.filter((n) => !n.readAt);
                  return (
                    <motion.section
                      key={g.key}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    >
                      <div className="sticky top-0 z-10 flex h-8 items-center gap-2 border-b border-border/60 bg-card/95 px-3.5 text-[12px] backdrop-blur-sm">
                        <span className="font-medium text-foreground/80">{g.label}</span>
                        <span className="tabular-nums text-muted-foreground">{g.items.length}</span>
                        {groupUnread.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setRead(groupUnread.map((n) => n.id), true)}
                            className="ml-auto rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                          >
                            Mark {groupUnread.length} read
                          </button>
                        )}
                      </div>
                      <AnimatePresence initial={false}>
                        {g.items.map((n) => (
                          <Row
                            key={n.id}
                            n={n}
                            now={now}
                            intro={intro}
                            index={order.get(n.id) ?? 0}
                            isCursor={cursor === n.id}
                            isSelected={selected.has(n.id)}
                            selecting={selectedIds.length > 0}
                            isExpanded={expanded.has(n.id)}
                            onClick={() => clickRow(n)}
                            onOpen={() => open(n)}
                            onToggleSelect={() => toggleSelect(n.id)}
                            onToggleRead={() => setRead([n.id], !n.readAt)}
                            onRemove={() => remove([n.id])}
                            onLinkClick={() => !n.readAt && setRead([n.id], true)}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.section>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Footer */}
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3.5 py-2 text-[12px] text-muted-foreground">
              <span className="tabular-nums">
                {truncated ? `Showing your latest ${items.length.toLocaleString()}` : `${items.length.toLocaleString()} notification${items.length === 1 ? "" : "s"}`}
              </span>
              <span className="hidden items-center gap-3 @2xl:flex">
                <Hint keys={["j", "k"]} label="move" />
                <Hint keys={["↵"]} label="open" />
                <Hint keys={["e"]} label="read" />
                <Hint keys={["x"]} label="select" />
                <Hint keys={["#"]} label="remove" />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bulk bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
          >
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-popover py-1.5 pl-3.5 pr-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
              <span className="shrink-0 pr-1 text-[13px]">
                <span className="font-semibold tabular-nums">{selectedIds.length}</span> selected
              </span>
              <span className="mx-1 h-5 w-px shrink-0 bg-border" />
              <ToolbarButton onClick={() => setRead(selectedIds, true)} disabled={selectedUnread === 0}>
                <MailOpen className="size-3.5" />
                Mark read
              </ToolbarButton>
              <ToolbarButton onClick={() => setRead(selectedIds, false)} disabled={selectedUnread === selectedIds.length}>
                <Mail className="size-3.5" />
                Mark unread
              </ToolbarButton>
              <ToolbarButton onClick={() => remove(selectedIds)} className="hover:text-red-600 dark:hover:text-red-400">
                <Trash2 className="size-3.5" />
                Remove
              </ToolbarButton>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                aria-label="Clear selection"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PreferencesSheet open={prefsOpen} onOpenChange={setPrefsOpen} onInboxChange={reload} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Row                                                                */
/* ------------------------------------------------------------------ */

function Row({
  n,
  now,
  intro,
  index,
  isCursor,
  isSelected,
  selecting,
  isExpanded,
  onClick,
  onOpen,
  onToggleSelect,
  onToggleRead,
  onRemove,
  onLinkClick,
}: {
  n: InboxNotification;
  now: Date;
  intro: boolean;
  index: number;
  isCursor: boolean;
  isSelected: boolean;
  selecting: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onOpen: () => void;
  onToggleSelect: () => void;
  onToggleRead: () => void;
  onRemove: () => void;
  onLinkClick: () => void;
}) {
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  const link = recordLink(n);
  const unread = !n.readAt;

  return (
    <motion.div
      id={`notif-${n.id}`}
      initial={intro ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2, ease: EASE } }}
      transition={{ duration: 0.32, ease: EASE, delay: intro ? Math.min(index, 16) * 0.02 : 0 }}
      className="scroll-mb-2 scroll-mt-9 overflow-hidden"
    >
      <div
        onClick={onClick}
        onDoubleClick={() => link?.href && onOpen()}
        aria-current={isCursor || undefined}
        className={cn(
          "group/row relative flex cursor-pointer items-start gap-3 border-b border-border/50 py-2.5 pl-3.5 pr-3 transition-colors",
          isCursor ? "bg-foreground/[0.055]" : isSelected ? "bg-foreground/[0.035]" : "hover:bg-foreground/[0.025]"
        )}
      >
        <div className="flex h-8 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label="Select notification"
            className={cn(
              "transition-opacity data-[state=checked]:opacity-100",
              selecting || isCursor ? "opacity-70" : "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-70"
            )}
          />
        </div>

        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${meta.color}14`, color: meta.color }}>
          <Icon className="size-4" strokeWidth={1.8} />
        </span>

        <div className="min-w-0 flex-1 py-px">
          <p className={cn("truncate text-[13.5px] leading-5", unread ? "font-medium text-foreground" : "text-foreground/70")}>{n.title}</p>
          {n.body && (
            <p className={cn("text-[12.5px] leading-[18px] text-muted-foreground", isExpanded ? "whitespace-pre-line break-words" : "truncate")}>{n.body}</p>
          )}
          {isExpanded && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground/80">
              <span>{meta.label}</span>
              <span>·</span>
              <span>{fullTime(n.createdAt)}</span>
              {link?.href && (
                <>
                  <span>·</span>
                  <Link href={link.href} onClick={(e) => { e.stopPropagation(); onLinkClick(); }} className="inline-flex items-center gap-0.5 font-medium text-foreground/80 hover:text-foreground">
                    Open {link.label}
                    <ArrowUpRight className="size-3" />
                  </Link>
                </>
              )}
            </p>
          )}
        </div>

        {/* Right side: record, then time + unread dot, swapped for actions on hover */}
        <div className="flex h-8 shrink-0 items-center gap-2">
          {link && (
            <span className="hidden @xl:inline-flex">
              {link.href ? (
                <Link
                  href={link.href}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkClick();
                  }}
                  className={cn(
                    "inline-flex h-[22px] max-w-[140px] items-center gap-1 truncate rounded-md bg-foreground/[0.045] px-1.5 text-[11.5px] text-foreground/75 transition-colors hover:bg-foreground/[0.08] hover:text-foreground",
                    link.mono && "font-mono text-[11px]"
                  )}
                >
                  {link.label}
                </Link>
              ) : (
                <span className={cn("inline-flex h-[22px] items-center rounded-md bg-foreground/[0.03] px-1.5 text-[11.5px] text-muted-foreground", link.mono && "font-mono text-[11px]")}>
                  {link.label}
                </span>
              )}
            </span>
          )}

          <div className="relative flex h-8 w-[92px] items-center justify-end">
            <div className={cn("flex items-center gap-2.5 transition-opacity group-hover/row:opacity-0", isCursor && "opacity-0")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <time dateTime={n.createdAt} className="text-[12px] tabular-nums text-muted-foreground">
                    {shortTime(n.createdAt, now)}
                  </time>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[12px]">{fullTime(n.createdAt)}</TooltipContent>
              </Tooltip>
              <span className="flex w-2 justify-center">
                <AnimatePresence initial={false}>
                  {unread && (
                    <motion.span
                      key="dot"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 30 }}
                      className="size-[7px] rounded-full bg-blue-500"
                      aria-label="Unread"
                    />
                  )}
                </AnimatePresence>
              </span>
            </div>

            <div
              className={cn(
                "absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 [&:has(:focus-visible)]:opacity-100",
                isCursor && "opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <RowAction label={unread ? "Mark as read (e)" : "Mark as unread (e)"} onClick={onToggleRead}>
                {unread ? <MailOpen className="size-3.5" /> : <Mail className="size-3.5" />}
              </RowAction>
              {link?.href && (
                <RowAction label="Open (Enter)" onClick={onOpen}>
                  <ArrowUpRight className="size-3.5" />
                </RowAction>
              )}
              <RowAction label="Remove (#)" onClick={onRemove} danger>
                <Trash2 className="size-3.5" />
              </RowAction>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RowAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground",
            danger && "hover:text-red-600 dark:hover:text-red-400"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[12px]">{label}</TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function ToolbarButton({ className, children, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 px-2.5 text-[13px] text-foreground/75 transition-colors hover:bg-foreground/[0.03] hover:text-foreground disabled:pointer-events-none disabled:opacity-45",
        className
      )}
    >
      {children}
    </button>
  );
}

function FilterItem({
  icon: Icon,
  dot,
  label,
  count,
  active,
  hasUnread,
  strong,
  loading,
  onClick,
}: {
  icon?: typeof Inbox;
  dot?: string;
  label: string;
  count: number;
  active: boolean;
  hasUnread?: boolean;
  strong?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] transition-colors",
        active ? "bg-foreground/[0.055] font-medium text-foreground" : hasUnread ? "font-medium text-foreground hover:bg-foreground/[0.03]" : "text-foreground/70 hover:bg-foreground/[0.03] hover:text-foreground",
        !loading && count === 0 && !active && "opacity-55"
      )}
    >
      {Icon ? (
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <span className="flex size-3.5 shrink-0 items-center justify-center">
          <span className="size-2 rounded-full" style={{ backgroundColor: dot }} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">
        {label}
        {hasUnread && <span className="sr-only"> (has unread)</span>}
      </span>
      {loading ? (
        <Skeleton className="h-3 w-4" />
      ) : (
        <span className={cn("text-[12px] tabular-nums", strong && count > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>{count}</span>
      )}
    </button>
  );
}

function Chip({ dot, label, count, active, onClick }: { dot?: string; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] transition-colors",
        active ? "bg-foreground/[0.055] font-medium text-foreground" : "text-foreground/70 hover:bg-foreground/[0.03] hover:text-foreground"
      )}
    >
      {dot && <span className="size-2 rounded-full" style={{ backgroundColor: dot }} />}
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border/80 px-1 font-mono text-[10.5px] text-foreground/70">
          {k}
        </kbd>
      ))}
      <span className="ml-0.5">{label}</span>
    </span>
  );
}

function EmptyInbox({
  kind,
  query,
  category,
  onClearSearch,
  onShowAll,
  onPreferences,
}: {
  kind: "none" | "unread" | "filter" | "search";
  query: string;
  category?: string;
  onClearSearch: () => void;
  onShowAll: () => void;
  onPreferences: () => void;
}) {
  const copy = {
    none: {
      title: "You're all caught up",
      body: "Overdue invoices, approvals, low balances and anything else that needs you will land here.",
      action: { label: "Choose what you hear about", onClick: onPreferences },
    },
    unread: {
      title: "You're all caught up",
      body: "Nothing unread. Everything you've already seen is still under All.",
      action: { label: "Show all", onClick: onShowAll },
    },
    filter: {
      title: `Nothing in ${category?.toLowerCase() ?? "this category"}`,
      body: "Notifications of this kind will show up here when they arrive.",
      action: { label: "Show all", onClick: onShowAll },
    },
    search: {
      title: `No notifications match “${query}”`,
      body: "Try another word, or search by a document number like INV-0042.",
      action: { label: "Clear search", onClick: onClearSearch },
    },
  }[kind];

  return (
    <div className="flex flex-col items-center px-6 py-20 text-center">
      <span className="flex size-10 items-center justify-center rounded-xl bg-foreground/[0.045] text-muted-foreground">
        {kind === "search" ? <Search className="size-[18px]" /> : <CheckCheck className="size-[18px]" />}
      </span>
      <p className="mt-4 text-[14px] font-medium">{copy.title}</p>
      <p className="mt-1 max-w-[340px] text-[13px] leading-relaxed text-muted-foreground">{copy.body}</p>
      <button
        type="button"
        onClick={copy.action.onClick}
        className="mt-4 inline-flex h-8 items-center rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03]"
      >
        {copy.action.label}
      </button>
    </div>
  );
}

function ListSkeleton() {
  const widths = [62, 48, 70, 54, 40, 66, 58, 45];
  return (
    <div aria-hidden>
      <div className="flex h-8 items-center border-b border-border/60 px-3.5">
        <Skeleton className="h-3 w-14" />
      </div>
      {widths.map((w, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-border/50 py-2.5 pl-3.5 pr-3">
          <span className="w-4 shrink-0" />
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5 py-1">
            <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
            <Skeleton className="h-3" style={{ width: `${w - 14}%` }} />
          </div>
          <Skeleton className="mt-2.5 h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
