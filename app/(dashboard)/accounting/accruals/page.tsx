"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarRange, CalendarClock, CalendarCheck, Ban, ArrowUpRight, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { useApi } from "@/lib/query/use-api";

interface AccrualEntry {
  id: string;
  periodDate: string;
  amount: number;
  posted: boolean;
  journalEntryId: string | null;
  sortOrder: number;
}

interface AccrualSchedule {
  id: string;
  description: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  periods: number;
  status: string;
  accountId: string;
  reverseAccountId: string;
  sourceEntryId: string | null;
  createdAt: string;
  entries: AccrualEntry[];
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Running", color: "#0EA5E9", hint: "Recording a share each month, and up to date" },
  { value: "behind", label: "Behind", color: "#F59E0B", hint: "A month has passed that hasn't been recorded yet" },
  { value: "completed", label: "Finished", color: "#10B981", hint: "Every month has been recorded" },
  { value: "cancelled", label: "Cancelled", color: "#D4D4D8", hint: "Stopped early. Months already recorded stay as they are" },
];

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function monthName(day: string | null | undefined) {
  if (!day) return "—";
  const [y, m] = day.split("-").map(Number);
  return MONTH_FMT.format(new Date(y, m - 1, 1));
}

const entriesOf = (s: AccrualSchedule) => [...(s.entries ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.periodDate.localeCompare(b.periodDate));
const nextOf = (s: AccrualSchedule) => entriesOf(s).find((e) => !e.posted) ?? null;
const recordedOf = (s: AccrualSchedule) => (s.entries ?? []).filter((e) => e.posted).reduce((sum, e) => sum + e.amount, 0);
const leftOf = (s: AccrualSchedule) => (s.status === "cancelled" ? 0 : (s.entries ?? []).filter((e) => !e.posted).reduce((sum, e) => sum + e.amount, 0));
const monthlyOf = (s: AccrualSchedule) => (s.periods > 0 ? Math.round(s.totalAmount / s.periods) : s.totalAmount);
const postedCount = (s: AccrualSchedule) => (s.entries ?? []).filter((e) => e.posted).length;

/** Running schedules with a past month still unrecorded are behind. */
function statusOf(s: AccrualSchedule) {
  if (s.status !== "active") return s.status;
  const next = nextOf(s);
  return next && (daysUntil(next.periodDate) ?? 0) < 0 ? "behind" : "active";
}

const isRunning = (s: AccrualSchedule) => s.status === "active";

function lengthBucket(periods: number) {
  if (periods <= 3) return "Up to 3 months";
  if (periods <= 6) return "4 to 6 months";
  if (periods <= 12) return "7 to 12 months";
  return "Over a year";
}

/** Chart account names, so schedules can be filtered by the account they touch. */
function useAccountNames() {
  const { data } = useApi<{ accounts?: { id: string; code: string; name: string }[] }>("/api/v1/accounts");
  return useMemo<Record<string, string>>(() => {
    const list = data?.accounts ?? [];
    return Object.fromEntries(list.map((a) => [a.id, a.code ? `${a.code} · ${a.name}` : a.name]));
  }, [data]);
}

async function recordNext(list: AccrualSchedule[], helpers: ExplorerHelpers) {
  let ok = 0;
  const failed: string[] = [];
  for (const s of list) {
    try {
      await postJson(`/api/v1/accrual-schedules/${s.id}/post`);
      ok++;
    } catch (err) {
      failed.push(`${s.description}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  if (ok) toast.success(ok === 1 && list.length === 1 ? "This month's share has been recorded" : `Recorded the next month for ${ok} accrual${ok === 1 ? "" : "s"}`);
  if (failed.length) toast.error(`${failed.length} couldn't be recorded`, { description: failed.slice(0, 3).join(" · ") });
  helpers.clearSelection();
  if (ok) helpers.refresh();
}

export default function AccrualsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const accounts = useAccountNames();

  useDocumentTitle("Accounting · Accruals");

  const config = useMemo<ExplorerConfig<AccrualSchedule>>(() => {
    const accountName = (id: string | null | undefined) => (id ? accounts[id] : undefined) ?? null;
    return {
      id: "accruals",
      endpoint: "/api/v1/accrual-schedules",
      noun: { one: "Accrual", many: "Accruals" },
      getId: (s) => s.id,
      href: (s) => `/accounting/accruals/${s.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (s) => s.startDate, label: "Start date" },
      amount: (s) => s.totalAmount,
      amountLabel: "Spread",
      search: (s) => [s.description, accountName(s.accountId), accountName(s.reverseAccountId)],
      defaultSort: { key: "start", dir: "desc" },
      facets: [
        { key: "account", label: "Account", value: (s) => accountName(s.accountId) },
        { key: "reverseAccount", label: "Balanced against", value: (s) => accountName(s.reverseAccountId) },
        { key: "length", label: "Length", value: (s) => lengthBucket(s.periods) },
      ],
      columns: [
        { key: "description", label: "What it's for", value: (s) => s.description, render: (s) => <span className="block truncate font-medium">{s.description}</span> },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (s) => s.totalAmount },
        { key: "monthly", label: "Each month", align: "right", className: "w-28", money: true, hint: "The share recorded each month", value: monthlyOf },
        {
          key: "progress",
          label: "Recorded",
          className: "w-40",
          hint: "Months recorded out of the total",
          value: (s) => postedCount(s) / Math.max(1, s.periods),
          render: (s) => {
            const done = postedCount(s);
            const pct = Math.min(100, Math.round((done / Math.max(1, s.periods)) * 100));
            return (
              <span className="flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-12 text-right text-[12px] tabular-nums text-muted-foreground">{done}/{s.periods}</span>
              </span>
            );
          },
          csv: (s) => `${postedCount(s)}/${s.periods}`,
        },
        { key: "left", label: "Still to record", align: "right", className: "w-32", money: true, value: leftOf, render: (s) => <MoneyCell cents={leftOf(s)} className={isRunning(s) && leftOf(s) > 0 ? "font-medium" : undefined} /> },
        {
          key: "next",
          label: "Next month",
          className: "w-44",
          hint: "The next month waiting to be recorded",
          value: (s) => (isRunning(s) ? nextOf(s)?.periodDate : null),
          render: (s) => (isRunning(s) && nextOf(s) ? <DueCell value={nextOf(s)!.periodDate} open /> : <span className="text-muted-foreground/50">—</span>),
        },
        { key: "start", label: "Starts", className: "w-32", value: (s) => s.startDate, render: (s) => <DateCell value={s.startDate} /> },
        { key: "status", label: "Status", className: "w-32", value: statusOf, render: (s) => <StatusPill value={statusOf(s)} options={STATUSES} /> },
        { key: "end", label: "Ends", className: "w-32", hidden: true, value: (s) => s.endDate, render: (s) => <DateCell value={s.endDate} /> },
        { key: "periods", label: "Months", align: "right", className: "w-24", hidden: true, value: (s) => s.periods },
        { key: "recorded", label: "Recorded so far", align: "right", className: "w-32", money: true, hidden: true, value: recordedOf },
        { key: "account", label: "Account", className: "w-48", hidden: true, value: (s) => accountName(s.accountId), render: (s) => <MutedCell value={accountName(s.accountId)} /> },
        { key: "reverseAccount", label: "Balanced against", className: "w-48", hidden: true, value: (s) => accountName(s.reverseAccountId), render: (s) => <MutedCell value={accountName(s.reverseAccountId)} /> },
        { key: "created", label: "Added", className: "w-32", hidden: true, value: (s) => s.createdAt, render: (s) => <DateCell value={s.createdAt} /> },
      ],
      metrics: (rows) => {
        const running = rows.filter(isRunning);
        const behind = rows.filter((s) => statusOf(s) === "behind");
        const monthKey = toDayKey(new Date()).slice(0, 7);
        const thisMonth = running.flatMap((s) => (s.entries ?? []).filter((e) => e.periodDate.startsWith(monthKey)));
        const thisMonthDone = thisMonth.filter((e) => e.posted);
        const left = running.reduce((s, a) => s + leftOf(a), 0);
        const recorded = rows.reduce((s, a) => s + recordedOf(a), 0);
        const scheduled = rows.reduce((s, a) => s + (a.status === "cancelled" ? recordedOf(a) : a.totalAmount), 0);
        const pastDue = behind.reduce((n, s) => n + (s.entries ?? []).filter((e) => !e.posted && (daysUntil(e.periodDate) ?? 0) < 0).length, 0);
        const finished = rows.filter((s) => s.status === "completed");
        return [
          { key: "running", label: "Running", color: "#0EA5E9", value: running.length.toLocaleString(), note: `${formatMoney(running.reduce((s, a) => s + monthlyOf(a), 0))} a month`, hint: "Accruals still spreading a cost or income across the months ahead." },
          {
            key: "month",
            label: "This month's share",
            color: "#6366F1",
            value: formatMoney(thisMonth.reduce((s, e) => s + e.amount, 0)),
            note: thisMonth.length ? `${thisMonthDone.length} of ${thisMonth.length} recorded` : "Nothing due this month",
            hint: "What running accruals should add to this month's numbers.",
          },
          { key: "left", label: "Still to spread", color: "#F59E0B", value: formatMoney(left), note: "Over the months ahead", hint: "The part of running accruals that hasn't been recorded yet." },
          { key: "behind", label: "Behind", color: "#EF4444", status: "behind", value: behind.length.toLocaleString(), note: pastDue ? `${pastDue} past month${pastDue === 1 ? "" : "s"} not recorded` : "All up to date", hint: "Accruals with a month that has already passed but hasn't been recorded. Record them so each month's profit is right." },
          { key: "recorded", label: "Spread so far", color: "#10B981", value: formatMoney(recorded), note: scheduled ? `${Math.round((recorded / scheduled) * 100)}% of the total` : "Nothing scheduled", hint: "Everything already recorded across all accruals." },
          { key: "finished", label: "Finished", color: "#14B8A6", status: "completed", value: finished.length.toLocaleString(), note: formatMoney(finished.reduce((s, a) => s + a.totalAmount, 0)), hint: "Accruals where every month has been recorded." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const ready = selected.filter((s) => isRunning(s) && nextOf(s));
        return (
          <ActionButton icon={<CalendarCheck className="size-3.5" />} run={() => recordNext(ready, helpers)} className={ready.length ? undefined : "pointer-events-none opacity-40"}>
            Record next month{ready.length ? ` (${ready.length})` : ""}
          </ActionButton>
        );
      },
      preview: (s, helpers) => {
        const next = nextOf(s);
        const entries = entriesOf(s);
        return (
          <DocumentPreview
            number={s.description}
            status={statusOf(s)}
            statusOptions={STATUSES}
            amount={s.totalAmount}
            amountLabel={`over ${s.periods} month${s.periods === 1 ? "" : "s"}`}
            facts={[
              { label: "Each month", value: formatMoney(monthlyOf(s)) },
              { label: "Recorded", value: `${postedCount(s)} of ${s.periods} · ${formatMoney(recordedOf(s))}` },
              { label: "Starts", value: formatDay(s.startDate) },
              { label: "Ends", value: formatDay(s.endDate) },
              { label: "Account", value: accountName(s.accountId) ?? "—" },
              { label: "Balanced against", value: accountName(s.reverseAccountId) ?? "—" },
            ]}
            actions={
              <>
                {isRunning(s) && next && (
                  <ActionButton primary icon={<Check className="size-3.5" />} run={() => recordNext([s], helpers)}>
                    Record {monthName(next.periodDate)}
                  </ActionButton>
                )}
                {isRunning(s) && (
                  <ActionButton
                    icon={<Ban className="size-3.5" />}
                    className="text-red-600 dark:text-red-400"
                    run={() =>
                      confirm({
                        title: "Cancel this accrual?",
                        description: "This stops any remaining months from being recorded. Months already recorded stay as they are. You can't undo this.",
                        confirmLabel: "Cancel accrual",
                        destructive: true,
                        onConfirm: async () => {
                          const orgId = localStorage.getItem("activeOrgId");
                          const res = await fetch(`/api/v1/accrual-schedules/${s.id}`, { method: "DELETE", headers: orgId ? { "x-organization-id": orgId } : {} });
                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            toast.error(typeof data.error === "string" ? data.error : "Couldn't cancel this accrual");
                            throw new Error("cancel failed");
                          }
                          toast.success("Accrual cancelled");
                          helpers.refresh();
                        },
                      })
                    }
                  >
                    Cancel accrual
                  </ActionButton>
                )}
                <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/accounting/accruals/${s.id}`)}>
                  Open
                </ActionButton>
              </>
            }
          >
            <div className="mt-6">
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Month by month</p>
              {entries.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No months scheduled</p>
              ) : (
                <div className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/80">
                  {entries.map((e) => {
                    const late = !e.posted && isRunning(s) && (daysUntil(e.periodDate) ?? 0) < 0;
                    return (
                      <div key={e.id} className={cn("flex items-center gap-3 px-3 py-2 text-[13px]", e.id === next?.id && isRunning(s) && "bg-foreground/[0.03]")}>
                        <span className="min-w-0 flex-1 truncate">{monthName(e.periodDate)}</span>
                        {e.posted ? (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[11px] font-medium text-emerald-700 dark:text-emerald-400">Recorded</span>
                        ) : late ? (
                          <span className="rounded bg-amber-500/12 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-400">Not recorded</span>
                        ) : (
                          <span className="text-[11.5px] text-muted-foreground">{s.status === "cancelled" ? "Skipped" : "Upcoming"}</span>
                        )}
                        <span className={cn("w-24 text-right tabular-nums", !e.posted && "text-muted-foreground")}>{formatMoney(e.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DocumentPreview>
        );
      },
      empty: <AccrualsEmpty onCreate={() => openDrawer("accrualSchedule")} />,
    };
  }, [accounts, confirm, openDrawer, router]);

  return (
    <>
      <Explorer config={config} />
      {confirmDialog}
    </>
  );
}

function AccrualsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Accruals</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Spread a one-off cost or income evenly over several months, instead of putting it all in one month.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New accrual
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How an accrual works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <CalendarRange className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">One-off cost</p>
                    <p className="text-[11px] text-muted-foreground">Annual insurance</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$1,200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <CalendarClock className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Spread over 12 months</p>
                    <p className="text-[11px] text-muted-foreground">A little each month</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">$100.00/mo</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Each month shows its fair share</p>
                </div>
                <span className="font-mono text-sm font-bold">$100.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Paid a year upfront", desc: "Insurance, rent, or a subscription billed annually? Spread the cost across the months it covers.", color: "border-l-blue-400" },
              { title: "Big bill, many months", desc: "A one-off expense that really benefits a whole year shouldn't land in a single month.", color: "border-l-amber-400" },
              { title: "Income earned over time", desc: "Got paid upfront for work delivered over several months? Recognise it bit by bit.", color: "border-l-brand-400" },
              { title: "Smoother monthly numbers", desc: "Even out lumpy costs so each month's profit reflects what actually happened.", color: "border-l-purple-400" },
            ].map(({ title, desc, color }) => (
              <div key={title} className={`rounded-lg border border-l-[3px] ${color} bg-card px-4 py-3`}>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
