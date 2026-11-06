"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText, Globe, Power, RefreshCw, ScrollText, CreditCard, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, PartyCell, StatusPill, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";
import { PortalInviteDialog } from "@/components/dashboard/contacts/portal-invite-dialog";
import { copyText, invitePortal, portalLink, revokePortal } from "@/components/dashboard/contacts/actions";
import { useApi } from "@/lib/query/use-api";

/** One row of GET /api/v1/portal/access?status=all. */
interface Access {
  id: string;
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactType: string | null;
  token: string;
  portalUrl: string;
  status: "active" | "expired" | "revoked";
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  lastActivityAt: string | null;
  activityCount: number;
}

interface ActivityRow {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
  contactId: string;
  contactName: string | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "active", label: "Active", color: "#10B981", hint: "The link works right now" },
  { value: "expired", label: "Expired", color: "#F59E0B", hint: "Past its end date. Send a new link to give access again" },
  { value: "revoked", label: "Switched off", color: "#A1A1AA", hint: "You turned this link off" },
];

const ACTIONS: Record<string, string> = {
  view_portal: "Opened their portal",
  view_invoices: "Looked at their invoices",
  approve_quote: "Accepted a quote",
  accept_quote: "Accepted a quote",
  view_statements: "Looked at their statement",
  view_payments: "Looked at their payments",
};

const actionLabel = (a: string) => ACTIONS[a] ?? a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function ago(value: string | null) {
  if (!value) return null;
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return formatDay(value);
}

function useActivity(contactId?: string) {
  const params = new URLSearchParams({ limit: contactId ? "12" : "25" });
  if (contactId) params.set("contactId", contactId);
  const { data, error } = useApi<{ data?: ActivityRow[] }>(`/api/v1/portal/activity?${params}`);
  return data ? data.data ?? [] : error ? [] : null;
}

