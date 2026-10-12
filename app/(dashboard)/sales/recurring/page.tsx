"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Calendar, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MutedCell, PartyCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface RecurringTemplate {
  id: string;
  name: string;
  type: string;
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
  autoSend: boolean;
  createAsApproved: boolean;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

interface TemplateLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Upcoming {
  id: string;
  templateName: string;
  contactName: string;
  lineTotal: number;
  currency: string;
  dates: { date: string; occurrence: number }[];
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Active", color: "#10B981", hint: "Invoices are created on schedule" },
  { value: "paused", label: "Paused", color: "#F59E0B", hint: "On hold. No invoices are created until you resume it" },
  { value: "completed", label: "Finished", color: "#8B5CF6", hint: "Reached its end date or its last invoice" },
];

const FREQUENCIES: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Twice a year",
  annual: "Yearly",
};

const frequencyOf = (t: RecurringTemplate) => FREQUENCIES[t.frequency] ?? t.frequency;
const deliveryOf = (t: RecurringTemplate) => (t.autoSend ? "Emailed automatically" : t.createAsApproved ? "Created as sent" : "Saved as draft");
const runsLeft = (t: RecurringTemplate) => (t.maxOccurrences == null ? null : Math.max(0, t.maxOccurrences - t.occurrencesGenerated));
const lineAmount = (l: TemplateLine) => Math.round((l.quantity / 100) * l.unitPrice);

/** Active templates that will stop soon: two or fewer invoices left, or ending within 30 days. */
function endingSoon(t: RecurringTemplate) {
  if (t.status !== "active") return false;
  const left = runsLeft(t);
  if (left != null && left <= 2) return true;
  const d = daysUntil(t.endDate);
  return d != null && d >= 0 && d <= 30;
}

async function toggle(templates: RecurringTemplate[], verb: "Paused" | "Resumed", helpers: ExplorerHelpers, onDone: () => void) {
  const results = await Promise.allSettled(templates.map((t) => postJson(`/api/v1/recurring/${t.id}/pause`)));
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - ok;
  if (ok) toast.success(`${verb} ${ok} template${ok === 1 ? "" : "s"}`);
  if (failed) toast.error(`${failed} couldn't be changed`);
  helpers.clearSelection();
  helpers.refresh();
  onDone();
}

