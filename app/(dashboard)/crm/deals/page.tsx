"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Handshake, KanbanSquare, Plus, Trophy } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { ListEmpty } from "@/components/dashboard/explorer/list-empty";
import { DateCell, DueCell, MoneyCell, MutedCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { DEAL_SOURCES, DEFAULT_STAGES, openStages, stageInfo, usePipelines } from "@/components/dashboard/crm/pipelines";
import { DealActivityPeek } from "@/components/dashboard/crm/activity-meta";
import { LostButton } from "@/components/dashboard/crm/lost-button";

interface Deal {
  id: string;
  title: string;
  pipelineId: string;
  stageId: string;
  valueCents: number;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  source: string | null;
  notes: string | null;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
  contact: { id: string; name: string; email: string | null } | null;
  assignedUser: { id: string; name: string | null; email: string } | null;
  pipeline: { id: string; name: string } | null;
}

const WON: ExplorerStatus = { value: "won", label: "Won", color: "#10B981", hint: "Deals you closed" };
const LOST: ExplorerStatus = { value: "lost", label: "Lost", color: "#EF4444", hint: "Deals that didn't go your way" };

const isOpen = (d: Deal) => !d.wonAt && !d.lostAt;
const statusOf = (d: Deal) => (d.wonAt ? "won" : d.lostAt ? "lost" : d.stageId);
const weighted = (d: Deal) => Math.round((d.valueCents * (d.probability ?? 0)) / 100);
const sum = (rows: Deal[], f: (d: Deal) => number = (d) => d.valueCents) => rows.reduce((s, d) => s + f(d), 0);

export default function DealsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { pipelines } = usePipelines();
  const [refreshKey, setRefreshKey] = useState(0);
  useDocumentTitle("CRM · Deals");

  // The drawer announces new deals; reload so they appear straight away
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1);
    window.addEventListener("deals-changed", bump);
    return () => window.removeEventListener("deals-changed", bump);
  }, []);

  const statuses = useMemo<ExplorerStatus[]>(() => {
    const seen = new Map<string, ExplorerStatus>();
    const source = pipelines.length ? pipelines : [{ id: "", name: "", isDefault: true, stages: DEFAULT_STAGES }];
    for (const p of source) {
      for (const s of openStages(p)) {
        if (!seen.has(s.id)) seen.set(s.id, { value: s.id, label: s.name, color: s.color, hint: `Open deals in the ${s.name} stage` });
      }
    }
    return [...seen.values(), WON, LOST];
  }, [pipelines]);

  const config = useMemo<ExplorerConfig<Deal>>(
    () => ({
      id: "crm-deals",
      endpoint: "/api/v1/crm/deals",
      noun: { one: "Deal", many: "Deals" },
      getId: (d) => d.id,
      href: (d) => `/crm/deals/${d.id}`,
      status: { get: statusOf, options: statuses },
      date: { get: (d) => d.createdAt, label: "Created" },
      party: { get: (d) => d.contact?.name, label: "Contact", many: "Contacts" },
      amount: (d) => d.valueCents,
      amountLabel: "Deal value",
      currency: (d) => d.currency,
      search: (d) => [d.title, d.contact?.name, d.contact?.email, d.assignedUser?.name, d.pipeline?.name, d.notes],
      defaultSort: { key: "created", dir: "desc" },
      facets: [
        { key: "pipeline", label: "Pipeline", value: (d) => d.pipeline?.name },
        { key: "owner", label: "Owner", value: (d) => d.assignedUser?.name ?? d.assignedUser?.email ?? "Unassigned" },
        { key: "source", label: "Source", value: (d) => (d.source ? DEAL_SOURCES[d.source] ?? d.source : "Not set") },
      ],
      columns: [
        {
          key: "title",
          label: "Deal",
          value: (d) => d.title,
          render: (d) => (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{d.title}</span>
              {d.contact?.name && <span className="block truncate text-[11.5px] text-muted-foreground">{d.contact.name}</span>}
            </span>
          ),
        },
        { key: "stage", label: "Stage", className: "w-36", value: (d) => statusOf(d), render: (d) => <StatusPill value={statusOf(d)} options={statuses} />, csv: (d) => (d.wonAt ? "Won" : d.lostAt ? "Lost" : stageInfo(pipelines, d.pipelineId, d.stageId).name) },
        { key: "value", label: "Value", align: "right", className: "w-32", money: true, value: (d) => d.valueCents, render: (d) => <MoneyCell cents={d.valueCents} currency={d.currency} className="font-medium" /> },
        {
          key: "probability",
          label: "Chance",
          align: "right",
          className: "w-24",
          hint: "How likely you think this deal is to close",
          value: (d) => d.probability ?? 0,
          render: (d) => <span className="tabular-nums text-foreground/80">{d.probability != null ? `${d.probability}%` : "—"}</span>,
        },
        {
          key: "weighted",
          label: "Weighted",
          align: "right",
          className: "w-32",
          money: true,
          hidden: true,
          hint: "Value multiplied by the chance of closing. Adds up to a realistic forecast",
          value: (d) => (isOpen(d) ? weighted(d) : 0),
          render: (d) => <MoneyCell cents={isOpen(d) ? weighted(d) : 0} currency={d.currency} />,
        },
        {
          key: "close",
          label: "Expected close",
          className: "w-44",
          value: (d) => d.expectedCloseDate,
          render: (d) => <DueCell value={d.expectedCloseDate} open={isOpen(d)} lateWord="past" />,
        },
        {
          key: "owner",
          label: "Owner",
          className: "w-40",
          value: (d) => d.assignedUser?.name ?? d.assignedUser?.email,
          render: (d) => <MutedCell value={d.assignedUser?.name ?? d.assignedUser?.email} />,
        },
        { key: "pipeline", label: "Pipeline", className: "w-40", hidden: pipelines.length < 2, value: (d) => d.pipeline?.name, render: (d) => <MutedCell value={d.pipeline?.name} /> },
        { key: "source", label: "Source", className: "w-32", hidden: true, value: (d) => (d.source ? DEAL_SOURCES[d.source] ?? d.source : null), render: (d) => <MutedCell value={d.source ? DEAL_SOURCES[d.source] ?? d.source : null} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (d) => d.createdAt, render: (d) => <DateCell value={d.createdAt} /> },
        { key: "closed", label: "Closed on", className: "w-32", hidden: true, value: (d) => d.wonAt ?? d.lostAt, render: (d) => <DateCell value={d.wonAt ?? d.lostAt} /> },
        { key: "lostReason", label: "Lost because", hidden: true, value: (d) => d.lostReason, render: (d) => <MutedCell value={d.lostReason} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (d) => d.currency },
      ],
      metrics: (rows) => {
        const open = rows.filter(isOpen);
        const won = rows.filter((d) => d.wonAt);
        const lost = rows.filter((d) => d.lostAt);
        const decided = won.length + lost.length;
        const month = toDayKey(new Date()).slice(0, 7);
        const closingSoon = open.filter((d) => d.expectedCloseDate?.slice(0, 7) === month);
        const late = open.filter((d) => {
          const n = daysUntil(d.expectedCloseDate);
          return n != null && n < 0;
        });
        return [
          { key: "open", label: "Open pipeline", color: "#0EA5E9", value: formatMoney(sum(open)), note: `${open.length} open deal${open.length === 1 ? "" : "s"}`, hint: "The full value of every deal that's still in play." },
          { key: "weighted", label: "Weighted forecast", color: "#8B5CF6", value: formatMoney(sum(open, weighted)), note: "Value × chance of closing", hint: "Each open deal counted at its chance of closing. A more realistic guess at what you'll win." },
          { key: "won", label: "Won", color: "#10B981", status: "won", value: formatMoney(sum(won)), note: `${won.length} deal${won.length === 1 ? "" : "s"}`, hint: "Deals you've closed." },
          { key: "rate", label: "Win rate", color: "#14B8A6", value: decided ? `${Math.round((won.length / decided) * 100)}%` : "—", note: decided ? `${won.length} of ${decided} decided` : "Nothing decided yet", hint: "Of the deals that were won or lost, how many you won." },
          { key: "month", label: "Closing this month", color: "#F59E0B", value: formatMoney(sum(closingSoon)), note: `${closingSoon.length} expected`, hint: "Open deals you expect to close before the month ends." },
          { key: "late", label: "Past close date", color: "#EF4444", value: late.length.toString(), note: formatMoney(sum(late)), hint: "Open deals whose expected close date has gone by. Update the date or chase them." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const open = selected.filter(isOpen);
        return (
          <>
            <ActionButton
              icon={<Trophy className="size-3.5" />}
              success={`${open.length} marked as won`}
              className={open.length ? undefined : "pointer-events-none opacity-40"}
              run={async () => {
                for (const d of open) await postJson(`/api/v1/crm/deals/${d.id}/won`);
                helpers.clearSelection();
                helpers.refresh();
              }}
            >
              Mark won{open.length ? ` (${open.length})` : ""}
            </ActionButton>
            <LostButton
              dealIds={open.map((d) => d.id)}
              label={`Mark lost${open.length ? ` (${open.length})` : ""}`}
              onDone={() => {
                helpers.clearSelection();
                helpers.refresh();
              }}
            />
          </>
        );
      },
      preview: (d, helpers) => {
        const stage = stageInfo(pipelines, d.pipelineId, d.stageId);
        return (
          <DocumentPreview
            plainTitle
            number={d.title}
            status={statusOf(d)}
            statusOptions={statuses}
            party={d.contact?.name ?? null}
            partySub={d.contact?.email}
            amount={d.valueCents}
            amountLabel={isOpen(d) && d.probability != null ? `${d.probability}% chance` : "deal value"}
            currency={d.currency}
            facts={[
              { label: "Stage", value: d.wonAt ? "Won" : d.lostAt ? "Lost" : stage.name },
              { label: "Pipeline", value: d.pipeline?.name ?? "—" },
              { label: "Expected close", value: <DueCell value={d.expectedCloseDate} open={isOpen(d)} lateWord="past" /> },
              { label: "Weighted value", value: isOpen(d) ? formatMoney(weighted(d), d.currency) : "—" },
              { label: "Owner", value: d.assignedUser?.name ?? d.assignedUser?.email ?? "Unassigned" },
              { label: "Source", value: d.source ? DEAL_SOURCES[d.source] ?? d.source : "—" },
              { label: "Created", value: formatDay(d.createdAt) },
              d.lostAt
                ? { label: "Lost because", value: d.lostReason || "No reason given" }
                : { label: "Closed on", value: formatDay(d.wonAt) },
            ]}
            actions={
              <>
                {isOpen(d) && (
                  <>
                    <ActionButton
                      primary
                      icon={<Trophy className="size-3.5" />}
                      success="Marked as won"
                      run={async () => {
                        await postJson(`/api/v1/crm/deals/${d.id}/won`);
                        helpers.refresh();
                      }}
                    >
                      Mark won
                    </ActionButton>
                    <LostButton dealIds={[d.id]} onDone={helpers.refresh} />
                  </>
                )}
                <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(`/crm/deals/${d.id}`)}>
                  Open deal
                </ActionButton>
              </>
            }
          >
            {d.notes && (
              <div className="mt-5">
                <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
                <p className="line-clamp-6 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{d.notes}</p>
              </div>
            )}
            <DealActivityPeek dealId={d.id} />
          </DocumentPreview>
        );
      },
      create: { label: "New deal", onClick: () => openDrawer("deal") },
      actions: (
        <Link
          href="/crm"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-[13px] font-medium transition-colors hover:bg-foreground/[0.03]"
        >
          <KanbanSquare className="size-3.5" />
          Board
        </Link>
      ),
      empty: (
        <ListEmpty
          heading="Deals"
          icon={Handshake}
          title="No deals yet"
          description="A deal is a sale you're working on: who it's with, what it's worth and how close it is. Add one and it lands on your pipeline board."
        >
          <button
            type="button"
            onClick={() => openDrawer("deal")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background hover:opacity-90"
          >
            <Plus className="size-3.5" />
            New deal
          </button>
        </ListEmpty>
      ),
    }),
    [openDrawer, pipelines, router, statuses]
  );

  return <Explorer config={config} refreshKey={refreshKey} />;
}
