"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, CreditCard, ReceiptText, Send, FileText, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface CreditNote {
  id: string;
  creditNoteNumber: string;
  issueDate: string;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  currencyCode: string;
  invoiceId: string | null;
  sentAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not sent to the customer yet" },
  { value: "sent", label: "Sent", color: "#0EA5E9", hint: "Sent to the customer. Any credit left can still be used against an invoice" },
  { value: "applied", label: "Used", color: "#8B5CF6", hint: "The credit has been used against an invoice" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

/** Counts towards what you've credited: sent or used, not drafts or cancelled. */
const isLive = (c: CreditNote) => c.status === "sent" || c.status === "applied";

function monthKeys() {
  const now = new Date();
  return {
    thisMonth: toDayKey(now).slice(0, 7),
    lastMonth: toDayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7),
  };
}

function sum(rows: CreditNote[], pick: (c: CreditNote) => number) {
  return rows.reduce((s, c) => s + pick(c), 0);
}

export default function CreditNotesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Credit Notes");

  const config = useMemo<ExplorerConfig<CreditNote>>(
    () => ({
      id: "credit-notes",
      endpoint: "/api/v1/credit-notes",
      noun: { one: "Credit note", many: "Credit notes" },
      getId: (c) => c.id,
      href: (c) => `/sales/credit-notes/${c.id}`,
      status: { get: (c) => c.status, options: STATUSES },
      date: { get: (c) => c.issueDate, label: "Issue date" },
      party: { get: (c) => c.contact?.name, label: "Customer", many: "Customers" },
      amount: (c) => c.total,
      amountLabel: "Credited",
      currency: (c) => c.currencyCode,
      search: (c) => [c.creditNoteNumber, c.contact?.name, c.contact?.email, c.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [
        { key: "linked", label: "Linked invoice", value: (c) => (c.invoiceId ? "Linked to an invoice" : "Not linked") },
        { key: "currency", label: "Currency", value: (c) => c.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (c) => c.creditNoteNumber, render: (c) => <NumberCell value={c.creditNoteNumber} /> },
        { key: "customer", label: "Customer", value: (c) => c.contact?.name, render: (c) => <PartyCell name={c.contact?.name} /> },
        { key: "issued", label: "Issued", className: "w-32", value: (c) => c.issueDate, render: (c) => <DateCell value={c.issueDate} /> },
        { key: "status", label: "Status", className: "w-32", value: (c) => c.status, render: (c) => <StatusPill value={c.status} options={STATUSES} /> },
        { key: "reference", label: "Reference", hidden: true, value: (c) => c.reference, render: (c) => <MutedCell value={c.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (c) => c.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (c) => c.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (c) => c.total, render: (c) => <MoneyCell cents={c.total} currency={c.currencyCode} className="font-medium" /> },
        {
          key: "used",
          label: "Used",
          align: "right",
          className: "w-32",
          money: true,
          hint: "How much of this credit has already gone against invoices",
          value: (c) => c.amountApplied,
          render: (c) => <MoneyCell cents={c.amountApplied} currency={c.currencyCode} />,
        },
        {
          key: "remaining",
          label: "Left to use",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Credit the customer still has. Use it to reduce what they owe on an invoice",
          value: (c) => (c.status === "void" ? 0 : c.amountRemaining),
          render: (c) => (
            <MoneyCell
              cents={c.status === "void" ? 0 : c.amountRemaining}
              currency={c.currencyCode}
              className={c.status === "sent" && c.amountRemaining > 0 ? "font-medium text-sky-700 dark:text-sky-400" : undefined}
            />
          ),
        },
        {
          key: "linked",
          label: "Invoice",
          className: "w-28",
          hidden: true,
          hint: "Whether this credit note was raised against a specific invoice",
          value: (c) => (c.invoiceId ? "Linked" : "—"),
        },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (c) => c.currencyCode },
        { key: "sent", label: "Sent on", className: "w-32", hidden: true, value: (c) => c.sentAt, render: (c) => <DateCell value={c.sentAt} /> },
        { key: "voided", label: "Cancelled on", className: "w-32", hidden: true, value: (c) => c.voidedAt, render: (c) => <DateCell value={c.voidedAt} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt} /> },
      ],
      metrics: (rows) => {
        const { thisMonth, lastMonth } = monthKeys();
        const live = rows.filter(isLive);
        const open = rows.filter((c) => c.status === "sent" && c.amountRemaining > 0);
        const credited = sum(live, (c) => c.total);
        const used = sum(live, (c) => c.amountApplied);
        const monthNow = live.filter((c) => c.issueDate.slice(0, 7) === thisMonth);
        const monthBefore = live.filter((c) => c.issueDate.slice(0, 7) === lastMonth);
        const drafts = rows.filter((c) => c.status === "draft");
        return [
          {
            key: "open",
            label: "Credit left to use",
            color: "#0EA5E9",
            status: "sent",
            value: formatMoney(sum(open, (c) => c.amountRemaining)),
            note: `${open.length} credit note${open.length === 1 ? "" : "s"} with credit left`,
            hint: "Credit you've given customers that hasn't been used against an invoice yet.",
          },
          {
            key: "used",
            label: "Used",
            color: "#8B5CF6",
            status: "applied",
            value: formatMoney(used),
            note: credited ? `${Math.round((used / credited) * 100)}% of all credit` : "Nothing credited yet",
            hint: "Credit that has already reduced what customers owe on invoices.",
          },
          {
            key: "month",
            label: "Credited this month",
            color: "#F59E0B",
            value: formatMoney(sum(monthNow, (c) => c.total)),
            note: `${formatMoney(sum(monthBefore, (c) => c.total))} last month`,
            hint: "Credit notes you've sent this calendar month, compared with last month.",
          },
          {
            key: "total",
            label: "Total credited",
            color: "#EF4444",
            value: formatMoney(credited),
            note: `${live.length} credit note${live.length === 1 ? "" : "s"}`,
            hint: "Everything you've credited back to customers, not counting drafts or cancelled ones.",
          },
          {
            key: "drafts",
            label: "Drafts",
            color: "#A1A1AA",
            status: "draft",
            value: drafts.length.toString(),
            note: formatMoney(sum(drafts, (c) => c.total)),
            hint: "Credit notes you started but haven't sent.",
          },
        ];
      },
      preview: (c) => (
        <DocumentPreview
          url={`/api/v1/credit-notes/${c.id}`}
          pick={(json) => {
            const doc = json.creditNote as (CreditNote & { lines?: never[]; notes?: string | null }) | undefined;
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
                { label: "Used", cents: doc?.amountApplied, tone: "#7C3AED" },
                { label: "Left to use", cents: doc?.status === "void" ? 0 : doc?.amountRemaining, strong: true },
              ],
            };
          }}
          number={c.creditNoteNumber}
          status={c.status}
          statusOptions={STATUSES}
          party={c.contact?.name}
          partySub={c.contact?.email}
          amount={c.status === "sent" && c.amountRemaining > 0 ? c.amountRemaining : c.total}
          amountLabel={c.status === "sent" && c.amountRemaining > 0 ? "left to use" : "total"}
          currency={c.currencyCode}
          facts={[
            { label: "Issued", value: formatDay(c.issueDate) },
            { label: "Sent on", value: formatDay(c.sentAt) },
            { label: "Total", value: formatMoney(c.total, c.currencyCode) },
            { label: "Used so far", value: formatMoney(c.amountApplied, c.currencyCode) },
            { label: "Reference", value: c.reference || "—" },
            { label: "Currency", value: c.currencyCode },
          ]}
          actions={
            <>
              {c.status === "draft" && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={async () => router.push(`/sales/credit-notes/${c.id}`)}>
                  Review and send
                </ActionButton>
              )}
              {c.status === "sent" && c.amountRemaining > 0 && (
                <ActionButton primary icon={<ArrowRightLeft className="size-3.5" />} run={async () => router.push(`/sales/credit-notes/${c.id}`)}>
                  Use against an invoice
                </ActionButton>
              )}
              {c.invoiceId && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/sales/${c.invoiceId}`)}>
                  View invoice
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <CreditNotesEmpty onCreate={() => openDrawer("creditNote")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

function CreditNotesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Credit Notes</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Issue credit notes to adjust invoices, handle refunds, or correct billing errors.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New Credit Note
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: Ledger-style calculation */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How credit notes work</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <ReceiptText className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Invoice total</p>
                    <p className="text-[11px] text-muted-foreground">INV-0042</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$1,200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <CreditCard className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Credit applied</p>
                    <p className="text-[11px] text-muted-foreground">CN-0001</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">-$200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">New balance</p>
                </div>
                <span className="font-mono text-sm font-bold">$1,000.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Overcharged a customer", desc: "Billed too much on an invoice? Issue a credit to correct the amount.", color: "border-l-blue-400" },
              { title: "Product returned", desc: "Customer returned goods? Credit the original invoice and adjust the balance.", color: "border-l-amber-400" },
              { title: "Service not delivered", desc: "Cancelled or incomplete work? Issue a partial or full credit note.", color: "border-l-brand-400" },
              { title: "Goodwill discount", desc: "Offering a retroactive discount? Apply it as a credit against the invoice.", color: "border-l-purple-400" },
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
