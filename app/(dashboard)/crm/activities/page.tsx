"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpRight, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { ListEmpty } from "@/components/dashboard/explorer/list-empty";
import { MutedCell, StatusPill } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { ACTIVITY_TYPES, ActivityIcon, timeAgo } from "@/components/dashboard/crm/activity-meta";

interface DealActivity {
  id: string;
  dealId: string;
  type: string;
  content: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
  deal: {
    id: string;
    title: string;
    valueCents: number;
    currency: string;
    wonAt: string | null;
    lostAt: string | null;
    contact: { id: string; name: string } | null;
  } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "overdue", label: "Overdue", color: "#EF4444", hint: "Planned for a time that has passed, and not marked done" },
  { value: "upcoming", label: "Coming up", color: "#F59E0B", hint: "Planned for later and not done yet" },
  { value: "done", label: "Done", color: "#10B981", hint: "Marked as done" },
  { value: "logged", label: "Logged", color: "#A1A1AA", hint: "A note or a call written up after it happened" },
];

function statusOf(a: DealActivity) {
  if (a.completedAt) return "done";
  if (!a.scheduledAt) return "logged";
  return new Date(a.scheduledAt).getTime() < Date.now() ? "overdue" : "upcoming";
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const when = (v: string | null | undefined) => (v ? DATE_TIME.format(new Date(v)) : "—");

async function patch(id: string, body: Record<string, unknown>) {
  const orgId = localStorage.getItem("activeOrgId");
  const res = await fetch(`/api/v1/crm/activities/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(orgId ? { "x-organization-id": orgId } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Couldn't update the activity");
}

export default function CRMActivitiesPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  useDocumentTitle("CRM · Activities");

  const config = useMemo<ExplorerConfig<DealActivity>>(
    () => ({
      id: "crm-activities",
      endpoint: "/api/v1/crm/activities",
      noun: { one: "Activity", many: "Activities" },
      getId: (a) => a.id,
      href: (a) => `/crm/deals/${a.dealId}/activity`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (a) => a.createdAt, label: "Logged on" },
      party: { get: (a) => a.deal?.contact?.name, label: "Contact", many: "Contacts" },
      search: (a) => [a.content, a.deal?.title, a.deal?.contact?.name, a.user?.name, ACTIVITY_TYPES[a.type]?.label],
      defaultSort: { key: "logged", dir: "desc" },
      facets: [
        { key: "type", label: "Type", value: (a) => ACTIVITY_TYPES[a.type]?.label ?? a.type },
        { key: "by", label: "Logged by", value: (a) => a.user?.name ?? a.user?.email ?? "Unknown" },
        { key: "deal", label: "Deal", value: (a) => a.deal?.title },
      ],
      columns: [
        {
          key: "type",
          label: "Type",
          className: "w-28",
          value: (a) => ACTIVITY_TYPES[a.type]?.label ?? a.type,
          render: (a) => (
            <span className="flex items-center gap-2">
              <ActivityIcon type={a.type} />
              <span className="text-foreground/80">{ACTIVITY_TYPES[a.type]?.label ?? a.type}</span>
            </span>
          ),
        },
        { key: "what", label: "What happened", value: (a) => a.content, render: (a) => <span className="block truncate">{a.content || <span className="text-muted-foreground/60">No details</span>}</span> },
        {
          key: "deal",
          label: "Deal",
          className: "w-52",
          value: (a) => a.deal?.title,
          render: (a) => (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{a.deal?.title ?? "—"}</span>
              {a.deal?.contact?.name && <span className="block truncate text-[11.5px] text-muted-foreground">{a.deal.contact.name}</span>}
            </span>
          ),
        },
        { key: "status", label: "Status", className: "w-32", value: statusOf, render: (a) => <StatusPill value={statusOf(a)} options={STATUSES} /> },
        {
          key: "due",
          label: "Planned for",
          className: "w-36",
          value: (a) => a.scheduledAt,
          render: (a) => (
            <span className={statusOf(a) === "overdue" ? "tabular-nums text-red-600 dark:text-red-400" : "tabular-nums text-foreground/80"}>{when(a.scheduledAt)}</span>
          ),
        },
        { key: "by", label: "By", className: "w-36", value: (a) => a.user?.name ?? a.user?.email, render: (a) => <MutedCell value={a.user?.name ?? a.user?.email} /> },
        { key: "logged", label: "Logged", className: "w-28", value: (a) => a.createdAt, render: (a) => <span className="tabular-nums text-foreground/80">{timeAgo(a.createdAt)}</span> },
        { key: "done", label: "Done on", className: "w-36", hidden: true, value: (a) => a.completedAt, render: (a) => <span className="tabular-nums text-foreground/80">{when(a.completedAt)}</span> },
      ],
      metrics: (rows) => {
        const now = Date.now();
        const week = 7 * 86400000;
        const overdue = rows.filter((a) => statusOf(a) === "overdue");
        const upcoming = rows.filter((a) => statusOf(a) === "upcoming");
        const thisWeek = upcoming.filter((a) => new Date(a.scheduledAt!).getTime() - now <= week);
        const doneWeek = rows.filter((a) => a.completedAt && now - new Date(a.completedAt).getTime() <= week);
        const recent = rows.filter((a) => now - new Date(a.createdAt).getTime() <= 30 * 86400000);
        const touched = new Set(recent.map((a) => a.dealId));
        return [
          { key: "overdue", label: "Overdue", color: "#EF4444", status: "overdue", value: overdue.length.toString(), note: overdue.length ? "Follow-ups that slipped" : "Nothing slipped", hint: "Calls, meetings and tasks planned for a time that has passed, still not done." },
          { key: "week", label: "Due this week", color: "#F59E0B", status: "upcoming", value: thisWeek.length.toString(), note: `${upcoming.length} planned in total`, hint: "Planned activities coming up in the next 7 days." },
          { key: "doneWeek", label: "Done this week", color: "#10B981", value: doneWeek.length.toString(), note: "Marked done in the last 7 days", hint: "Activities marked done in the last 7 days." },
          { key: "month", label: "Logged in 30 days", color: "#0EA5E9", value: recent.length.toString(), note: `Across ${touched.size} deal${touched.size === 1 ? "" : "s"}`, hint: "Everything written up in the last 30 days, and how many deals it touched." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const open = selected.filter((a) => !a.completedAt);
        return (
          <ActionButton
            icon={<CheckCircle2 className="size-3.5" />}
            success={`${open.length} marked as done`}
            className={open.length ? undefined : "pointer-events-none opacity-40"}
            run={async () => {
              for (const a of open) await patch(a.id, { completed: true });
              helpers.clearSelection();
              helpers.refresh();
            }}
          >
            Mark done{open.length ? ` (${open.length})` : ""}
          </ActionButton>
        );
      },
      preview: (a, helpers) => {
        const status = statusOf(a);
        return (
          <div className="px-5 pb-8 pt-5">
            <div className="flex items-center gap-2">
              <ActivityIcon type={a.type} />
              <span className="text-[14px] font-medium">{ACTIVITY_TYPES[a.type]?.label ?? a.type}</span>
              <StatusPill value={status} options={STATUSES} />
            </div>
            <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
              {a.content || <span className="text-muted-foreground">No details were written down.</span>}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {a.completedAt ? (
                <ActionButton icon={<RotateCcw className="size-3.5" />} success="Marked as not done" run={async () => { await patch(a.id, { completed: false }); helpers.refresh(); }}>
                  Not done yet
                </ActionButton>
              ) : (
                <ActionButton primary icon={<CheckCircle2 className="size-3.5" />} success="Marked as done" run={async () => { await patch(a.id, { completed: true }); helpers.refresh(); }}>
                  Mark done
                </ActionButton>
              )}
              <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/crm/deals/${a.dealId}/activity`)}>
                Open deal
              </ActionButton>
              <ActionButton
                icon={<Trash2 className="size-3.5" />}
                run={async () => {
                  const ok = await confirm({
                    title: "Delete this activity?",
                    description: "It will be removed from the deal's history for everyone.",
                    confirmLabel: "Delete",
                    destructive: true,
                  });
                  if (!ok) return false;
                  const orgId = localStorage.getItem("activeOrgId");
                  const res = await fetch(`/api/v1/crm/activities/${a.id}`, { method: "DELETE", headers: orgId ? { "x-organization-id": orgId } : {} });
                  if (!res.ok) throw new Error("Couldn't delete the activity");
                  helpers.refresh();
                }}
                success="Activity deleted"
              >
                Delete
              </ActionButton>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/80 p-4">
              {[
                { label: "Deal", value: a.deal ? <Link href={`/crm/deals/${a.deal.id}`} className="hover:underline">{a.deal.title}</Link> : "—" },
                { label: "Contact", value: a.deal?.contact?.name ?? "—" },
                { label: "Deal value", value: a.deal ? formatMoney(a.deal.valueCents, a.deal.currency) : "—" },
                { label: "Logged by", value: a.user?.name ?? a.user?.email ?? "—" },
                { label: "Planned for", value: when(a.scheduledAt) },
                { label: "Logged", value: when(a.createdAt) },
                { label: "Done on", value: when(a.completedAt) },
                { label: "Deal status", value: a.deal?.wonAt ? "Won" : a.deal?.lostAt ? "Lost" : "Open" },
              ].map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-[12px] text-muted-foreground">{f.label}</dt>
                  <dd className="mt-0.5 truncate text-[13px] font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      },
      empty: (
        <ListEmpty
          heading="Activities"
          icon={Activity}
          title="Nothing logged yet"
          description="Calls, emails, meetings, notes and follow-up tasks you log on a deal all show up here, so you can see what needs doing across every deal at once."
        >
          <Link href="/crm/deals" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium hover:bg-foreground/[0.03]">
            Go to deals
          </Link>
        </ListEmpty>
      ),
    }),
    [confirm, router]
  );

  return (
    <>
      <Explorer config={config} />
      {dialog}
    </>
  );
}