export default function RecurringInvoicesPage() {
  const { open: openDrawer } = useCreateDrawer();
  const [stripVersion, setStripVersion] = useState(0);
  useDocumentTitle("Sales · Recurring Invoices");

  const config = useMemo<ExplorerConfig<RecurringTemplate>>(() => {
    const bump = () => setStripVersion((v) => v + 1);
    return {
      id: "recurring-invoices",
      endpoint: "/api/v1/recurring",
      params: { type: "invoice" },
      noun: { one: "Recurring invoice", many: "Recurring invoices" },
      getId: (t) => t.id,
      href: (t) => `/sales/recurring/${t.id}`,
      status: { get: (t) => t.status, options: STATUSES },
      date: { get: (t) => t.nextRunDate, label: "Next invoice" },
      party: { get: (t) => t.contact?.name, label: "Customer", many: "Customers" },
      currency: (t) => t.currencyCode,
      search: (t) => [t.name, t.contact?.name, t.contact?.email, t.reference, frequencyOf(t)],
      defaultSort: { key: "next", dir: "asc" },
      facets: [
        { key: "frequency", label: "Frequency", value: frequencyOf },
        { key: "delivery", label: "Delivery", value: deliveryOf },
        { key: "currency", label: "Currency", value: (t) => t.currencyCode },
      ],
      columns: [
        { key: "name", label: "Name", value: (t) => t.name, render: (t) => <span className="block truncate font-medium">{t.name}</span> },
        { key: "customer", label: "Customer", value: (t) => t.contact?.name, render: (t) => <PartyCell name={t.contact?.name} /> },
        { key: "frequency", label: "Frequency", className: "w-32", value: frequencyOf, render: (t) => <MutedCell value={frequencyOf(t)} /> },
        { key: "status", label: "Status", className: "w-28", value: (t) => t.status, render: (t) => <StatusPill value={t.status} options={STATUSES} /> },
        {
          key: "next",
          label: "Next invoice",
          className: "w-44",
          hint: "When the next invoice will be created",
          value: (t) => (t.status === "completed" ? null : t.nextRunDate),
          render: (t) => (t.status === "completed" ? <span className="text-muted-foreground/50">—</span> : <DueCell value={t.nextRunDate} open={t.status === "active"} lateWord="late" />),
        },
        { key: "last", label: "Last invoice", className: "w-32", value: (t) => t.lastRunDate, render: (t) => <DateCell value={t.lastRunDate} /> },
        {
          key: "occurrences",
          label: "Invoices made",
          align: "right",
          className: "w-32",
          hint: "Invoices created so far, out of the limit you set (∞ means no limit)",
          value: (t) => t.occurrencesGenerated,
          render: (t) => (
            <span className="tabular-nums text-foreground/80">
              {t.occurrencesGenerated} <span className="text-muted-foreground">/ {t.maxOccurrences ?? "∞"}</span>
            </span>
          ),
          csv: (t) => `${t.occurrencesGenerated} / ${t.maxOccurrences ?? "unlimited"}`,
        },
        {
          key: "delivery",
          label: "Delivery",
          className: "w-40",
          hidden: true,
          hint: "What happens to each new invoice: emailed to the customer, marked as sent without emailing, or saved as a draft for you to check",
          value: deliveryOf,
          render: (t) => <MutedCell value={deliveryOf(t)} />,
        },
        {
          key: "left",
          label: "Invoices left",
          align: "right",
          className: "w-28",
          hidden: true,
          value: (t) => runsLeft(t),
          render: (t) => <span className="tabular-nums text-foreground/80">{runsLeft(t) ?? "∞"}</span>,
        },
        { key: "start", label: "Starts", className: "w-32", hidden: true, value: (t) => t.startDate, render: (t) => <DateCell value={t.startDate} /> },
        { key: "end", label: "Ends", className: "w-32", hidden: true, value: (t) => t.endDate, render: (t) => (t.endDate ? <DateCell value={t.endDate} /> : <MutedCell value="Never" />) },
        { key: "reference", label: "Reference", hidden: true, value: (t) => t.reference, render: (t) => <MutedCell value={t.reference} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (t) => t.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (t) => t.createdAt, render: (t) => <DateCell value={t.createdAt} /> },
      ],
      metrics: (rows) => {
        const active = rows.filter((t) => t.status === "active");
        const paused = rows.filter((t) => t.status === "paused");
        const week = active
          .filter((t) => {
            const d = daysUntil(t.nextRunDate);
            return d != null && d <= 7;
          })
          .sort((a, b) => (a.nextRunDate ?? "").localeCompare(b.nextRunDate ?? ""));
        const made = rows.reduce((s, t) => s + t.occurrencesGenerated, 0);
        const ending = rows.filter(endingSoon);
        return [
          { key: "active", label: "Active", color: "#10B981", status: "active", value: active.length.toString(), note: `${rows.length} template${rows.length === 1 ? "" : "s"} in all`, hint: "Templates creating invoices on schedule right now." },
          {
            key: "week",
            label: "Going out this week",
            color: "#0EA5E9",
            value: week.length.toString(),
            note: week[0] ? `Next: ${week[0].name} · ${formatDay(week[0].nextRunDate)}` : "Nothing in the next 7 days",
            hint: "Invoices that will be created in the next 7 days.",
          },
          { key: "paused", label: "Paused", color: "#F59E0B", status: "paused", value: paused.length.toString(), note: paused.length ? "Not billing until resumed" : "Nothing on hold", hint: "Templates on hold. Customers on these aren't being billed." },
          { key: "made", label: "Invoices created", color: "#8B5CF6", value: made.toLocaleString(), note: "From all templates so far", hint: "How many invoices these templates have created in total." },
          {
            key: "ending",
            label: "Ending soon",
            color: "#EF4444",
            value: ending.length.toString(),
            note: ending.length ? "Renew or extend them" : "None ending soon",
            hint: "Active templates with two or fewer invoices left, or that end in the next 30 days.",
          },
        ];
      },
      bulkActions: (selected, helpers) => {
        const pausable = selected.filter((t) => t.status === "active");
        const resumable = selected.filter((t) => t.status === "paused");
        return (
          <>
            <ActionButton icon={<Pause className="size-3.5" />} run={() => toggle(pausable, "Paused", helpers, bump)} className={pausable.length ? undefined : "pointer-events-none opacity-40"}>
              Pause{pausable.length ? ` (${pausable.length})` : ""}
            </ActionButton>
            <ActionButton icon={<Play className="size-3.5" />} run={() => toggle(resumable, "Resumed", helpers, bump)} className={resumable.length ? undefined : "pointer-events-none opacity-40"}>
              Resume{resumable.length ? ` (${resumable.length})` : ""}
            </ActionButton>
          </>
        );
      },
      preview: (t, helpers) => (
        <DocumentPreview
          url={`/api/v1/recurring/${t.id}`}
          pick={(json) => {
            const doc = json.template as (RecurringTemplate & { lines?: TemplateLine[] }) | undefined;
            const lines = (doc?.lines ?? []).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: lineAmount(l) }));
            return {
              lines,
              notes: doc?.notes,
              totals: [{ label: "Each invoice, before tax", cents: lines.reduce((s, l) => s + l.amount, 0), strong: true }],
            };
          }}
          number={t.name}
          plainTitle
          status={t.status}
          statusOptions={STATUSES}
          party={t.contact?.name}
          partySub={t.contact?.email}
          currency={t.currencyCode}
          facts={[
            { label: "Frequency", value: frequencyOf(t) },
            { label: "Next invoice", value: t.status === "completed" ? "—" : <DueCell value={t.nextRunDate} open={t.status === "active"} /> },
            { label: "Last invoice", value: formatDay(t.lastRunDate) },
            { label: "Invoices made", value: `${t.occurrencesGenerated} of ${t.maxOccurrences ?? "no limit"}` },
            { label: "Runs", value: `${formatDay(t.startDate)} – ${t.endDate ? formatDay(t.endDate) : "no end"}` },
            { label: "Delivery", value: deliveryOf(t) },
          ]}
          actions={
            <>
              {t.status === "active" && (
                <ActionButton icon={<Pause className="size-3.5" />} run={() => toggle([t], "Paused", helpers, bump)}>
                  Pause
                </ActionButton>
              )}
              {t.status === "paused" && (
                <ActionButton primary icon={<Play className="size-3.5" />} run={() => toggle([t], "Resumed", helpers, bump)}>
                  Resume
                </ActionButton>
              )}
            </>
          }
        >
          {t.status === "active" && <UpcomingDates id={t.id} />}
        </DocumentPreview>
      ),
      empty: <RecurringEmpty onCreate={() => openDrawer("recurring")} />,
    };
  }, [openDrawer]);

  return (
    <div className="space-y-6">
      <UpcomingStrip version={stripVersion} />
      <Explorer config={config} />
    </div>
  );
}

