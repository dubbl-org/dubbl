"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  FileSpreadsheet,
  FileText,
  FileUp,
  HandCoins,
  History as HistoryIcon,
  Image as ImageIcon,
  Landmark,
  ListChecks,
  Receipt,
  Search,
  SquarePen,
  TrendingUp,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { ACCEPT, useAssistant, useMood, type Chat } from "@/components/dashboard/assistant/assistant-context";
import { Composer, DropZone } from "@/components/dashboard/assistant/composer";
import { History } from "@/components/dashboard/assistant/history";
import { NotConfigured } from "@/components/dashboard/assistant/assistant-panel";
import { LatestButton, Transcript, useStickToBottom } from "@/components/dashboard/assistant/transcript";
import { TillyMark } from "@/components/dashboard/assistant/tilly-mark";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 36 };

type Action =
  | { kind: "upload"; draft: string }
  | { kind: "send"; prompt: string }
  | { kind: "draft"; draft: string };

const ACTIONS: { icon: typeof Receipt; tint: string; title: string; body: string; action: Action }[] = [
  {
    icon: Receipt,
    tint: "#E8653C",
    title: "Book receipts and bills",
    body: "Drop photos or PDFs. Tilly reads them, checks for duplicates and books each one.",
    action: { kind: "upload", draft: "Please read these and book them. Check my books for duplicates first." },
  },
  {
    icon: Landmark,
    tint: "#0EA5E9",
    title: "Import a bank statement",
    body: "A CSV or PDF statement becomes matched, categorised bank lines.",
    action: { kind: "upload", draft: "Here's a bank statement. Tell me what's in it and help me import or match it." },
  },
  {
    icon: Search,
    tint: "#8B5CF6",
    title: "Find anything",
    body: "Search invoices, bills, payments, bank lines and files in one go.",
    action: { kind: "draft", draft: "Find " },
  },
  {
    icon: HandCoins,
    tint: "#F59E0B",
    title: "Chase late payers",
    body: "See who's late and send friendly reminders, with your OK.",
    action: { kind: "send", prompt: "Who owes me money and is late? Suggest who to chase first and draft friendly reminders." },
  },
  {
    icon: TrendingUp,
    tint: "#10B981",
    title: "Month in review",
    body: "Revenue, spending, profit and cash against last month.",
    action: { kind: "send", prompt: "Give me a review of this month so far: revenue, spending, profit and cash, compared with last month." },
  },
  {
    icon: ListChecks,
    tint: "#EC4899",
    title: "Tidy up the books",
    body: "Uncategorised bank lines, forgotten drafts and unpaid bills.",
    action: { kind: "send", prompt: "What needs tidying up in my books? Look for uncategorised bank lines, forgotten drafts and unpaid bills." },
  },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Hero({ chat, pickFiles, focus }: { chat: Chat; pickFiles: (draft: string) => void; focus: () => void }) {
  const { send, setDraft } = useAssistant();
  const mood = useMood(chat);

  const run = (a: Action) => {
    if (a.kind === "send") send(chat.key, a.prompt);
    else if (a.kind === "upload") pickFiles(a.draft);
    else {
      setDraft(chat.key, a.draft);
      focus();
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col px-5 pb-10 pt-[min(10vh,88px)]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-col items-center text-center">
        <span className="tilly-hover flex">
          <TillyMark size={60} state={mood} follow reactive />
        </span>
        <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.02em]">{greeting()}. What can I take off your plate?</h1>
        <p className="mt-2 max-w-[520px] text-[14px] leading-relaxed text-muted-foreground">
          Ask about your numbers, search everything at once, or hand me a pile of receipts. I always ask before changing anything.
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 }} className="mt-7">
        <Composer chat={chat} size="page" autoFocus />
      </motion.div>

      <motion.button
        type="button"
        onClick={() => pickFiles("Please read these and book them. Check my books for duplicates first.")}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        className="group relative mt-5 flex items-center gap-5 overflow-hidden rounded-2xl border border-dashed border-tilly-300/90 bg-gradient-to-br from-tilly-50 via-tilly-50/50 to-transparent px-6 py-6 text-left transition-colors hover:border-tilly-400 dark:border-tilly-700/50 dark:from-tilly-700/15"
      >
        <span className="relative flex h-16 w-28 shrink-0 items-center justify-center">
          {[
            { Icon: ImageIcon, tint: "#0EA5E9", r: -12, x: -26, y: 6 },
            { Icon: FileSpreadsheet, tint: "#10B981", r: 12, x: 26, y: 6 },
            { Icon: FileText, tint: "#EF4444", r: 0, x: 0, y: -4 },
          ].map(({ Icon, tint, r, x, y }, i) => (
            <span
              key={i}
              className="absolute flex size-11 items-center justify-center rounded-xl border border-border/70 bg-card shadow-[0_6px_16px_-8px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover:-translate-y-1"
              style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg)`, color: tint, transitionDelay: `${i * 40}ms` }}
            >
              <Icon className="size-5" />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Drop receipts, bills, invoices or bank statements</span>
          <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
            Drag them anywhere on this page. Tilly reads each one, searches your books for a match and books it with your approval, with the
            file attached.
          </span>
        </span>
        <span className="hidden h-9 shrink-0 items-center gap-1.5 rounded-lg bg-tilly-600 px-3.5 text-[13px] font-medium text-white transition-colors group-hover:bg-tilly-700 sm:flex">
          <FileUp className="size-4" />
          Choose files
        </span>
      </motion.button>

      <div className="mt-8 grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
        {ACTIONS.map((a, i) => (
          <motion.button
            key={a.title}
            type="button"
            onClick={() => run(a.action)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.14 + i * 0.04 }}
            whileHover={{ y: -2 }}
            className="group flex flex-col rounded-xl border border-border/80 bg-card p-4 text-left transition-shadow hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.25)]"
          >
            <span className="flex items-center justify-between">
              <span className="flex size-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${a.tint}17`, color: a.tint }}>
                <a.icon className="size-4" />
              </span>
              <ArrowUpRight className="size-3.5 text-muted-foreground/40 transition-colors group-hover:text-tilly-600" />
            </span>
            <span className="mt-3 text-[13.5px] font-semibold">{a.title}</span>
            <span className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{a.body}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { active, notConfigured, decide, addFiles, setDraft, newChat } = useAssistant();
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingDraft = useRef<string | null>(null);
  const { scrollRef, contentRef, away, toBottom } = useStickToBottom(active.key);
  const empty = active.messages.length === 0 && active.live.length === 0 && !active.busy && !active.loading;

  const actions = useMemo(
    () => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground lg:hidden"
      >
        <HistoryIcon className="size-3.5" />
        History
      </button>
      <button
        type="button"
        onClick={() => newChat()}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
      >
        <SquarePen className="size-3.5" />
        New chat
      </button>
    </div>
    ),
    [newChat]
  );
  useTopbarAction(actions);

  const pickFiles = (draft: string) => {
    pendingDraft.current = draft;
    fileRef.current?.click();
  };

  const focusComposer = () => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-tilly-page] textarea")?.focus());

  return (
    <div data-tilly-page className="@container flex min-h-0 flex-1 flex-col">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(active.key, e.target.files);
            if (pendingDraft.current && !active.draft) setDraft(active.key, pendingDraft.current);
            focusComposer();
          }
          pendingDraft.current = null;
          e.target.value = "";
        }}
      />

      <DropZone
        className="flex min-h-0 flex-1 flex-col"
        onFiles={(files) => {
          addFiles(active.key, files);
          if (!active.draft && empty) setDraft(active.key, "Please read these and book them. Check my books for duplicates first.");
          focusComposer();
        }}
        label="Drop to hand these to Tilly"
      >
        <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} className="h-full overflow-y-auto">
            <div ref={contentRef}>
              {notConfigured ? (
                <div className="pt-24">
                  <NotConfigured />
                </div>
              ) : empty ? (
                <Hero chat={active} pickFiles={pickFiles} focus={focusComposer} />
              ) : (
                <div className="mx-auto w-full max-w-[760px] px-5 pb-6 pt-8">
                  <Transcript key={active.key} chat={active} size="page" onDecide={(d, always) => decide(active.key, d, always)} />
                </div>
              )}
            </div>
          </div>
          <LatestButton show={away && !empty} onClick={toBottom} />
        </div>

        {!empty && !notConfigured && (
          <div className="shrink-0 px-5 pb-5 pt-2">
            <div className="mx-auto w-full max-w-[720px]">
              <Composer
                chat={active}
                size="page"
                autoFocus
                footer={
                  <p className="mt-2 text-center text-[11.5px] text-muted-foreground/70">
                    Tilly reads PDFs, photos and CSVs, and always asks before changing your books.
                  </p>
                }
              />
            </div>
          </div>
        )}
      </DropZone>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-[300px] gap-0 p-0 pt-4">
          <SheetTitle className="px-4 pb-2 text-[14px]">Chats</SheetTitle>
          <History className="min-h-0 flex-1" onPick={() => setHistoryOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
