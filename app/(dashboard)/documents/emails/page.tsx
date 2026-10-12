"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Mail, Paperclip, RotateCw } from "lucide-react";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { ListEmpty } from "@/components/dashboard/explorer/list-empty";
import { MutedCell, StatusPill } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface SentEmail {
  id: string;
  documentType: string;
  documentId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  attachPdf: boolean;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  sentByUser: { id: string; name: string | null; email: string } | null;
  document: { kind: string; label: string | null; href: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "sent", label: "Sent", color: "#10B981", hint: "Handed to the mail server for delivery" },
  { value: "failed", label: "Failed", color: "#EF4444", hint: "Didn't go out. Open it to see why, then resend" },
];

const KIND_LABELS: Record<string, string> = {
  invoice: "Invoices",
  quote: "Quotes",
  credit_note: "Credit notes",
  purchase_order: "Purchase orders",
  debit_note: "Supplier credits",
  remittance_advice: "Remittance advice",
};

const DATE_TIME = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const when = (v: string) => DATE_TIME.format(new Date(v));
const sender = (e: SentEmail) => e.sentByUser?.name ?? e.sentByUser?.email ?? null;
const docLabel = (e: SentEmail) => e.document?.label ?? null;

export default function SentEmailsPage() {
  const router = useRouter();
  useDocumentTitle("Documents · Sent emails");

  const config = useMemo<ExplorerConfig<SentEmail>>(
    () => ({
      id: "document-emails",
      endpoint: "/api/v1/document-emails",
      noun: { one: "Sent email", many: "Sent emails" },
      getId: (e) => e.id,
      href: (e) => e.document?.href ?? "",
      status: { get: (e) => (e.status === "failed" ? "failed" : "sent"), options: STATUSES },
      date: { get: (e) => e.sentAt, label: "Sent" },
      party: { get: (e) => e.recipientEmail, label: "Recipient", many: "Recipients" },
      search: (e) => [e.recipientEmail, e.subject, docLabel(e), e.document?.kind, sender(e)],
      defaultSort: { key: "sent", dir: "desc" },
      chart: false,
      facets: [
        { key: "kind", label: "Document", value: (e) => KIND_LABELS[e.documentType] ?? e.documentType },
        { key: "by", label: "Sent by", value: (e) => sender(e) ?? "Automatic" },
        { key: "pdf", label: "PDF attached", value: (e) => (e.attachPdf ? "With PDF" : "No PDF") },
      ],
      columns: [
        {
          key: "document",
          label: "Document",
          className: "w-56",
          value: (e) => docLabel(e) ?? e.document?.kind,
          render: (e) => (
            <span className="block min-w-0">
              <span className="block truncate font-medium">{docLabel(e) ?? <span className="text-muted-foreground/60">Deleted document</span>}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{e.document?.kind ?? e.documentType}</span>
            </span>
          ),
        },
        { key: "to", label: "To", className: "w-56", value: (e) => e.recipientEmail, render: (e) => <span className="block truncate">{e.recipientEmail}</span> },
        { key: "subject", label: "Subject", value: (e) => e.subject, render: (e) => <span className="block truncate text-foreground/80">{e.subject}</span> },
        { key: "status", label: "Status", className: "w-28", value: (e) => e.status, render: (e) => <StatusPill value={e.status === "failed" ? "failed" : "sent"} options={STATUSES} /> },
        { key: "sent", label: "Sent", className: "w-44", value: (e) => e.sentAt, render: (e) => <span className="tabular-nums text-foreground/80">{when(e.sentAt)}</span> },
        { key: "by", label: "Sent by", className: "w-36", hidden: true, value: (e) => sender(e), render: (e) => <MutedCell value={sender(e) ?? "Automatic"} /> },
        { key: "pdf", label: "PDF", className: "w-20", hidden: true, value: (e) => (e.attachPdf ? "Yes" : "No") },
      ],
      metrics: (rows) => {
        const now = Date.now();
        const recent = rows.filter((e) => now - new Date(e.sentAt).getTime() <= 30 * 86400000);
        const failed = rows.filter((e) => e.status === "failed");
        const ok = rows.length - failed.length;
        const people = new Set(recent.map((e) => e.recipientEmail.toLowerCase()));
        const invoices = recent.filter((e) => e.documentType === "invoice").length;
        return [
          { key: "recent", label: "Sent in 30 days", color: "#0EA5E9", value: recent.length.toString(), note: `To ${people.size} recipient${people.size === 1 ? "" : "s"}` },
          { key: "invoices", label: "Invoices emailed", color: "#8B5CF6", value: invoices.toString(), note: "In the last 30 days" },
          { key: "failed", label: "Failed", color: "#EF4444", status: "failed", value: failed.length.toString(), note: failed.length ? "Check the address and resend" : "Everything went out", hint: "Emails the mail server refused. Open one to see the reason." },
          { key: "rate", label: "Delivered", color: "#10B981", status: "sent", value: rows.length ? `${Math.round((ok / rows.length) * 100)}%` : "—", note: `${ok} of ${rows.length}` },
        ];
      },
      bulkActions: (selected, helpers) => (
        <ActionButton
          icon={<RotateCw className="size-3.5" />}
          success={`Resent ${selected.length} email${selected.length === 1 ? "" : "s"}`}
          run={async () => {
            for (const e of selected) await postJson(`/api/v1/document-emails/${e.id}/resend`);
            helpers.clearSelection();
            helpers.refresh();
          }}
        >
          Resend ({selected.length})
        </ActionButton>
      ),
      preview: (e, helpers) => (
        <div className="px-5 pb-8 pt-5">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">{e.document?.kind ?? e.documentType}</span>
            <StatusPill value={e.status === "failed" ? "failed" : "sent"} options={STATUSES} />
          </div>
          <p className="mt-2 text-[16px] font-semibold leading-snug tracking-[-0.01em]">{e.subject}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            To <span className="text-foreground">{e.recipientEmail}</span> · {when(e.sentAt)}
          </p>
          {e.status === "failed" && e.errorMessage && (
            <p className="mt-3 rounded-lg bg-red-500/[0.07] px-3 py-2 text-[12.5px] text-red-700 dark:text-red-400">{e.errorMessage}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              primary={e.status === "failed"}
              icon={<RotateCw className="size-3.5" />}
              success="Email resent"
              run={async () => {
                await postJson(`/api/v1/document-emails/${e.id}/resend`);
                helpers.refresh();
              }}
            >
              Resend
            </ActionButton>
            {e.document?.href && (
              <ActionButton icon={<ArrowUpRight className="size-3.5" />} run={async () => router.push(e.document!.href!)}>
                Open {e.document.kind.toLowerCase()}
              </ActionButton>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/80 p-4">
            {[
              { label: "Document", value: docLabel(e) ?? "Deleted" },
              { label: "Sent by", value: sender(e) ?? "Automatic" },
              { label: "PDF attached", value: e.attachPdf ? <span className="inline-flex items-center gap-1"><Paperclip className="size-3" /> Yes</span> : "No" },
              { label: "Status", value: e.status === "failed" ? "Failed" : "Sent" },
            ].map((x) => (
              <div key={x.label} className="min-w-0">
                <dt className="text-[12px] text-muted-foreground">{x.label}</dt>
                <dd className="mt-0.5 truncate text-[13px] font-medium">{x.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mb-2 mt-6 text-[12.5px] font-medium text-muted-foreground">What they received</p>
          {/* Sandboxed: the stored body is HTML, so it can't run scripts or reach the app */}
          <iframe
            title="Email body"
            sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#18181b;margin:14px;}a{color:#18181b}</style></head><body>${e.body}</body></html>`}
            className="h-80 w-full rounded-xl border border-border/80 bg-white"
          />
        </div>
      ),
      empty: (
        <ListEmpty
          heading="Sent emails"
          icon={Mail}
          title="No emails sent yet"
          description="When you email an invoice, quote, credit note, purchase order or remittance advice from dubbl, it's logged here with whether it went out, so you can resend anything that bounced."
        />
      ),
    }),
    [router]
  );

  return <Explorer config={config} />;
}
