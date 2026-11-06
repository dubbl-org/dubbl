"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { pulseTilly } from "./tilly-mark";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface FileRef {
  type: "file";
  documentId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

/* The conversation in the stored message format, as the server keeps it. */
export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | FileRef;

export interface Message {
  role: "user" | "assistant";
  content: string | Block[];
}

export interface PendingAction {
  id: string;
  name: string;
  input: Record<string, unknown>;
  risk: "write" | "send";
  /** Input fields the tool takes in integer cents. */
  cents?: string[];
}

/** What streams in before the server sends the saved conversation. */
export type LiveBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; id: string; name: string; status: "running" | "done" | "failed" | "skipped"; auto?: boolean; startedAt: number };

export interface Upload {
  localId: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  error?: string;
  file?: FileRef;
  /** Object URL for image thumbnails. */
  preview?: string;
}

export interface Chat {
  /** Stable local key for the tab; the server id arrives with the first reply. */
  key: string;
  id: string | null;
  title: string;
  messages: Message[];
  pendingResults: Block[];
  pending: PendingAction | null;
  autoApprove: string[];
  /** The full transcript has been fetched from the server. */
  loaded: boolean;
  loading: boolean;
  busy: boolean;
  live: LiveBlock[];
  error: string | null;
  startedAt: number | null;
  /** Finished while you were looking elsewhere. */
  unseen: boolean;
  /** When the last run finished cleanly, for Tilly's happy bounce. */
  happyAt: number | null;
  draft: string;
  uploads: Upload[];
}

export interface HistoryItem {
  id: string;
  title: string;
  waiting: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Mode = "docked" | "floating";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  mode: Mode;
  dockWidth: number;
  rect: Rect | null;
}

interface AssistantState {
  /* window */
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  minimized: boolean;
  setMinimized: (m: boolean) => void;
  layout: Layout;
  setLayout: (patch: Partial<Layout>) => void;
  /** True on the full Tilly page, where the floating window stays out of the way. */
  onPage: boolean;
  /* chats */
  chats: Record<string, Chat>;
  tabs: string[];
  activeKey: string;
  active: Chat;
  setActive: (key: string) => void;
  newChat: () => string;
  closeTab: (key: string) => void;
  openConversation: (id: string, title?: string) => void;
  /* history */
  history: HistoryItem[] | null;
  refreshHistory: () => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  /* talking */
  notConfigured: boolean;
  send: (key: string, text: string) => void;
  /** Hand Tilly a prompt (and optionally files already stored in dubbl) from elsewhere in the app. */
  ask: (prompt: string, opts?: { newTab?: boolean; files?: FileRef[] }) => void;
  decide: (key: string, decision: "approve" | "deny", always?: boolean) => void;
  stop: (key: string) => void;
  setDraft: (key: string, text: string) => void;
  addFiles: (key: string, files: FileList | File[]) => void;
  removeUpload: (key: string, localId: string) => void;
}

const Ctx = createContext<AssistantState | null>(null);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const LAYOUT_KEY = "dubbl.tilly.layout";
const DEFAULT_LAYOUT: Layout = { mode: "docked", dockWidth: 420, rect: null };

const orgId = () => localStorage.getItem("activeOrgId");
const tabsKey = () => `dubbl.tilly.tabs.${orgId() ?? "default"}`;
const headers = (json = false): Record<string, string> => {
  const id = orgId();
  return { ...(json ? { "content-type": "application/json" } : {}), ...(id ? { "x-organization-id": id } : {}) };
};

let counter = 0;
const newKey = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

function blankChat(key: string, id: string | null = null, title = "New chat"): Chat {
  return {
    key,
    id,
    title,
    messages: [],
    pendingResults: [],
    pending: null,
    autoApprove: [],
    loaded: id === null,
    loading: false,
    busy: false,
    live: [],
    error: null,
    startedAt: null,
    unseen: false,
    happyAt: null,
    draft: "",
    uploads: [],
  };
}

export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.csv,.tsv,.txt,.json";

