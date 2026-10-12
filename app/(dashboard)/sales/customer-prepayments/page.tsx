"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wallet, ReceiptText, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, PartyCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface CustomerCredit {
  id: string;
  date: string;
  status: string;
  originalAmount: number;
  amountRemaining: number;
  sourceType: string;
  currencyCode: string;
  notes: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "open", label: "Available", color: "#0EA5E9", hint: "Credit still available to put towards an invoice" },
  { value: "applied", label: "Used", color: "#8B5CF6", hint: "Credit you've used against an invoice" },
  { value: "refunded", label: "Refunded", color: "#14B8A6", hint: "The money was paid back to the customer" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

// Plain-language labels for how the money arrived.
const SOURCES: Record<string, string> = {
  prepayment: "Paid in advance",
  overpayment: "Overpaid",
  credit_note: "Credit note",
};

const sourceOf = (c: CustomerCredit) => SOURCES[c.sourceType] ?? c.sourceType;
const remainingOf = (c: CustomerCredit) => (c.status === "void" ? 0 : c.amountRemaining);
const usedOf = (c: CustomerCredit) => (c.status === "void" ? 0 : Math.max(0, c.originalAmount - c.amountRemaining));
const isAvailable = (c: CustomerCredit) => c.status === "open" && c.amountRemaining > 0;

function monthKeys() {
  const now = new Date();
  return {
    thisMonth: toDayKey(now).slice(0, 7),
    lastMonth: toDayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7),
  };
}

function sum(rows: CustomerCredit[], pick: (c: CustomerCredit) => number) {
  return rows.reduce((s, c) => s + pick(c), 0);
}

