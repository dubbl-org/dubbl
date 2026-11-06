"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Pause, Play, ArrowUpRight, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useTopbarAction } from "@/components/dashboard/topbar";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MutedCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { useApi } from "@/lib/query/use-api";

interface JournalLine {
  id: string;
  description: string;
  accountId: string | null;
  debitAmount: number;
  creditAmount: number;
  sortOrder: number;
}

interface RecurringJournal {
  id: string;
  name: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastRunDate: string | null;
  occurrencesGenerated: number;
  maxOccurrences: number | null;
  reference: string | null;
  notes: string | null;
  currencyCode: string;
  createdAt: string;
  lines: JournalLine[];
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "On", color: "#0EA5E9", hint: "Posts by itself on schedule" },
  { value: "paused", label: "Paused", color: "#F59E0B", hint: "Not posting until you resume it. Missed dates aren't filled in" },
  { value: "completed", label: "Finished", color: "#10B981", hint: "Reached its end date or its number of entries" },
];

const FREQUENCIES: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Twice a year",
  annual: "Yearly",
};

/** How many times each schedule runs in an average month. */
const PER_MONTH: Record<string, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  semi_annual: 1 / 6,
  annual: 1 / 12,
};

const perEntry = (t: RecurringJournal) => (t.lines ?? []).reduce((s, l) => s + l.debitAmount, 0);
const perMonth = (t: RecurringJournal) => Math.round(perEntry(t) * (PER_MONTH[t.frequency] ?? 1));
const isOn = (t: RecurringJournal) => t.status === "active";
const sortedLines = (t: RecurringJournal) => [...(t.lines ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

/** Chart account names, so templates can be searched and filtered by account. */
function useAccountNames() {
  const { data } = useApi<{ accounts?: { id: string; code: string; name: string }[] }>("/api/v1/accounts");
  return useMemo<Record<string, string>>(() => {
    const list = data?.accounts ?? [];
    return Object.fromEntries(list.map((a) => [a.id, a.code ? `${a.code} · ${a.name}` : a.name]));
  }, [data]);
}

async function toggle(list: RecurringJournal[], to: "paused" | "active", helpers: ExplorerHelpers) {
  let ok = 0;
  let failed = 0;
  for (const t of list) {
    try {
      await postJson(`/api/v1/recurring-journals/${t.id}/pause`);
      ok++;
    } catch {
      failed++;
    }
  }
  const verb = to === "paused" ? "Paused" : "Resumed";
  if (ok) toast.success(list.length === 1 ? `${verb} "${list[0].name}"` : `${verb} ${ok} recurring journal${ok === 1 ? "" : "s"}`);
  if (failed) toast.error(`${failed} couldn't be ${to === "paused" ? "paused" : "resumed"}`);
  helpers.clearSelection();
  if (ok) helpers.refresh();
}

export default function RecurringJournalsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const accounts = useAccountNames();
  const [running, setRunning] = useState(false);

  useDocumentTitle("Accounting · Recurring Journals");

  // Post everything that's due now, the same as the daily scheduler does
  useTopbarAction(
    useMemo(() => {
      async function postDue() {
        setRunning(true);
        try {
          const data = await postJson<{ posted?: number }>("/api/v1/recurring-journals/run");
          const posted = data.posted ?? 0;
          toast.success(posted > 0 ? `Posted ${posted} entr${posted === 1 ? "y" : "ies"} that were due` : "Nothing was due to post right now");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't post the entries");
        } finally {
          setRunning(false);
        }
      }
      return (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg px-3 text-[13px]"
          onClick={postDue}
          disabled={running}
          title="Post every entry that's due today or earlier, across all recurring journals that are on"
        >
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          <span className="hidden sm:inline">{running ? "Posting..." : "Post what's due"}</span>
        </Button>
      );
    }, [running])
  );

  const config = useMemo<ExplorerConfig<RecurringJournal>>(() => {
    const accountName = (id: string | null | undefined) => (id ? accounts[id] : undefined) ?? null;
    /** The account that takes the biggest debit, as a quick "what is this for". */
    const mainAccount = (t: RecurringJournal) => {
      const top = [...(t.lines ?? [])].sort((a, b) => b.debitAmount - a.debitAmount)[0];
      return accountName(top?.accountId);
    };
    const money = (t: RecurringJournal, cents: number) => formatMoney(cents, t.currencyCode || "USD");

    return {
      id: "recurring-journals",
      endpoint: "/api/v1/recurring-journals",
      noun: { one: "Recurring journal", many: "Recurring journals" },
      getId: (t) => t.id,
      href: (t) => `/accounting/recurring-journals/${t.id}`,
      status: { get: (t) => t.status, options: STATUSES },
      date: { get: (t) => t.nextRunDate, label: "Next entry" },
      currency: (t) => t.currencyCode,
      search: (t) => [t.name, t.reference, t.notes, ...(t.lines ?? []).flatMap((l) => [l.description, accountName(l.accountId)])],
      defaultSort: { key: "next", dir: "asc" },
      facets: [
        { key: "frequency", label: "How often", value: (t) => FREQUENCIES[t.frequency] ?? t.frequency },
        { key: "account", label: "Main account", value: mainAccount },
        { key: "ends", label: "Ends", value: (t) => (t.endDate || t.maxOccurrences ? "Has an end" : "Runs until stopped") },
      ],
      columns: [
        {
          key: "name",
          label: "Name",
          value: (t) => t.name,
          render: (t) => <span className="block truncate font-medium">{t.name}</span>,
        },
        { key: "frequency", label: "How often", className: "w-32", value: (t) => FREQUENCIES[t.frequency] ?? t.frequency },
        { key: "perEntry", label: "Each entry", align: "right", className: "w-32", money: true, hint: "The total of the debit side posted each time", value: perEntry },
        { key: "perMonth", label: "Per month", align: "right", className: "w-32", money: true, hint: "Each entry times how often it runs, as a monthly figure", value: (t) => (isOn(t) ? perMonth(t) : 0) },
        {
          key: "next",
          label: "Next entry",
          className: "w-44",
          value: (t) => (t.status === "completed" ? null : t.nextRunDate),
          render: (t) => (t.status === "completed" ? <span className="text-muted-foreground/50">—</span> : <DueCell value={t.nextRunDate} open={isOn(t)} lateWord="late" />),
        },
        { key: "last", label: "Last entry", className: "w-32", value: (t) => t.lastRunDate, render: (t) => <DateCell value={t.lastRunDate} /> },
        {
          key: "posted",
          label: "Posted",
          align: "right",
          className: "w-24",
          hint: "Entries posted so far, out of the limit if there is one",
          value: (t) => t.occurrencesGenerated,
          render: (t) => (
            <span className="tabular-nums">
              {t.occurrencesGenerated} <span className="text-muted-foreground">/ {t.maxOccurrences ?? "∞"}</span>
            </span>
          ),
          csv: (t) => `${t.occurrencesGenerated}/${t.maxOccurrences ?? ""}`,
        },
        { key: "status", label: "Status", className: "w-28", value: (t) => t.status, render: (t) => <StatusPill value={t.status} options={STATUSES} /> },
        { key: "account", label: "Main account", className: "w-48", hidden: true, value: mainAccount, render: (t) => <MutedCell value={mainAccount(t)} /> },
        { key: "reference", label: "Reference", className: "w-36", hidden: true, value: (t) => t.reference, render: (t) => <MutedCell value={t.reference} /> },
        { key: "start", label: "Started", className: "w-32", hidden: true, value: (t) => t.startDate, render: (t) => <DateCell value={t.startDate} /> },
        { key: "end", label: "Stops on", className: "w-32", hidden: true, value: (t) => t.endDate, render: (t) => <DateCell value={t.endDate} /> },
        { key: "lines", label: "Lines", align: "right", className: "w-20", hidden: true, value: (t) => t.lines?.length ?? 0 },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (t) => t.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (t) => t.createdAt, render: (t) => <DateCell value={t.createdAt} /> },
      ],
      metrics: (rows) => {
        const on = rows.filter(isOn);
        const upcoming = on.filter((t) => t.nextRunDate).sort((a, b) => (a.nextRunDate ?? "").localeCompare(b.nextRunDate ?? ""));
        const first = upcoming[0];
        const soon = upcoming.filter((t) => (daysUntil(t.nextRunDate) ?? 99) <= 7);
        const late = soon.filter((t) => (daysUntil(t.nextRunDate) ?? 0) < 0);
        const paused = rows.filter((t) => t.status === "paused");
        const monthly = on.reduce((s, t) => s + perMonth(t), 0);
        const posted = rows.reduce((s, t) => s + t.occurrencesGenerated, 0);
        return [
          { key: "on", label: "Posting automatically", color: "#0EA5E9", status: "active", value: on.length.toLocaleString(), note: `${formatMoney(monthly)} a month`, hint: "Recurring journals that are on and post by themselves." },
          {
            key: "next",
            label: "Next entry",
            color: "#6366F1",
            value: first ? formatDay(first.nextRunDate) : "—",
            note: first ? `${first.name} · ${money(first, perEntry(first))}` : "Nothing scheduled",
            hint: "The soonest entry any recurring journal will post.",
          },
          { key: "monthly", label: "Monthly amount", color: "#14B8A6", value: formatMoney(monthly), note: "Added to your books each month", hint: "Each entry's size times how often it runs, as a monthly figure, for journals that are on." },
          {
            key: "soon",
            label: "Due this week",
            color: "#EC4899",
            value: soon.length.toLocaleString(),
            note: late.length ? `${late.length} waiting to post` : formatMoney(soon.reduce((s, t) => s + perEntry(t), 0)),
            hint: "Entries due in the next 7 days, including any whose date has passed. Use \"Post what's due\" to post them now.",
          },
          { key: "paused", label: "Paused", color: "#F59E0B", status: "paused", value: paused.length.toLocaleString(), note: paused.length ? "Not posting until resumed" : "None paused", hint: "Paused journals skip their dates. Resuming doesn't fill in the gap." },
          { key: "posted", label: "Entries posted", color: "#10B981", value: posted.toLocaleString(), note: "Since they started", hint: "Every entry these recurring journals have posted so far." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const on = selected.filter(isOn);
        const paused = selected.filter((t) => t.status === "paused");
        return (
          <>
            <ActionButton icon={<Pause className="size-3.5" />} run={() => toggle(on, "paused", helpers)} className={on.length ? undefined : "pointer-events-none opacity-40"}>
              Pause{on.length ? ` (${on.length})` : ""}
            </ActionButton>
            <ActionButton icon={<Play className="size-3.5" />} run={() => toggle(paused, "active", helpers)} className={paused.length ? undefined : "pointer-events-none opacity-40"}>
              Resume{paused.length ? ` (${paused.length})` : ""}
            </ActionButton>
          </>
        );
      },
      preview: (t, helpers) => {
        const lines = sortedLines(t);
        const debit = lines.reduce((s, l) => s + l.debitAmount, 0);
        const credit = lines.reduce((s, l) => s + l.creditAmount, 0);
        return (
          <DocumentPreview
            number={t.reference || "Recurring journal"}
            status={t.status}
            statusOptions={STATUSES}
            amount={perEntry(t)}
            amountLabel={`${(FREQUENCIES[t.frequency] ?? t.frequency).toLowerCase()}`}
            currency={t.currencyCode}
            facts={[
              { label: "Name", value: t.name },
              { label: "How often", value: FREQUENCIES[t.frequency] ?? t.frequency },
              { label: "Next entry", value: t.status === "completed" ? "—" : <DueCell value={t.nextRunDate} open={isOn(t)} /> },
              { label: "Last entry", value: formatDay(t.lastRunDate) },
              { label: "Posted so far", value: `${t.occurrencesGenerated} of ${t.maxOccurrences ?? "no limit"}` },
              { label: "Stops", value: t.endDate ? formatDay(t.endDate) : t.maxOccurrences ? `After ${t.maxOccurrences} entries` : "When you stop it" },
            ]}
            actions={
              <>
                {t.status !== "completed" && (
                  <ActionButton
                    primary={t.status === "paused"}
                    icon={isOn(t) ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    run={() => toggle([t], isOn(t) ? "paused" : "active", helpers)}
                  >
                    {isOn(t) ? "Pause" : "Resume"}
                  </ActionButton>
                )}
                <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/accounting/recurring-journals/${t.id}`)}>
                  Open
                </ActionButton>
              </>
            }
          >
            <div className="mt-6">
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Each entry posts</p>
              {lines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No lines</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/80">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                        <th className="px-3 text-left font-medium">Account</th>
                        <th className="w-28 px-2 text-right font-medium">Debit</th>
                        <th className="w-28 px-3 text-right font-medium">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-t border-border/60 align-top">
                          <td className="px-3 py-2">
                            <span className="block truncate font-medium">{accountName(l.accountId) ?? "Account"}</span>
                            {l.description && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{l.description}</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{l.debitAmount ? money(t, l.debitAmount) : ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{l.creditAmount ? money(t, l.creditAmount) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border/80 bg-foreground/[0.015] font-semibold">
                        <td className="px-3 py-2.5">Total</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{money(t, debit)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(t, credit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
            {t.notes && (
              <div className="mt-5">
                <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{t.notes}</p>
              </div>
            )}
          </DocumentPreview>
        );
      },
      empty: <RecurringEmpty onCreate={() => openDrawer("recurringJournal")} />,
    };
  }, [accounts, openDrawer, router]);

  return <Explorer config={config} />;
}

function RecurringEmpty({ onCreate }: { onCreate: () => void }) {
  // A sample month grid
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDay = monthStart.getDay(); // 0=Sun
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
  // Highlight the 1st and last day as "posting" dates
  const postingDays = new Set([1, daysInMonth]);

  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recurring Journals</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Set up manual journal entries that post themselves automatically on a schedule — no need to re-enter them each time.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New recurring journal
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: Calendar */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <p className="text-sm font-medium">{monthName}</p>
              <RefreshCw className="size-3.5 text-indigo-500" />
            </div>
            <div className="p-3">
              <div className="grid grid-cols-7 mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: startDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isPosting = postingDays.has(day);
                  const isToday = day === today.getDate();
                  return (
                    <div key={day} className="flex items-center justify-center h-8">
                      <div
                        className={`flex size-7 items-center justify-center rounded-full text-xs
                        ${isPosting ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold ring-2 ring-indigo-300/50 dark:ring-indigo-700/50" : ""}
                        ${isToday && !isPosting ? "bg-muted font-medium" : ""}
                        ${!isPosting && !isToday ? "text-muted-foreground" : ""}
                      `}
                      >
                        {day}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                <div className="size-2.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                <span className="text-[10px] text-muted-foreground">Entry posts automatically on these dates</span>
              </div>
            </div>
          </div>

          {/* Right: Mock template + frequency options */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example schedule</p>
              </div>
              <div className="p-3 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Monthly rent allocation</p>
                    <p className="text-xs text-muted-foreground">REF-RENT</p>
                  </div>
                  <span className="rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">on</span>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">How often</p>
                    <p className="font-medium mt-0.5">Monthly</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next entry</p>
                    <p className="font-medium mt-0.5">Jul 1, 2026</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Posted so far</p>
                    <p className="font-medium font-mono mt-0.5">5 / &infin;</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium mt-0.5">Posting automatically</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card px-3 sm:px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Supported schedules</p>
              <div className="flex flex-wrap gap-2">
                {["Weekly", "Fortnightly", "Monthly", "Quarterly", "Semi-annual", "Annual"].map((freq) => (
                  <span key={freq} className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{freq}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