function ActivityList({ rows, showName }: { rows: ActivityRow[] | null; showName?: boolean }) {
  if (!rows) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">Nothing yet. Activity shows up once they open the link.</p>;
  }
  return (
    <div className="divide-y divide-border/60 rounded-xl border border-border/80">
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate">
            {showName && (
              <Link href={`/contacts/${a.contactId}`} className="font-medium hover:underline">
                {a.contactName ?? "Customer"}
              </Link>
            )}
            <span className={showName ? "text-muted-foreground" : undefined}>{showName ? ` · ${actionLabel(a.action).toLowerCase()}` : actionLabel(a.action)}</span>
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground" title={new Date(a.createdAt).toLocaleString()}>
            {ago(a.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PortalPage() {
  useDocumentTitle("Contacts · Customer portal");
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [inviting, setInviting] = useState(false);
  const recent = useActivity();

  const config = useMemo<ExplorerConfig<Access>>(
    () => ({
      id: "contacts-portal",
      endpoint: "/api/v1/portal/access",
      params: { status: "all" },
      noun: { one: "Portal link", many: "Portal links" },
      getId: (a) => a.id,
      href: (a) => `/contacts/${a.contactId}`,
      status: { get: (a) => a.status, options: STATUSES },
      date: { get: (a) => a.createdAt, label: "Date sent" },
      chart: false,
      search: (a) => [a.contactName, a.contactEmail],
      defaultSort: { key: "created", dir: "desc" },
      facets: [{ key: "opened", label: "Opened", value: (a) => (a.activityCount > 0 ? "Has opened it" : "Never opened") }],
      columns: [
        { key: "name", label: "Customer", value: (a) => a.contactName, render: (a) => <PartyCell name={a.contactName ?? "Deleted contact"} sub={a.contactEmail} /> },
        { key: "status", label: "Status", className: "w-36", value: (a) => a.status, render: (a) => <StatusPill value={a.status} options={STATUSES} /> },
        {
          key: "last",
          label: "Last opened",
          className: "w-36",
          hint: "The last time they did something in their portal",
          value: (a) => a.lastActivityAt,
          render: (a) => (a.lastActivityAt ? <span className="text-foreground/80">{ago(a.lastActivityAt)}</span> : <span className="text-muted-foreground/60">Never opened</span>),
          csv: (a) => a.lastActivityAt,
        },
        { key: "visits", label: "Activity", align: "right", className: "w-24", hint: "Pages viewed and actions taken", value: (a) => a.activityCount, render: (a) => <span className="tabular-nums text-foreground/80">{a.activityCount}</span> },
        {
          key: "expires",
          label: "Works until",
          className: "w-44",
          value: (a) => a.expiresAt,
          render: (a) => (a.status === "revoked" ? <span className="text-muted-foreground/60">Switched off {formatDay(a.revokedAt)}</span> : a.expiresAt ? <DueCell value={a.expiresAt} open={a.status === "active"} lateWord="ago" /> : <span className="text-muted-foreground/60">No end date</span>),
        },
        { key: "created", label: "Sent", className: "w-32", value: (a) => a.createdAt, render: (a) => <DateCell value={a.createdAt} /> },
      ],
      metrics: (rows) => {
        const active = rows.filter((a) => a.status === "active");
        const customers = new Set(active.map((a) => a.contactId));
        const opened = active.filter((a) => a.activityCount > 0);
        const soon = active.filter((a) => a.expiresAt && new Date(a.expiresAt).getTime() - Date.now() < 7 * 86400000);
        const weekAgo = Date.now() - 7 * 86400000;
        const recentVisitors = new Set(rows.filter((a) => a.lastActivityAt && new Date(a.lastActivityAt).getTime() > weekAgo).map((a) => a.contactId));
        return [
          { key: "active", label: "Active links", color: "#10B981", status: "active", value: active.length.toString(), note: `${customers.size} customer${customers.size === 1 ? "" : "s"} with access`, hint: "Links that work right now. Click to show only them." },
          { key: "opened", label: "Opened", color: "#0EA5E9", value: `${opened.length} of ${active.length}`, note: active.length ? `${Math.round((opened.length / Math.max(1, active.length)) * 100)}% of active links` : "No active links", hint: "Active links the customer has opened at least once." },
          { key: "week", label: "Visited this week", color: "#8B5CF6", value: recentVisitors.size.toString(), note: "Customers active in 7 days", hint: "Customers who did something in their portal in the last 7 days." },
          { key: "soon", label: "Expiring soon", color: "#F59E0B", value: soon.length.toString(), note: soon.length ? "Within 7 days" : "None in the next week", hint: "Active links that stop working within a week. Send a new one to keep access." },
          { key: "expired", label: "Expired", color: "#F59E0B", status: "expired", value: rows.filter((a) => a.status === "expired").length.toString(), note: "Need a new link", hint: "Links past their end date." },
          { key: "revoked", label: "Switched off", color: "#A1A1AA", status: "revoked", value: rows.filter((a) => a.status === "revoked").length.toString(), note: "Turned off by you", hint: "Links you switched off." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const live = selected.filter((a) => a.status === "active");
        return (
          <>
            <ActionButton
              icon={<Copy className="size-3.5" />}
              className={live.length ? undefined : "pointer-events-none opacity-40"}
              run={() => copyText(live.map((a) => `${a.contactName}: ${portalLink(a.portalUrl)}`).join("\n"), `Copied ${live.length} link${live.length === 1 ? "" : "s"}`)}
            >
              Copy links
            </ActionButton>
            <ActionButton
              icon={<Power className="size-3.5" />}
              className={live.length ? "text-red-600 dark:text-red-400" : "pointer-events-none opacity-40"}
              run={() =>
                confirm({
                  title: `Switch off ${live.length} portal link${live.length === 1 ? "" : "s"}?`,
                  description: "These customers lose access straight away. You can always send them a new link.",
                  confirmLabel: "Switch off",
                  destructive: true,
                  onConfirm: async () => {
                    await Promise.all(live.map((a) => revokePortal(a.id)));
                    toast.success(`Switched off ${live.length} link${live.length === 1 ? "" : "s"}`);
                    helpers.clearSelection();
                  },
                })
              }
            >
              Switch off
            </ActionButton>
          </>
        );
      },
      preview: (a) => (
        <DocumentPreview
          plainTitle
          number="Portal link"
          status={a.status}
          statusOptions={STATUSES}
          party={a.contactName ?? "Deleted contact"}
          partySub={a.contactEmail}
          facts={[
            { label: "Sent", value: formatDay(a.createdAt) },
            { label: a.status === "revoked" ? "Switched off" : "Works until", value: a.status === "revoked" ? formatDay(a.revokedAt) : a.expiresAt ? formatDay(a.expiresAt) : "No end date" },
            { label: "Last opened", value: ago(a.lastActivityAt) ?? "Never" },
            { label: "Activity", value: `${a.activityCount} event${a.activityCount === 1 ? "" : "s"}` },
          ]}
          actions={
            <>
              {a.status === "active" && (
                <ActionButton primary icon={<Copy className="size-3.5" />} run={() => copyText(portalLink(a.portalUrl), "Link copied")}>
                  Copy link
                </ActionButton>
              )}
              {a.status === "active" && (
                <ActionButton icon={<ExternalLink className="size-3.5" />} run={async () => void window.open(portalLink(a.portalUrl), "_blank")}>
                  Open portal
                </ActionButton>
              )}
              <ActionButton
                primary={a.status !== "active"}
                icon={<RefreshCw className="size-3.5" />}
                run={async () => {
                  const res = await invitePortal({ contactId: a.contactId, expiresInDays: 30 });
                  if (a.status === "active") await revokePortal(a.id);
                  await copyText(portalLink(res.portalUrl), "New 30-day link created and copied");
                }}
              >
                {a.status === "active" ? "Replace link" : "Send new link"}
              </ActionButton>
              {a.status === "active" && (
                <ActionButton
                  icon={<Power className="size-3.5" />}
                  className="text-red-600 dark:text-red-400"
                  run={() =>
                    confirm({
                      title: `Switch off ${a.contactName ?? "this customer"}'s portal?`,
                      description: "The link stops working straight away. You can send a new one any time.",
                      confirmLabel: "Switch off",
                      destructive: true,
                      onConfirm: async () => {
                        await revokePortal(a.id);
                        toast.success("Portal link switched off");
                      },
                    })
                  }
                >
                  Switch off
                </ActionButton>
              )}
            </>
          }
        >
          {a.status === "active" && (
            <div className="mt-6">
              <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Link</p>
              <div className="flex items-center gap-2 rounded-lg bg-foreground/[0.04] p-1.5 pl-3">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/80">{portalLink(a.portalUrl)}</span>
                <button type="button" onClick={() => copyText(portalLink(a.portalUrl), "Link copied")} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground" aria-label="Copy link">
                  <Copy className="size-3.5" />
                </button>
              </div>
            </div>
          )}
          <PreviewActivity contactId={a.contactId} />
        </DocumentPreview>
      ),
      create: { label: "Invite a customer", onClick: () => setInviting(true) },
      empty: <PortalEmpty onInvite={() => setInviting(true)} />,
    }),
    [confirm]
  );

  return (
    <div className="space-y-8">
      <Explorer config={config} />
      {recent && recent.length > 0 && (
        <section className="@container">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Recent portal activity</h3>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">What customers looked at and did in their portals</p>
            </div>
          </div>
          <ActivityList rows={recent} showName />
        </section>
      )}
      <PortalInviteDialog open={inviting} onOpenChange={setInviting} />
      {confirmDialog}
    </div>
  );
}

function PreviewActivity({ contactId }: { contactId: string }) {
  const rows = useActivity(contactId);
  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Their portal activity</p>
      <ActivityList rows={rows} />
    </div>
  );
}

const SEES = [
  { icon: FileText, title: "Invoices", body: "Every invoice with what's paid and what's due, as PDFs." },
  { icon: ScrollText, title: "Statements", body: "Their running balance with you, any time they need it." },
  { icon: MessageSquare, title: "Quotes", body: "Open quotes they can accept with one click." },
  { icon: CreditCard, title: "Payments", body: "Payments you've received from them." },
];

function PortalEmpty({ onInvite }: { onInvite: () => void }) {
  return (
    <div className="@container mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-foreground/[0.05]">
        <Globe className="size-6 text-foreground/70" />
      </div>
      <h2 className="mt-4 text-[19px] font-semibold tracking-tight">Give customers their own page</h2>
      <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        Send a customer a private link and they can check their invoices, statement and quotes themselves — fewer &ldquo;can you resend that?&rdquo; emails, faster payments. No account or password needed.
      </p>
      <Button size="sm" className="mt-5 gap-1.5" onClick={onInvite}>
        <Globe className="size-3.5" />
        Invite a customer
      </Button>
      <div className="mt-10 grid w-full grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/80 bg-border/60 text-left @md:grid-cols-2 @3xl:grid-cols-4">
        {SEES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="bg-card p-4">
            <Icon className="size-4 text-foreground/60" />
            <p className="mt-2.5 text-[13px] font-medium">{title}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