/** GET with the active workspace; resolves to null on any failure. */
function get(url: string) {
  const orgId = localStorage.getItem("activeOrgId");
  return fetch(url, { headers: orgId ? { "x-organization-id": orgId } : {} })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

/** The next invoices your active templates will create, soonest first. */
function UpcomingStrip({ version }: { version: number }) {
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);

  useEffect(() => {
    if (!localStorage.getItem("activeOrgId")) return;
    let cancelled = false;
    get("/api/v1/recurring?type=invoice&status=active&sortBy=nextRun&sortOrder=asc&limit=5").then((list) => {
      const active = ((list?.data ?? []) as RecurringTemplate[]).slice(0, 5);
      Promise.all(
        active.map((t) =>
          get(`/api/v1/recurring/${t.id}/preview?count=3`).then((d) =>
            d
              ? {
                  id: t.id,
                  templateName: d.template?.name || t.name,
                  contactName: d.template?.contactName || t.contact?.name || "",
                  lineTotal: d.template?.lineTotal || 0,
                  currency: t.currencyCode,
                  dates: (d.upcoming ?? []) as Upcoming["dates"],
                }
              : null
          )
        )
      ).then((results) => {
        if (!cancelled) setUpcoming(results.filter((r): r is Upcoming => r !== null && r.dates.length > 0));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] font-medium text-muted-foreground">Coming up next</p>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {upcoming.map((u) => (
          <Link
            key={u.id}
            href={`/sales/recurring/${u.id}`}
            className="min-w-[230px] shrink-0 rounded-xl border border-border/80 px-4 py-3 transition-colors hover:bg-foreground/[0.025]"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">{u.templateName}</p>
                {u.contactName && <p className="truncate text-[12px] text-muted-foreground">{u.contactName}</p>}
              </div>
              <p className="shrink-0 text-[13px] font-semibold tabular-nums">{formatMoney(u.lineTotal, u.currency)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {u.dates.map((d) => (
                <span key={d.date} className="flex items-center gap-1 text-[12px] tabular-nums text-muted-foreground">
                  <Calendar className="size-3" />
                  {formatDay(d.date)}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The next few invoice dates for one template. */
function UpcomingDates({ id }: { id: string }) {
  const [state, setState] = useState<{ id: string; dates: { date: string; occurrence: number }[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    get(`/api/v1/recurring/${id}/preview?count=6`).then((d) => {
      if (!cancelled) setState({ id, dates: d?.upcoming ?? [] });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = state?.id !== id;

  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Next invoices</p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : state.dates.length > 0 ? (
        <div className="divide-y divide-border/60 rounded-xl border border-border/80">
          {state.dates.map((d) => (
            <div key={d.date} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <Calendar className="size-3.5 text-muted-foreground" />
              <span className="flex-1 tabular-nums">{formatDay(d.date)}</span>
              <span className="text-[12px] tabular-nums text-muted-foreground">Invoice #{d.occurrence}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No more invoices scheduled</p>
      )}
    </div>
  );
}

function RecurringEmpty({ onCreate }: { onCreate: () => void }) {
  // Generate a sample month grid
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDay = monthStart.getDay(); // 0=Sun
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
  // Highlight the 1st and 15th as "recurring" dates
  const recurringDays = new Set([1, 15]);

  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recurring Invoices</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Set up templates that automatically generate invoices on a schedule.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New Recurring Template
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
                  const isRecurring = recurringDays.has(day);
                  const isToday = day === today.getDate();
                  return (
                    <div key={day} className="flex items-center justify-center h-8">
                      <div className={`flex size-7 items-center justify-center rounded-full text-xs
                        ${isRecurring ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold ring-2 ring-indigo-300/50 dark:ring-indigo-700/50" : ""}
                        ${isToday && !isRecurring ? "bg-muted font-medium" : ""}
                        ${!isRecurring && !isToday ? "text-muted-foreground" : ""}
                      `}>
                        {day}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                <div className="size-2.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                <span className="text-[10px] text-muted-foreground">Invoice auto-generates on these dates</span>
              </div>
            </div>
          </div>

          {/* Right: Mock template + frequency options */}
          <div className="space-y-4">
            {/* Mock template card */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example template</p>
              </div>
              <div className="p-3 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Monthly hosting</p>
                    <p className="text-xs text-muted-foreground">Acme Corp</p>
                  </div>
                  <span className="rounded-full border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 text-[10px] font-medium text-brand-600 dark:text-brand-400">active</span>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Frequency</p>
                    <p className="font-medium mt-0.5">Monthly</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-medium font-mono mt-0.5">$299.00</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next invoice</p>
                    <p className="font-medium mt-0.5">Apr 1, 2026</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Generated</p>
                    <p className="font-medium font-mono mt-0.5">12 / &infin;</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Supported frequencies */}
            <div className="rounded-xl border bg-card px-3 sm:px-5 py-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Supported frequencies</p>
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