export default function CustomerPrepaymentsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Prepayments");

  const config = useMemo<ExplorerConfig<CustomerCredit>>(
    () => ({
      id: "customer-prepayments",
      endpoint: "/api/v1/customer-credits",
      noun: { one: "Prepayment", many: "Prepayments" },
      getId: (c) => c.id,
      href: (c) => `/sales/customer-prepayments/${c.id}`,
      status: { get: (c) => c.status, options: STATUSES },
      date: { get: (c) => c.date, label: "Date received" },
      party: { get: (c) => c.contact?.name, label: "Customer", many: "Customers" },
      amount: (c) => c.originalAmount,
      amountLabel: "Received",
      currency: (c) => c.currencyCode,
      search: (c) => [c.contact?.name, c.contact?.email, sourceOf(c), c.notes],
      defaultSort: { key: "date", dir: "desc" },
      facets: [
        { key: "source", label: "Source", value: sourceOf },
        { key: "currency", label: "Currency", value: (c) => c.currencyCode },
      ],
      columns: [
        { key: "date", label: "Date", className: "w-32", value: (c) => c.date, render: (c) => <DateCell value={c.date} /> },
        { key: "customer", label: "Customer", value: (c) => c.contact?.name, render: (c) => <PartyCell name={c.contact?.name} /> },
        { key: "source", label: "Source", className: "w-36", hint: "How the money came in: paid in advance, an overpayment, or a credit note", value: sourceOf, render: (c) => <MutedCell value={sourceOf(c)} /> },
        { key: "status", label: "Status", className: "w-32", value: (c) => c.status, render: (c) => <StatusPill value={c.status} options={STATUSES} /> },
        { key: "original", label: "Received", align: "right", className: "w-32", money: true, value: (c) => c.originalAmount, render: (c) => <MoneyCell cents={c.originalAmount} currency={c.currencyCode} /> },
        {
          key: "used",
          label: "Used",
          align: "right",
          className: "w-32",
          money: true,
          hint: "How much has already gone towards invoices or been refunded",
          value: usedOf,
          render: (c) => <MoneyCell cents={usedOf(c)} currency={c.currencyCode} />,
        },
        {
          key: "remaining",
          label: "Available",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Credit still sitting on the customer's account that you can put towards an invoice",
          value: remainingOf,
          render: (c) => <MoneyCell cents={remainingOf(c)} currency={c.currencyCode} className={isAvailable(c) ? "font-medium text-sky-700 dark:text-sky-400" : undefined} />,
        },
        { key: "notes", label: "Notes", hidden: true, value: (c) => c.notes, render: (c) => <MutedCell value={c.notes} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (c) => c.currencyCode },
        { key: "created", label: "Recorded", className: "w-32", hidden: true, value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt} /> },
      ],
      metrics: (rows) => {
        const { thisMonth, lastMonth } = monthKeys();
        const live = rows.filter((c) => c.status !== "void");
        const open = rows.filter(isAvailable);
        const customers = new Set(open.map((c) => c.contact?.name ?? "")).size;
        const received = sum(live, (c) => c.originalAmount);
        const used = sum(live, usedOf);
        const monthNow = sum(live.filter((c) => c.date.slice(0, 7) === thisMonth), (c) => c.originalAmount);
        const monthBefore = sum(live.filter((c) => c.date.slice(0, 7) === lastMonth), (c) => c.originalAmount);
        const refunded = rows.filter((c) => c.status === "refunded");
        return [
          {
            key: "available",
            label: "Available to use",
            color: "#0EA5E9",
            status: "open",
            value: formatMoney(sum(open, remainingOf)),
            note: `${customers} customer${customers === 1 ? " has" : "s have"} credit`,
            hint: "Money customers paid you up front that you haven't put towards an invoice yet. You owe them this work or a refund.",
          },
          {
            key: "used",
            label: "Used",
            color: "#8B5CF6",
            status: "applied",
            value: formatMoney(used),
            note: received ? `${Math.round((used / received) * 100)}% of what came in` : "Nothing received yet",
            hint: "Credit that has already gone towards invoices or been refunded.",
          },
          {
            key: "month",
            label: "Received this month",
            color: "#10B981",
            value: formatMoney(monthNow),
            note: `${formatMoney(monthBefore)} last month`,
            hint: "Prepayments dated this calendar month, compared with last month.",
          },
          {
            key: "total",
            label: "Total received",
            color: "#F59E0B",
            value: formatMoney(received),
            note: `${live.length} prepayment${live.length === 1 ? "" : "s"}`,
            hint: "Everything customers have paid in advance, not counting cancelled ones.",
          },
          {
            key: "refunded",
            label: "Refunded",
            color: "#14B8A6",
            status: "refunded",
            value: formatMoney(sum(refunded, (c) => c.originalAmount)),
            note: `${refunded.length} paid back`,
            hint: "Prepayments you gave back to the customer.",
          },
        ];
      },
      preview: (c) => (
        <DocumentPreview
          number={sourceOf(c)}
          plainTitle
          status={c.status}
          statusOptions={STATUSES}
          party={c.contact?.name}
          partySub={c.contact?.email}
          amount={isAvailable(c) ? c.amountRemaining : c.originalAmount}
          amountLabel={isAvailable(c) ? "available" : "received"}
          currency={c.currencyCode}
          facts={[
            { label: "Date received", value: formatDay(c.date) },
            { label: "Source", value: sourceOf(c) },
            { label: "Received", value: formatMoney(c.originalAmount, c.currencyCode) },
            { label: "Used", value: formatMoney(usedOf(c), c.currencyCode) },
            { label: "Available", value: formatMoney(remainingOf(c), c.currencyCode) },
            { label: "Currency", value: c.currencyCode },
          ]}
          actions={
            isAvailable(c) ? (
              <ActionButton primary icon={<ArrowRightLeft className="size-3.5" />} run={async () => router.push(`/sales/customer-prepayments/${c.id}`)}>
                Put towards an invoice
              </ActionButton>
            ) : undefined
          }
        >
          {c.notes && (
            <div className="mt-6">
              <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{c.notes}</p>
            </div>
          )}
        </DocumentPreview>
      ),
      empty: <PrepaymentsEmpty onCreate={() => openDrawer("customerCredit")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

function PrepaymentsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Prepayments</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Money a customer paid you in advance — a credit sitting on their account that you can put towards a future invoice.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New prepayment
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a prepayment works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <Wallet className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Customer pays you early</p>
                    <p className="text-[11px] text-muted-foreground">Credit on account</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">+$500.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-blue-50/30 dark:bg-blue-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <ReceiptText className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Put towards an invoice</p>
                    <p className="text-[11px] text-muted-foreground">INV-0042</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">-$300.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Credit left over</p>
                </div>
                <span className="font-mono text-sm font-bold">$200.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Deposit before work starts", desc: "A customer pays up front to secure a booking or kick off a job.", color: "border-l-brand-400" },
              { title: "Customer paid too much", desc: "Got an overpayment on an invoice? Hold the extra as a credit on their account.", color: "border-l-blue-400" },
              { title: "Retainer or top-up", desc: "Money paid in advance to be drawn down against future invoices.", color: "border-l-amber-400" },
              { title: "Put it towards an invoice later", desc: "When you bill them, use the available credit to reduce what they owe.", color: "border-l-purple-400" },
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
