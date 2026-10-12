"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, CalendarClock, TrendingUp, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface RevenueEntry {
  id: string;
  periodDate: string;
  amount: number;
  recognized: boolean;
  sortOrder: number;
}

interface RevenueSchedule {
  id: string;
  invoiceId: string;
  invoiceLineId: string | null;
  totalAmount: number;
  recognizedAmount: number;
  startDate: string;
  endDate: string;
  method: string;
  status: string;
  createdAt: string;
  entries?: RevenueEntry[];
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "In progress", color: "#0EA5E9", hint: "Still counting income over time" },
  { value: "completed", label: "Finished", color: "#10B981", hint: "All the income has been counted" },
  { value: "cancelled", label: "Cancelled", color: "#D4D4D8", hint: "Stopped, so no more income will be counted" },
];

// Plain-language method labels (end users aren't accountants).
const METHODS: Record<string, string> = {
  straight_line: "Evenly over time",
  milestone: "By milestone",
  on_completion: "When finished",
};

const methodOf = (s: RevenueSchedule) => METHODS[s.method] ?? s.method;
const leftOf = (s: RevenueSchedule) => (s.status === "cancelled" ? 0 : Math.max(0, s.totalAmount - s.recognizedAmount));
const pctOf = (s: RevenueSchedule) => (s.totalAmount > 0 ? Math.round((s.recognizedAmount / s.totalAmount) * 100) : 0);

function sortedEntries(s: RevenueSchedule) {
  return [...(s.entries ?? [])].sort((a, b) => a.periodDate.localeCompare(b.periodDate) || a.sortOrder - b.sortOrder);
}

const nextEntry = (s: RevenueSchedule) => (s.status === "active" ? sortedEntries(s).find((e) => !e.recognized) : undefined);

/** Periods whose date has passed but haven't been counted as income yet. */
function behind(s: RevenueSchedule) {
  if (s.status !== "active") return [];
  return (s.entries ?? []).filter((e) => !e.recognized && (daysUntil(e.periodDate) ?? 1) <= 0);
}

function periodLabel(s: RevenueSchedule) {
  return `${formatDay(s.startDate)} – ${formatDay(s.endDate)}`;
}

function Progress({ pct }: { pct: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.07]">
        <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums text-[12px] text-muted-foreground">{pct}%</span>
    </span>
  );
}

