"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, Banknote, FileText, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContentReveal } from "@/components/ui/content-reveal";
import { EmptyState } from "@/components/dashboard/empty-state";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { useApi } from "@/lib/query/use-api";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Allocation {
  id: string;
  documentType: string;
  documentId: string;
  amount: number;
}

interface Payment {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  currencyCode: string;
  method: string;
  reference: string | null;
  notes: string | null;
  bankAccountId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
  allocations: Allocation[];
}

const METHODS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  check: "Check",
  card: "Card",
  other: "Other",
};

const STATUSES: ExplorerStatus[] = [
  { value: "matched", label: "Matched", color: "#10B981", hint: "The whole payment has been put toward invoices" },
  { value: "partial", label: "Part matched", color: "#F59E0B", hint: "Some of the payment is still not put toward any invoice" },
  { value: "unmatched", label: "Not matched", color: "#EC4899", hint: "None of this payment has been put toward an invoice yet" },
];

const allocated = (p: Payment) => (p.allocations ?? []).reduce((s, a) => s + a.amount, 0);
const leftover = (p: Payment) => Math.max(0, p.amount - allocated(p));

function statusOf(p: Payment) {
  const used = allocated(p);
  if (used <= 0) return "unmatched";
  return used >= p.amount ? "matched" : "partial";
}

function monthKeys() {
  const now = new Date();
  return {
    thisMonth: toDayKey(now).slice(0, 7),
    lastMonth: toDayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7),
  };
}

function sum(rows: Payment[]) {
  return rows.reduce((s, p) => s + p.amount, 0);
}

function change(now: number, before: number) {
  if (!before) return now ? "Nothing last month" : "Same as last month";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "Same as last month" : `${pct > 0 ? "+" : ""}${pct}% vs last month`;
}

