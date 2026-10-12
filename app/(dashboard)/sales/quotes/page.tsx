"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, ScrollText, ArrowRightLeft, Check, X as XIcon, Send } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Quote {
  id: string;
  quoteNumber: string;
  issueDate: string;
  expiryDate: string;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  billedTotal: number;
  currencyCode: string;
  convertedInvoiceId: string | null;
  sentAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not sent to the customer yet" },
  { value: "sent", label: "Sent", color: "#0EA5E9", hint: "Waiting for the customer to say yes or no" },
  { value: "accepted", label: "Accepted", color: "#10B981", hint: "The customer said yes. Turn it into an invoice to bill them" },
  { value: "converted", label: "Invoiced", color: "#8B5CF6", hint: "Already turned into an invoice" },
  { value: "declined", label: "Declined", color: "#EF4444", hint: "The customer said no" },
  { value: "expired", label: "Expired", color: "#F59E0B", hint: "The offer ran out before the customer answered" },
];

const OPEN = new Set(["draft", "sent"]);
const WON = new Set(["accepted", "converted"]);

function sum(rows: Quote[]) {
  return rows.reduce((s, q) => s + q.total, 0);
}

export default function QuotesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Quotes");

  const config = useMemo<ExplorerConfig<Quote>>(
    () => ({
      id: "quotes",
      endpoint: "/api/v1/quotes",
      noun: { one: "Quote", many: "Quotes" },
      getId: (q) => q.id,
      href: (q) => `/sales/quotes/${q.id}`,
      status: { get: (q) => q.status, options: STATUSES },
      date: { get: (q) => q.issueDate, label: "Issue date" },
      party: { get: (q) => q.contact?.name, label: "Customer", many: "Customers" },
      amount: (q) => q.total,
      amountLabel: "Quoted value",
      currency: (q) => q.currencyCode,
      search: (q) => [q.quoteNumber, q.contact?.name, q.contact?.email, q.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [{ key: "currency", label: "Currency", value: (q) => q.currencyCode }],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (q) => q.quoteNumber, render: (q) => <NumberCell value={q.quoteNumber} /> },
        { key: "customer", label: "Customer", value: (q) => q.contact?.name, render: (q) => <PartyCell name={q.contact?.name} /> },
        { key: "issued", label: "Issued", className: "w-32", value: (q) => q.issueDate, render: (q) => <DateCell value={q.issueDate} /> },
        {
          key: "expires",
          label: "Expires",
          className: "w-44",
          hint: "The last day the customer can accept this price",
          value: (q) => q.expiryDate,
          render: (q) => <DueCell value={q.expiryDate} open={OPEN.has(q.status)} lateWord="over" />,
        },
        { key: "status", label: "Status", className: "w-32", value: (q) => q.status, render: (q) => <StatusPill value={q.status} options={STATUSES} /> },
        { key: "reference", label: "Reference", hidden: true, value: (q) => q.reference, render: (q) => <MutedCell value={q.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (q) => q.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (q) => q.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (q) => q.total, render: (q) => <MoneyCell cents={q.total} currency={q.currencyCode} className="font-medium" /> },
        {
          key: "billed",
          label: "Invoiced",
          align: "right",
          className: "w-32",
          money: true,
          hint: "How much of this quote has been billed so far",
          value: (q) => q.billedTotal,
          render: (q) => <MoneyCell cents={q.billedTotal} currency={q.currencyCode} />,
        },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (q) => q.currencyCode },
        { key: "sent", label: "Sent on", className: "w-32", hidden: true, value: (q) => q.sentAt, render: (q) => <DateCell value={q.sentAt} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (q) => q.createdAt, render: (q) => <DateCell value={q.createdAt} /> },
      ],
      metrics: (rows) => {
        const open = rows.filter((q) => q.status === "sent");
        const won = rows.filter((q) => WON.has(q.status));
        const lost = rows.filter((q) => q.status === "declined" || q.status === "expired");
        const decided = won.length + lost.length;
        const expiring = open.filter((q) => {
          const d = daysUntil(q.expiryDate);
          return d != null && d >= 0 && d <= 7;
        });
        const drafts = rows.filter((q) => q.status === "draft");
        const toBill = rows.filter((q) => q.status === "accepted").reduce((s, q) => s + q.total - q.billedTotal, 0);
        return [
          { key: "open", label: "Waiting on customers", color: "#0EA5E9", status: "sent", value: formatMoney(sum(open)), note: `${open.length} sent quote${open.length === 1 ? "" : "s"}`, hint: "Quotes you've sent that the customer hasn't answered yet." },
          { key: "won", label: "Won", color: "#10B981", value: formatMoney(sum(won)), note: `${won.length} accepted`, hint: "Quotes customers said yes to, including ones already invoiced." },
          { key: "rate", label: "Win rate", color: "#8B5CF6", value: decided ? `${Math.round((won.length / decided) * 100)}%` : "—", note: decided ? `${won.length} of ${decided} decided` : "No answers yet", hint: "Of the quotes customers answered (or let expire), how many they accepted." },
          { key: "bill", label: "Ready to invoice", color: "#14B8A6", status: "accepted", value: formatMoney(toBill), note: "Accepted, not yet billed", hint: "Accepted quotes you haven't turned into invoices yet. That's money you can ask for now." },
          { key: "expiring", label: "Expiring this week", color: "#F59E0B", value: formatMoney(sum(expiring)), note: `${expiring.length} quote${expiring.length === 1 ? "" : "s"} · nudge them`, hint: "Sent quotes whose offer ends in the next 7 days." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(sum(drafts)), hint: "Quotes you started but haven't sent." },
        ];
      },
      preview: (q, helpers) => (
        <DocumentPreview
          url={`/api/v1/quotes/${q.id}`}
          pick={(json) => {
            const doc = json.quote as Quote & { lines?: never[]; notes?: string | null };
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
              ],
            };
          }}
          number={q.quoteNumber}
          status={q.status}
          statusOptions={STATUSES}
          party={q.contact?.name}
          partySub={q.contact?.email}
          amount={q.total}
          currency={q.currencyCode}
          facts={[
            { label: "Issued", value: formatDay(q.issueDate) },
            { label: "Expires", value: <DueCell value={q.expiryDate} open={OPEN.has(q.status)} lateWord="over" /> },
            { label: "Sent on", value: formatDay(q.sentAt) },
            { label: "Invoiced so far", value: formatMoney(q.billedTotal, q.currencyCode) },
            { label: "Reference", value: q.reference || "—" },
            { label: "Currency", value: q.currencyCode },
          ]}
          actions={
            <>
              {q.status === "sent" && (
                <>
                  <ActionButton primary icon={<Check className="size-3.5" />} success="Marked as accepted" run={async () => { await postJson(`/api/v1/quotes/${q.id}/accept`); helpers.refresh(); }}>
                    Customer accepted
                  </ActionButton>
                  <ActionButton icon={<XIcon className="size-3.5" />} success="Marked as declined" run={async () => { await postJson(`/api/v1/quotes/${q.id}/decline`); helpers.refresh(); }}>
                    Declined
                  </ActionButton>
                </>
              )}
              {q.status === "accepted" && (
                <ActionButton
                  primary
                  icon={<FileText className="size-3.5" />}
                  success="Invoice created"
                  run={async () => {
                    const data = await postJson<{ invoice?: { id: string } }>(`/api/v1/quotes/${q.id}/convert`);
                    if (data.invoice?.id) router.push(`/sales/${data.invoice.id}`);
                  }}
                >
                  Turn into invoice
                </ActionButton>
              )}
              {q.status === "draft" && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={async () => router.push(`/sales/quotes/${q.id}`)}>
                  Review and send
                </ActionButton>
              )}
              {q.convertedInvoiceId && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/sales/${q.convertedInvoiceId}`)}>
                  View invoice
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <QuotesEmpty onCreate={() => openDrawer("quote")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

function QuotesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <BlurReveal>
      <div className="flex items-start px-3 sm:px-6 pt-16 pb-12">
        <div className="grid w-full gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Left: text + CTA */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <ScrollText className="size-3.5 text-purple-500" />
              Quotes &amp; Proposals
            </div>
            <h2 className="mt-4 text-lg sm:text-2xl font-semibold tracking-tight">Send quotes, win deals</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-md">
              Create detailed proposals with line items and pricing. When your customer accepts, turn it into an invoice with one click.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button
                onClick={onCreate}
                size="lg"
                className="bg-brand-600 hover:bg-brand-700"
              >
                <Plus className="mr-2 size-4" />
                New Quote
              </Button>
            </div>
            {/* Mini stats */}
            <div className="mt-8 flex gap-4 sm:gap-6 text-center">
              {[
                { label: "Sent", value: "0" },
                { label: "Accepted", value: "0" },
                { label: "Converted", value: "0" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xl font-bold font-mono tabular-nums text-muted-foreground/40">{value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: visual conversion flow */}
          <div className="relative hidden lg:block">
            {/* Quote card */}
            <div className="rounded-xl border bg-card p-5 shadow-sm max-w-xs ml-auto">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ScrollText className="size-4 text-purple-500" />
                  <span className="text-xs font-mono text-muted-foreground">QTE-0001</span>
                </div>
                <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">accepted</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Website redesign</span>
                  <span className="font-mono text-muted-foreground">$2,400.00</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">SEO audit</span>
                  <span className="font-mono text-muted-foreground">$800.00</span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between text-xs font-medium">
                  <span>Total</span>
                  <span className="font-mono">$3,200.00</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center my-3">
              <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
                <div className="h-4 w-px bg-current" />
                <ArrowRightLeft className="size-4 rotate-90" />
                <span className="text-[10px] font-medium">Turn into invoice</span>
              </div>
            </div>

            {/* Invoice card (faded) */}
            <div className="rounded-xl border border-dashed bg-card/50 p-5 max-w-xs ml-auto opacity-50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-blue-500" />
                  <span className="text-xs font-mono text-muted-foreground">INV-0001</span>
                </div>
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">draft</span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-28 rounded bg-muted" />
                <div className="h-2 w-20 rounded bg-muted" />
                <div className="h-px bg-border my-1" />
                <div className="h-2.5 w-24 rounded bg-muted ml-auto" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </BlurReveal>
  );
}