function uploadFile(file: File, onProgress: (p: number) => void): Promise<FileRef> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/assistant/files");
    for (const [k, v] of Object.entries(headers())) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: { file?: Omit<FileRef, "type">; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.file) resolve({ type: "file", ...data.file });
      else reject(new Error(data.error || "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection."));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function AssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const onPage = pathname === "/assistant" || pathname.startsWith("/assistant/");
  const [open, setOpenState] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [layout, setLayoutState] = useState<Layout>(DEFAULT_LAYOUT);
  const [notConfigured, setNotConfigured] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const first = useMemo(() => newKey(), []);
  const [chats, setChats] = useState<Record<string, Chat>>(() => ({ [first]: blankChat(first) }));
  const [tabs, setTabs] = useState<string[]>([first]);
  const [activeKey, setActiveKey] = useState(first);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const visibleRef = useRef({ open, minimized, activeKey, onPage });
  visibleRef.current = { open, minimized, activeKey, onPage };
  const aborts = useRef(new Map<string, AbortController>());

  const patch = useCallback((key: string, fn: (c: Chat) => Partial<Chat>) => {
    setChats((all) => (all[key] ? { ...all, [key]: { ...all[key], ...fn(all[key]) } } : all));
  }, []);

  /* ---------- persistence ---------- */

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      if (saved) setLayoutState({ ...DEFAULT_LAYOUT, ...saved });
    } catch {
      // ignore
    }
    try {
      const saved = JSON.parse(localStorage.getItem(tabsKey()) || "null") as { tabs: { key: string; id: string | null; title: string }[]; active: string } | null;
      if (saved?.tabs?.length) {
        const restored: Record<string, Chat> = {};
        for (const t of saved.tabs) restored[t.key] = blankChat(t.key, t.id, t.title);
        setChats(restored);
        setTabs(saved.tabs.map((t) => t.key));
        setActiveKey(restored[saved.active] ? saved.active : saved.tabs[0].key);
      }
    } catch {
      // ignore
    }
    // Conversations used to live in the browser; they now live on the server.
    localStorage.removeItem(`dubbl.tilly.${orgId() ?? "default"}`);
    setHydrated(true);
  }, []);

  const setLayout = useCallback((p: Partial<Layout>) => {
    setLayoutState((l) => {
      const next = { ...l, ...p };
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const tabSummary = JSON.stringify({
    tabs: tabs.flatMap((k) => (chats[k] ? [{ key: k, id: chats[k].id, title: chats[k].title }] : [])),
    active: activeKey,
  });
  useEffect(() => {
    // Never save the blank starting tab over the saved ones before they're restored.
    if (hydrated) localStorage.setItem(tabsKey(), tabSummary);
  }, [tabSummary, hydrated]);

  /* ---------- loading transcripts ---------- */

  const load = useCallback(
    async (key: string) => {
      const chat = chatsRef.current[key];
      if (!chat?.id || chat.loaded || chat.loading) return;
      patch(key, () => ({ loading: true }));
      try {
        const res = await fetch(`/api/v1/assistant/conversations/${chat.id}`, { headers: headers() });
        if (res.status === 404) {
          // Deleted elsewhere: start this tab afresh.
          patch(key, () => ({ ...blankChat(key), loading: false }));
          return;
        }
        if (!res.ok) throw new Error();
        const { conversation: c } = await res.json();
        patch(key, () => ({
          title: c.title,
          messages: c.messages ?? [],
          pendingResults: c.pendingResults ?? [],
          pending: c.pending ?? null,
          autoApprove: c.autoApprove ?? [],
          loaded: true,
          loading: false,
        }));
      } catch {
        patch(key, () => ({ loading: false, error: "Couldn't load this conversation." }));
      }
    },
    [patch]
  );

  useEffect(() => {
    if (open || onPage) load(activeKey);
  }, [activeKey, open, onPage, load]);

  const refreshHistory = useCallback(() => {
    fetch("/api/v1/assistant/conversations", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHistory(d.conversations))
      .catch(() => {});
  }, []);

  /* ---------- running ---------- */

  const run = useCallback(
    async (key: string, body: Record<string, unknown>, optimistic: Partial<Chat>) => {
      const before = chatsRef.current[key];
      if (!before) return;
      const controller = new AbortController();
      aborts.current.set(key, controller);
      patch(key, () => ({ ...optimistic, busy: true, error: null, live: [], startedAt: Date.now(), unseen: false, happyAt: null }));
      let failed = false;

      try {
        const res = await fetch("/api/v1/assistant/chat", {
          method: "POST",
          signal: controller.signal,
          headers: headers(true),
          body: JSON.stringify({ ...body, conversationId: before.id ?? undefined, page: pathname }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null);
          failed = true;
          // Nothing ran, so put the question back where it was typed.
          patch(key, () => ({
            messages: before.messages,
            pending: before.pending,
            draft: body.text ? String(body.text) : before.draft,
            uploads: before.uploads,
          }));
          if (data?.error === "not_configured") setNotConfigured(true);
          else patch(key, () => ({ error: data?.message || data?.error || "Could not reach Tilly." }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let split;
          while ((split = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            if (!frame.startsWith("data: ")) continue;
            const event = JSON.parse(frame.slice(6));
            switch (event.type) {
              case "conversation":
                patch(key, (c) => ({ id: event.id, title: c.id ? c.title : event.title, loaded: true }));
                break;
              case "text_delta":
                patch(key, (c) => {
                  const last = c.live[c.live.length - 1];
                  if (last?.kind === "text") return { live: [...c.live.slice(0, -1), { kind: "text", text: last.text + event.text }] };
                  return { live: [...c.live, { kind: "text", text: event.text }] };
                });
                break;
              case "tool_start":
                patch(key, (c) => ({ live: [...c.live, { kind: "tool", id: event.id, name: event.name, status: "running", startedAt: Date.now() }] }));
                break;
              case "tool_result":
                // Tilly's tools write straight to the books; refresh whatever's cached.
                if (event.ok && !event.skipped) window.dispatchEvent(new Event("dubbl:data-changed"));
                patch(key, (c) => ({
                  live: c.live.map((b) =>
                    b.kind === "tool" && b.id === event.id
                      ? { ...b, status: event.skipped ? "skipped" : event.ok ? "done" : "failed", auto: Boolean(event.auto) }
                      : b
                  ),
                }));
                break;
              case "state":
                patch(key, () => ({
                  messages: event.messages,
                  pendingResults: event.pendingResults ?? [],
                  pending: event.pending ?? null,
                  autoApprove: event.autoApprove ?? [],
                  live: [],
                }));
                break;
              case "error":
                failed = true;
                patch(key, () => ({ error: event.message }));
                break;
            }
          }
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          failed = true;
          patch(key, () => ({ error: "Could not reach Tilly." }));
        }
      } finally {
        aborts.current.delete(key);
        const v = visibleRef.current;
        const seen = (v.open && !v.minimized && v.activeKey === key) || (v.onPage && v.activeKey === key);
        patch(key, (c) => ({
          busy: false,
          live: [],
          startedAt: null,
          unseen: !seen,
          happyAt: !failed && !c.pending ? Date.now() : null,
        }));
        refreshHistory();
      }
    },
    [pathname, patch, refreshHistory]
  );

  const send = useCallback(
    (key: string, text: string) => {
      const chat = chatsRef.current[key];
      const trimmed = text.trim();
      if (!chat || chat.busy) return;
      if (chat.uploads.some((u) => u.status === "uploading")) return;
      const files = chat.uploads.flatMap((u) => (u.status === "ready" && u.file ? [u.file] : []));
      if (!trimmed && files.length === 0) return;
      const content: Block[] = [...files, ...(trimmed ? [{ type: "text" as const, text: trimmed }] : [])];
      pulseTilly();
      run(
        key,
        { text: trimmed || undefined, files: files.length ? files.map((f) => f.documentId) : undefined },
        {
          messages: [...chat.messages, { role: "user", content }],
          pending: null,
          draft: "",
          uploads: [],
          title: chat.messages.length === 0 ? (trimmed || files[0]?.fileName || chat.title).slice(0, 60) : chat.title,
        }
      );
    },
    [run]
  );

  const decide = useCallback(
    (key: string, decision: "approve" | "deny", always?: boolean) => {
      const chat = chatsRef.current[key];
      if (!chat?.pending || chat.busy) return;
      run(key, { approval: { toolUseId: chat.pending.id, decision, always } }, { pending: null });
    },
    [run]
  );

  const stop = useCallback((key: string) => aborts.current.get(key)?.abort(), []);

  const setDraft = useCallback((key: string, draft: string) => patch(key, () => ({ draft })), [patch]);

  const addFiles = useCallback(
    (key: string, list: FileList | File[]) => {
      const files = Array.from(list).slice(0, 8);
      for (const file of files) {
        const localId = newKey();
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        patch(key, (c) => ({
          uploads: [...c.uploads, { localId, name: file.name, size: file.size, type: file.type, status: "uploading", progress: 0, preview }],
        }));
        const update = (u: Partial<Upload>) =>
          patch(key, (c) => ({ uploads: c.uploads.map((x) => (x.localId === localId ? { ...x, ...u } : x)) }));
        uploadFile(file, (progress) => update({ progress }))
          .then((ref) => update({ status: "ready", progress: 1, file: ref }))
          .catch((err: Error) => update({ status: "failed", error: err.message }));
      }
    },
    [patch]
  );

  const removeUpload = useCallback(
    (key: string, localId: string) =>
      patch(key, (c) => {
        const u = c.uploads.find((x) => x.localId === localId);
        if (u?.preview) URL.revokeObjectURL(u.preview);
        return { uploads: c.uploads.filter((x) => x.localId !== localId) };
      }),
    [patch]
  );

  /* ---------- tabs ---------- */

  const setActive = useCallback(
    (key: string) => {
      setActiveKey(key);
      patch(key, () => ({ unseen: false }));
    },
    [patch]
  );

  const newChat = useCallback(() => {
    // Reuse an empty tab rather than piling up blank ones.
    const empty = tabs.find((k) => {
      const c = chatsRef.current[k];
      return c && !c.id && c.messages.length === 0 && !c.busy;
    });
    if (empty) {
      setActiveKey(empty);
      return empty;
    }
    const key = newKey();
    setChats((all) => ({ ...all, [key]: blankChat(key) }));
    setTabs((t) => [...t, key]);
    setActiveKey(key);
    return key;
  }, [tabs]);

  const closeTab = useCallback(
    (key: string) => {
      aborts.current.get(key)?.abort();
      const index = tabs.indexOf(key);
      const rest = tabs.filter((k) => k !== key);
      if (rest.length === 0) {
        const fresh = newKey();
        setChats({ [fresh]: blankChat(fresh) });
        setTabs([fresh]);
        setActiveKey(fresh);
        return;
      }
      setTabs(rest);
      setChats((all) => {
        const next = { ...all };
        delete next[key];
        return next;
      });
      if (activeKey === key) setActiveKey(rest[Math.max(0, index - 1)]);
    },
    [tabs, activeKey]
  );

  const openConversation = useCallback(
    (id: string, title?: string) => {
      const existing = tabs.find((k) => chatsRef.current[k]?.id === id);
      if (existing) {
        setActive(existing);
        return;
      }
      const key = newKey();
      // Replace an untouched blank tab instead of adding next to it.
      const blank = tabs.find((k) => {
        const c = chatsRef.current[k];
        return c && !c.id && c.messages.length === 0 && !c.busy && c.uploads.length === 0 && !c.draft;
      });
      setChats((all) => {
        const next = { ...all, [key]: blankChat(key, id, title) };
        if (blank) delete next[blank];
        return next;
      });
      setTabs((t) => (blank ? t.map((k) => (k === blank ? key : k)) : [...t, key]));
      setActiveKey(key);
    },
    [tabs, setActive]
  );

  /* ---------- history ---------- */

  const deleteConversation = useCallback(
    async (id: string) => {
      setHistory((h) => h?.filter((x) => x.id !== id) ?? h);
      const tab = tabs.find((k) => chatsRef.current[k]?.id === id);
      if (tab) closeTab(tab);
      await fetch(`/api/v1/assistant/conversations/${id}`, { method: "DELETE", headers: headers() }).catch(() => {});
    },
    [tabs, closeTab]
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      setHistory((h) => h?.map((x) => (x.id === id ? { ...x, title } : x)) ?? h);
      setChats((all) => {
        const next = { ...all };
        for (const k of Object.keys(next)) if (next[k].id === id) next[k] = { ...next[k], title };
        return next;
      });
      await fetch(`/api/v1/assistant/conversations/${id}`, { method: "PATCH", headers: headers(true), body: JSON.stringify({ title }) }).catch(() => {});
    },
    []
  );

  const clearHistory = useCallback(async () => {
    for (const c of aborts.current.values()) c.abort();
    const fresh = newKey();
    setChats({ [fresh]: blankChat(fresh) });
    setTabs([fresh]);
    setActiveKey(fresh);
    setHistory([]);
    await fetch("/api/v1/assistant/conversations", { method: "DELETE", headers: headers() }).catch(() => {});
  }, []);

  /* ---------- window ---------- */

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (next) setMinimized(false);
  }, []);
  const toggle = useCallback(() => {
    setOpenState((o) => {
      // A minimised Tilly comes back rather than closing.
      if (o && visibleRef.current.minimized) {
        setMinimized(false);
        return true;
      }
      if (!o) setMinimized(false);
      return !o;
    });
  }, []);

  useEffect(() => {
    if (open && !minimized) patch(activeKey, () => ({ unseen: false }));
  }, [open, minimized, activeKey, patch]);

  // Prompts handed over from elsewhere in the app.
  const [queued, setQueued] = useState<{ key: string; prompt: string } | null>(null);
  const ask = useCallback(
    (prompt: string, opts?: { newTab?: boolean; files?: FileRef[] }) => {
      if (!visibleRef.current.onPage) setOpen(true);
      // Each hand-over gets its own conversation unless the open one is still blank.
      const current = chatsRef.current[activeKey];
      const blank = current && !current.busy && !current.id && current.messages.length === 0;
      const key = blank && !opts?.newTab ? activeKey : newChat();
      if (opts?.files?.length) {
        const ready: Upload[] = opts.files.map((f) => ({
          localId: f.documentId,
          name: f.fileName,
          size: f.fileSize,
          type: f.mimeType,
          status: "ready",
          progress: 1,
          file: f,
        }));
        patch(key, () => ({ uploads: ready }));
      }
      setQueued({ key, prompt });
    },
    [activeKey, newChat, setOpen, patch]
  );
  useEffect(() => {
    if (!queued) return;
    const chat = chats[queued.key];
    if (chat && !chat.busy && !chat.loading) {
      setQueued(null);
      send(queued.key, queued.prompt);
    }
  }, [queued, chats, send]);

  // Check once, the first time Tilly is used
  const checkedRef = useRef(false);
  useEffect(() => {
    if (!(open || onPage) || checkedRef.current) return;
    checkedRef.current = true;
    fetch("/api/v1/assistant/chat", { headers: headers() })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.configured === false) setNotConfigured(true);
      })
      .catch(() => {});
    refreshHistory();
  }, [open, onPage, refreshHistory]);

  // ⌘I / Ctrl+I opens and closes Tilly from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const active = chats[activeKey] ?? chats[tabs[0]] ?? blankChat(activeKey);

  return (
    <Ctx.Provider
      value={{
        open,
        setOpen,
        toggle,
        minimized,
        setMinimized,
        layout,
        setLayout,
        onPage,
        chats,
        tabs,
        activeKey,
        active,
        setActive,
        newChat,
        closeTab,
        openConversation,
        history,
        refreshHistory,
        deleteConversation,
        renameConversation,
        clearHistory,
        notConfigured,
        send,
        ask,
        decide,
        stop,
        setDraft,
        addFiles,
        removeUpload,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

/** How Tilly should look for a chat right now. Happy lasts a moment after a clean finish. */
export function useMood(chat: Chat | undefined): "idle" | "thinking" | "attention" | "happy" {
  const [now, setNow] = useState(() => Date.now());
  const happyAt = chat?.happyAt ?? null;
  useEffect(() => {
    if (!happyAt) return;
    const left = happyAt + 1600 - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), left);
    return () => clearTimeout(t);
  }, [happyAt]);
  if (!chat) return "idle";
  if (chat.pending) return "attention";
  if (chat.busy) return "thinking";
  if (happyAt && now < happyAt + 1600) return "happy";
  return "idle";
}