export default function PaymentsPage() {
  const router = useRouter();
  useDocumentTitle("Sales · Payments");

  const config = useMemo<ExplorerConfig<Payment>>(
    () => ({
      id: "payments-received",
      endpoint: "/api/v1/payments",
      params: { type: "received" },
      noun: { one: "Payment", many: "Payments" },
      getId: (p) => p.id,
      href: (p) => `/sales/payments/${p.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (p) => p.date, label: "Payment date" },
      party: { get: (p) => p.contact?.name, label: "Customer", many: "Customers" },
      amount: (p) => p.amount,
      amountLabel: "Received",
      currency: (p) => p.currencyCode,
      search: (p) => [p.paymentNumber, p.contact?.name, p.contact?.email, p.reference, p.notes, METHODS[p.method]],
      defaultSort: { key: "date", dir: "desc" },
      facets: [
        { key: "method", label: "Method", value: (p) => METHODS[p.method] ?? p.method },
        { key: "source", label: "Came in via", value: (p) => (p.stripePaymentIntentId ? "Online (Stripe)" : "Recorded by hand") },
        { key: "currency", label: "Currency", value: (p) => p.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (p) => p.paymentNumber, render: (p) => <NumberCell value={p.paymentNumber} /> },
        { key: "customer", label: "Customer", value: (p) => p.contact?.name, render: (p) => <PartyCell name={p.contact?.name} /> },
        { key: "date", label: "Date", className: "w-32", value: (p) => p.date, render: (p) => <DateCell value={p.date} /> },
        { key: "method", label: "Method", className: "w-32", value: (p) => METHODS[p.method] ?? p.method, render: (p) => <MutedCell value={METHODS[p.method] ?? p.method} /> },
        { key: "status", label: "Matched", className: "w-36", hint: "Whether the payment has been put toward invoices", value: statusOf, render: (p) => <StatusPill value={statusOf(p)} options={STATUSES} /> },
        { key: "reference", label: "Reference", className: "w-36", value: (p) => p.reference, render: (p) => <MutedCell value={p.reference} /> },
        {
          key: "invoices",
          label: "Invoices",
          align: "right",
          className: "w-24",
          hint: "How many invoices this payment was split across",
          value: (p) => p.allocations?.length ?? 0,
          render: (p) => {
            const n = p.allocations?.length ?? 0;
            return n ? <span className="tabular-nums text-foreground/80">{n}</span> : <span className="text-muted-foreground/50">—</span>;
          },
        },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          className: "w-32",
          money: true,
          value: (p) => p.amount,
          render: (p) => <MoneyCell cents={p.amount} currency={p.currencyCode} className="font-medium text-emerald-600 dark:text-emerald-400" />,
        },
        {
          key: "allocated",
          label: "Put toward invoices",
          align: "right",
          className: "w-36",
          money: true,
          hidden: true,
          value: allocated,
          render: (p) => <MoneyCell cents={allocated(p)} currency={p.currencyCode} />,
        },
        {
          key: "leftover",
          label: "Leftover",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Money from this payment that isn't put toward any invoice yet",
          value: leftover,
          render: (p) => <MoneyCell cents={leftover(p)} currency={p.currencyCode} className={leftover(p) > 0 ? "font-medium text-amber-600 dark:text-amber-400" : undefined} />,
        },
        { key: "source", label: "Came in via", className: "w-36", hidden: true, value: (p) => (p.stripePaymentIntentId ? "Online (Stripe)" : "Recorded by hand") },
        { key: "notes", label: "Notes", hidden: true, value: (p) => p.notes, render: (p) => <MutedCell value={p.notes} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (p) => p.currencyCode },
        { key: "created", label: "Recorded", className: "w-32", hidden: true, value: (p) => p.createdAt, render: (p) => <DateCell value={p.createdAt} /> },
      ],
      metrics: (rows) => {
        const { thisMonth, lastMonth } = monthKeys();
        const now = rows.filter((p) => p.date.slice(0, 7) === thisMonth);
        const before = rows.filter((p) => p.date.slice(0, 7) === lastMonth);
        const total = sum(rows);
        const byMethod = new Map<string, number>();
        for (const p of rows) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
        const top = [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0];
        const open = rows.filter((p) => leftover(p) > 0);
        const loose = open.reduce((s, p) => s + leftover(p), 0);
        return [
          { key: "month", label: "Received this month", color: "#10B981", value: formatMoney(sum(now)), note: change(sum(now), sum(before)), hint: "Customer payments dated this calendar month." },
          { key: "last", label: "Last month", color: "#0EA5E9", value: formatMoney(sum(before)), note: `${before.length} payment${before.length === 1 ? "" : "s"}`, hint: "Customer payments dated last calendar month." },
          { key: "avg", label: "Average payment", color: "#8B5CF6", value: rows.length ? formatMoney(Math.round(total / rows.length)) : "—", note: `${rows.length} payment${rows.length === 1 ? "" : "s"} · ${formatMoney(total)} in all`, hint: "What a typical customer payment is worth." },
          {
            key: "method",
            label: "Most used method",
            color: "#14B8A6",
            value: top ? METHODS[top[0]] ?? top[0] : "—",
            note: top && total ? `${Math.round((top[1] / total) * 100)}% of the money` : "No payments yet",
            hint: "How most of your money arrives, by amount.",
          },
          {
            key: "leftover",
            label: "Not matched yet",
            color: "#F59E0B",
            status: "unmatched",
            value: formatMoney(loose),
            note: open.length ? `${open.length} payment${open.length === 1 ? "" : "s"} with money left over` : "Everything is matched",
            hint: "Money customers paid that isn't put toward any invoice yet. Match it so their balance is right.",
          },
        ];
      },
      preview: (p) => (
        <DocumentPreview
          number={p.paymentNumber}
          status={statusOf(p)}
          statusOptions={STATUSES}
          party={p.contact?.name}
          partySub={p.contact?.email}
          amount={p.amount}
          amountLabel="received"
          currency={p.currencyCode}
          facts={[
            { label: "Date", value: formatDay(p.date) },
            { label: "Method", value: METHODS[p.method] ?? p.method },
            { label: "Put toward invoices", value: formatMoney(allocated(p), p.currencyCode) },
            { label: "Leftover", value: formatMoney(leftover(p), p.currencyCode) },
            { label: "Reference", value: p.reference || "—" },
            { label: "Came in via", value: p.stripePaymentIntentId ? "Online (Stripe)" : "Recorded by hand" },
          ]}
          actions={
            leftover(p) > 0 ? (
              <ActionButton primary icon={<ArrowRightLeft className="size-3.5" />} run={async () => router.push(`/sales/payments/${p.id}`)}>
                Match leftover to an invoice
              </ActionButton>
            ) : undefined
          }
        >
          <PaymentDetails payment={p} />
        </DocumentPreview>
      ),
      empty: <PaymentsEmpty />,
    }),
    [router]
  );

  return <Explorer config={config} />;
}

/** Where the money landed and which invoices it paid, resolved from the payment and invoice APIs. */
function PaymentDetails({ payment }: { payment: Payment }) {
  const { data: detail, loading } = useApi<{ payment?: { bankAccount?: { accountName: string; bankName: string | null } | null } }>(`/api/v1/payments/${payment.id}`);
  const bankAccount = detail?.payment?.bankAccount;
  const bank = bankAccount ? [bankAccount.accountName, bankAccount.bankName].filter(Boolean).join(" · ") : null;

  const money = (c: number) => formatMoney(c, payment.currencyCode);
  const allocations = payment.allocations ?? [];
  const rest = leftover(payment);

  return (
    <>
      <div className="mt-6">
        <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Paid into</p>
        <div className="flex items-center gap-3 rounded-xl border border-border/80 px-3 py-2.5 text-[13px]">
          <span className="flex size-7 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/70">
            <Landmark className="size-3.5" />
          </span>
          {loading ? <Skeleton className="h-4 w-40" /> : <span className="min-w-0 flex-1 truncate font-medium">{bank ?? "No bank account chosen"}</span>}
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">What it paid</p>
        <div className="divide-y divide-border/60 rounded-xl border border-border/80">
          {allocations.map((a) => (
            <AllocationRow key={a.id} allocation={a} money={money} />
          ))}
          {rest > 0 && (
            <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              <span className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <Banknote className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1 text-muted-foreground">Not put toward anything yet</span>
              <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{money(rest)}</span>
            </div>
          )}
        </div>
      </div>

      {payment.notes && (
        <div className="mt-5">
          <p className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">Notes</p>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/85">{payment.notes}</p>
        </div>
      )}
    </>
  );
}

/** One invoice or credit note a payment went toward, with its number resolved from the document API. */
function AllocationRow({ allocation: a, money }: { allocation: Allocation; money: (c: number) => string }) {
  const isInvoice = a.documentType === "invoice";
  const isCreditNote = a.documentType === "credit_note";
  const { data, loading } = useApi<{ invoice?: { invoiceNumber?: string }; creditNote?: { creditNoteNumber?: string } }>(
    isInvoice ? `/api/v1/invoices/${a.documentId}` : isCreditNote ? `/api/v1/credit-notes/${a.documentId}` : null
  );
  const number = isInvoice ? data?.invoice?.invoiceNumber : isCreditNote ? data?.creditNote?.creditNoteNumber : undefined;
  const href = isInvoice ? `/sales/${a.documentId}` : isCreditNote ? `/sales/credit-notes/${a.documentId}` : null;
  const label = number || (isInvoice ? "Invoice" : isCreditNote ? "Credit note" : a.documentType);
  const row = (
    <>
      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
        <FileText className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        {loading ? <Skeleton className="h-4 w-24" /> : <span className="block truncate font-mono text-[12.5px] font-medium">{label}</span>}
      </span>
      <span className="font-medium tabular-nums">{money(a.amount)}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-center gap-3 px-3 py-2.5 text-[13px] transition-colors hover:bg-foreground/[0.025]">
      {row}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
      {row}
    </div>
  );
}

function PaymentsEmpty() {
  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-8" asChild>
          <Link href="/sales"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">Payments received against your invoices.</p>
        </div>
      </div>
      <EmptyState
        icon={Banknote}
        title="No payments recorded"
        description="Payments will appear here when you record them against invoices."
      />
    </ContentReveal>
  );
}