export default function RevenueSchedulesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Revenue Schedules");

  const config = useMemo<ExplorerConfig<RevenueSchedule>>(
    () => ({
      id: "revenue-schedules",
      endpoint: "/api/v1/revenue-schedules",
      noun: { one: "Revenue schedule", many: "Revenue schedules" },
      getId: (s) => s.id,
      href: (s) => `/sales/revenue-schedules/${s.id}`,
      status: { get: (s) => s.status, options: STATUSES },
      date: { get: (s) => s.startDate, label: "Start date" },
      amount: (s) => s.totalAmount,
      amountLabel: "Scheduled",
      search: (s) => [methodOf(s), s.startDate, s.endDate, periodLabel(s), STATUSES.find((o) => o.value === s.status)?.label],
      defaultSort: { key: "start", dir: "desc" },
      facets: [{ key: "method", label: "How it's spread", value: methodOf }],
      columns: [
        {
          key: "period",
          label: "Period",
          value: (s) => s.startDate,
          render: (s) => {
            const n = s.entries?.length ?? 0;
            return (
              <span className="min-w-0">
                <span className="block truncate font-medium tabular-nums">{periodLabel(s)}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{n} period{n === 1 ? "" : "s"}</span>
              </span>
            );
          },
          csv: periodLabel,
        },
        { key: "method", label: "How it's spread", className: "w-36", value: methodOf, render: (s) => <MutedCell value={methodOf(s)} /> },
        { key: "status", label: "Status", className: "w-32", value: (s) => s.status, render: (s) => <StatusPill value={s.status} options={STATUSES} /> },
        {
          key: "next",
          label: "Next to count",
          className: "w-44",
          hint: "The next period that will be counted as income",
          value: (s) => nextEntry(s)?.periodDate,
          render: (s) => {
            const e = nextEntry(s);
            return e ? <DueCell value={e.periodDate} open lateWord="behind" /> : <span className="text-muted-foreground/50">—</span>;
          },
        },
        {
          key: "progress",
          label: "Progress",
          className: "w-32",
          hint: "How much of the total has been counted as income so far",
          value: pctOf,
          render: (s) => <Progress pct={pctOf(s)} />,
          csv: (s) => `${pctOf(s)}%`,
        },
        {
          key: "periods",
          label: "Periods done",
          align: "right",
          className: "w-28",
          hidden: true,
          value: (s) => (s.entries ?? []).filter((e) => e.recognized).length,
          render: (s) => (
            <span className="tabular-nums text-foreground/80">
              {(s.entries ?? []).filter((e) => e.recognized).length} / {s.entries?.length ?? 0}
            </span>
          ),
        },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (s) => s.totalAmount, render: (s) => <MoneyCell cents={s.totalAmount} className="font-medium" /> },
        {
          key: "counted",
          label: "Counted so far",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Income already moved into your revenue",
          value: (s) => s.recognizedAmount,
          render: (s) => <MoneyCell cents={s.recognizedAmount} className={s.recognizedAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined} />,
        },
        {
          key: "left",
          label: "Left to count",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Money you've been paid but haven't earned yet",
          value: leftOf,
          render: (s) => <MoneyCell cents={leftOf(s)} className={leftOf(s) > 0 ? "text-amber-600 dark:text-amber-400" : undefined} />,
        },
        { key: "start", label: "Starts", className: "w-32", hidden: true, value: (s) => s.startDate, render: (s) => <DateCell value={s.startDate} /> },
        { key: "end", label: "Ends", className: "w-32", hidden: true, value: (s) => s.endDate, render: (s) => <DateCell value={s.endDate} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (s) => s.createdAt, render: (s) => <DateCell value={s.createdAt} /> },
      ],
      metrics: (rows) => {
        const live = rows.filter((s) => s.status !== "cancelled");
        const active = rows.filter((s) => s.status === "active");
        const scheduled = live.reduce((t, s) => t + s.totalAmount, 0);
        const counted = live.reduce((t, s) => t + s.recognizedAmount, 0);
        const left = live.reduce((t, s) => t + leftOf(s), 0);
        const late = active.flatMap(behind);
        const soon = active.flatMap((s) =>
          (s.entries ?? []).filter((e) => {
            const d = daysUntil(e.periodDate);
            return !e.recognized && d != null && d > 0 && d <= 30;
          })
        );
        return [
          {
            key: "left",
            label: "Left to count",
            color: "#F59E0B",
            status: "active",
            value: formatMoney(left),
            note: `${active.length} schedule${active.length === 1 ? "" : "s"} in progress`,
            hint: "Money you've been paid but haven't earned yet. It moves into income as each period passes.",
          },
          {
            key: "counted",
            label: "Counted so far",
            color: "#10B981",
            value: formatMoney(counted),
            note: scheduled ? `${Math.round((counted / scheduled) * 100)}% of everything scheduled` : "Nothing scheduled yet",
            hint: "Income already moved into your revenue from these schedules.",
          },
          {
            key: "behind",
            label: "Ready to count",
            color: "#EF4444",
            status: "active",
            value: formatMoney(late.reduce((t, e) => t + e.amount, 0)),
            note: late.length ? `${late.length} period${late.length === 1 ? "" : "s"} already passed` : "All caught up",
            hint: "Periods whose date has passed but haven't been counted as income yet. Count them so your profit is right.",
          },
          {
            key: "soon",
            label: "Next 30 days",
            color: "#0EA5E9",
            value: formatMoney(soon.reduce((t, e) => t + e.amount, 0)),
            note: `${soon.length} period${soon.length === 1 ? "" : "s"} coming up`,
            hint: "Income that will be counted over the next month.",
          },
          {
            key: "scheduled",
            label: "Total scheduled",
            color: "#8B5CF6",
            value: formatMoney(scheduled),
            note: `${live.length} schedule${live.length === 1 ? "" : "s"}, not counting cancelled`,
            hint: "Everything set up to be counted over time.",
          },
        ];
      },
      preview: (s, helpers) => {
        const next = nextEntry(s);
        const entries = sortedEntries(s);
        return (
          <DocumentPreview
            number={periodLabel(s)}
          plainTitle
            status={s.status}
            statusOptions={STATUSES}
            amount={leftOf(s) > 0 ? leftOf(s) : s.totalAmount}
            amountLabel={leftOf(s) > 0 ? "left to count" : "total"}
            facts={[
              { label: "Starts", value: formatDay(s.startDate) },
              { label: "Ends", value: formatDay(s.endDate) },
              { label: "How it's spread", value: methodOf(s) },
              { label: "Next to count", value: next ? <DueCell value={next.periodDate} open lateWord="behind" /> : "—" },
              { label: "Total", value: formatMoney(s.totalAmount) },
              { label: "Counted so far", value: `${formatMoney(s.recognizedAmount)} · ${pctOf(s)}%` },
            ]}
            actions={
              <>
                {next && (
                  <ActionButton
                    primary
                    icon={<Check className="size-3.5" />}
                    success="Counted the next period as income"
                    run={async () => {
                      await postJson(`/api/v1/revenue-schedules/${s.id}/recognize`);
                      helpers.refresh();
                    }}
                  >
                    Count next period
                  </ActionButton>
                )}
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/sales/${s.invoiceId}`)}>
                  View invoice
                </ActionButton>
              </>
            }
          >
            <div className="mt-6">
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Periods</p>
              {entries.length > 0 ? (
                <div className="divide-y divide-border/60 rounded-xl border border-border/80">
                  {entries.map((e) => {
                    const passed = (daysUntil(e.periodDate) ?? 1) <= 0;
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full",
                            e.recognized ? "bg-emerald-500/12 text-emerald-600" : passed && s.status === "active" ? "bg-red-500/10 text-red-600" : "bg-foreground/[0.05] text-muted-foreground"
                          )}
                        >
                          {e.recognized ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
                        </span>
                        <span className="flex-1 tabular-nums">{formatDay(e.periodDate)}</span>
                        <span className="text-[12px] text-muted-foreground">
                          {e.recognized ? "Counted" : passed && s.status === "active" ? "Ready to count" : "Not yet"}
                        </span>
                        <span className={cn("w-24 text-right tabular-nums", e.recognized ? "text-foreground/80" : "text-muted-foreground")}>{formatMoney(e.amount)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No periods</p>
              )}
            </div>
          </DocumentPreview>
        );
      },
      empty: <SchedulesEmpty onCreate={() => openDrawer("revenueSchedule")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

function SchedulesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Revenue Schedules</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Count income from an invoice gradually over time instead of all at once — useful for upfront payments you earn month by month.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New schedule
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a schedule works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <CalendarClock className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Paid upfront</p>
                    <p className="text-[11px] text-muted-foreground">INV-0042 · 12 months</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$1,200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <TrendingUp className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Counted each month</p>
                    <p className="text-[11px] text-muted-foreground">Spread evenly</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">+$100.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">After 12 months</p>
                </div>
                <span className="font-mono text-sm font-bold">$1,200.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Annual subscription paid upfront", desc: "Customer pays for a full year at once? Count the income one month at a time.", color: "border-l-blue-400" },
              { title: "Prepaid retainer or support plan", desc: "Got paid in advance for ongoing work? Spread the income across the term.", color: "border-l-amber-400" },
              { title: "Deposits for future delivery", desc: "Took a payment before the work is done? Recognise it as you deliver.", color: "border-l-brand-400" },
              { title: "Multi-month projects", desc: "Billed once for a long project? Recognise the income as you progress.", color: "border-l-purple-400" },
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
