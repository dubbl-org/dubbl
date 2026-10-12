"use client";

import { useMemo } from "react";
import { Plus, Banknote, ReceiptText, CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface SalesReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  currencyCode: string;
  bankAccountId: string | null;
  depositAccountId: string | null;
  voidedAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

interface ReceiptDetail extends SalesReceipt {
  lines?: never[];
  notes?: string | null;
  bankAccount?: { accountName: string; bankName: string | null } | null;
  depositAccount?: { name: string; code: string } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Saved but not recorded in your books yet" },
  { value: "paid", label: "Paid", color: "#10B981", hint: "Paid on the spot and recorded" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

function monthKeys() {
  const now = new Date();
  return {
    thisMonth: toDayKey(now).slice(0, 7),
    lastMonth: toDayKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7),
  };
}

function sum(rows: SalesReceipt[]) {
  return rows.reduce((s, r) => s + r.total, 0);
}

function change(now: number, before: number) {
  if (!before) return now ? "Nothing last month" : "Same as last month";
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? "Same as last month" : `${pct > 0 ? "+" : ""}${pct}% vs last month`;
}

export default function SalesReceiptsPage() {
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Cash Sales");
  const { confirm, dialog } = useConfirm();

  const config = useMemo<ExplorerConfig<SalesReceipt>>(
    () => ({
      id: "sales-receipts",
      endpoint: "/api/v1/sales-receipts",
      noun: { one: "Cash sale", many: "Cash sales" },
      getId: (r) => r.id,
      href: (r) => `/sales/receipts/${r.id}`,
      status: { get: (r) => r.status, options: STATUSES },
      date: { get: (r) => r.date, label: "Sale date" },
      party: { get: (r) => r.contact?.name, label: "Customer", many: "Customers" },
      amount: (r) => r.total,
      amountLabel: "Taken",
      currency: (r) => r.currencyCode,
      search: (r) => [r.receiptNumber, r.contact?.name, r.contact?.email, r.reference],
      defaultSort: { key: "date", dir: "desc" },
      facets: [
        { key: "paidInto", label: "Paid into", value: (r) => (r.bankAccountId ? "Bank account" : r.depositAccountId ? "Other account" : "Undeposited funds") },
        { key: "currency", label: "Currency", value: (r) => r.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (r) => r.receiptNumber, render: (r) => <NumberCell value={r.receiptNumber} /> },
        { key: "customer", label: "Customer", value: (r) => r.contact?.name, render: (r) => <PartyCell name={r.contact?.name} /> },
        { key: "date", label: "Date", className: "w-32", value: (r) => r.date, render: (r) => <DateCell value={r.date} /> },
        { key: "status", label: "Status", className: "w-32", value: (r) => r.status, render: (r) => <StatusPill value={r.status} options={STATUSES} /> },
        { key: "reference", label: "Reference", value: (r) => r.reference, render: (r) => <MutedCell value={r.reference} /> },
        {
          key: "paidInto",
          label: "Paid into",
          className: "w-36",
          hidden: true,
          hint: "Where the money went. Open the sale to see the exact account",
          value: (r) => (r.bankAccountId ? "Bank account" : r.depositAccountId ? "Other account" : "Undeposited funds"),
        },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (r) => r.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, value: (r) => r.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (r) => r.total, render: (r) => <MoneyCell cents={r.total} currency={r.currencyCode} className="font-medium" /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (r) => r.currencyCode },
        { key: "voided", label: "Cancelled on", className: "w-32", hidden: true, value: (r) => r.voidedAt, render: (r) => <DateCell value={r.voidedAt} /> },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (r) => r.createdAt, render: (r) => <DateCell value={r.createdAt} /> },
      ],
      metrics: (rows) => {
        const { thisMonth, lastMonth } = monthKeys();
        const paid = rows.filter((r) => r.status === "paid");
        const now = sum(paid.filter((r) => r.date.slice(0, 7) === thisMonth));
        const before = sum(paid.filter((r) => r.date.slice(0, 7) === lastMonth));
        const total = sum(paid);
        const tax = paid.reduce((s, r) => s + r.taxTotal, 0);
        const drafts = rows.filter((r) => r.status === "draft");
        return [
          { key: "month", label: "Taken this month", color: "#10B981", value: formatMoney(now), note: change(now, before), hint: "Cash sales paid this calendar month." },
          { key: "last", label: "Last month", color: "#0EA5E9", value: formatMoney(before), note: `${paid.filter((r) => r.date.slice(0, 7) === lastMonth).length} sales`, hint: "Cash sales paid last calendar month." },
          { key: "avg", label: "Average sale", color: "#8B5CF6", value: paid.length ? formatMoney(Math.round(total / paid.length)) : "—", note: `Across ${paid.length} paid sale${paid.length === 1 ? "" : "s"}`, hint: "What a typical cash sale is worth." },
          { key: "total", label: "Total taken", color: "#14B8A6", status: "paid", value: formatMoney(total), note: `${formatMoney(tax)} of it is tax`, hint: "Every paid cash sale, including the tax you collected." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(sum(drafts)), hint: "Cash sales you saved but haven't recorded yet." },
        ];
      },
      preview: (r, helpers) => (
        <DocumentPreview
          url={`/api/v1/sales-receipts/${r.id}`}
          pick={(json) => {
            const doc = json.salesReceipt as ReceiptDetail | undefined;
            const into = doc?.bankAccount
              ? [doc.bankAccount.accountName, doc.bankAccount.bankName].filter(Boolean).join(" · ")
              : doc?.depositAccount
                ? `${doc.depositAccount.code} · ${doc.depositAccount.name}`
                : "Undeposited funds";
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
              ],
              extra: doc && (
                <div className="mt-6">
                  <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Paid into</p>
                  <div className="flex items-center gap-3 rounded-xl border border-border/80 px-3 py-2.5 text-[13px]">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                      <Banknote className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{into}</span>
                    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(doc.total, r.currencyCode)}</span>
                  </div>
                </div>
              ),
            };
          }}
          number={r.receiptNumber}
          status={r.status}
          statusOptions={STATUSES}
          party={r.contact?.name}
          partySub={r.contact?.email}
          amount={r.total}
          currency={r.currencyCode}
          facts={[
            { label: "Date", value: formatDay(r.date) },
            { label: "Status", value: STATUSES.find((s) => s.value === r.status)?.label ?? r.status },
            { label: "Before tax", value: formatMoney(r.subtotal, r.currencyCode) },
            { label: "Tax", value: formatMoney(r.taxTotal, r.currencyCode) },
            { label: "Reference", value: r.reference || "—" },
            { label: "Currency", value: r.currencyCode },
          ]}
          actions={
            r.status === "void" ? undefined : (
              <>
                {r.status === "draft" && (
                  <ActionButton
                    primary
                    icon={<CheckCircle2 className="size-3.5" />}
                    success="Sale recorded in your books"
                    run={async () => {
                      await postJson(`/api/v1/sales-receipts/${r.id}/post`);
                      helpers.refresh();
                    }}
                  >
                    Record sale
                  </ActionButton>
                )}
                <ActionButton
                  icon={<Ban className="size-3.5" />}
                  success="Sale cancelled"
                  run={async () => {
                    const ok = await confirm({
                      title: `Cancel ${r.receiptNumber}?`,
                      description: r.status === "paid" ? "The sale stops counting and its entries are reversed in your books." : "The draft is kept for your records but won't count.",
                      confirmLabel: "Cancel sale",
                      cancelLabel: "Keep it",
                      destructive: true,
                    });
                    if (!ok) return false;
                    await postJson(`/api/v1/sales-receipts/${r.id}/void`);
                    helpers.refresh();
                  }}
                >
                  Cancel sale
                </ActionButton>
              </>
            )
          }
        />
      ),
      empty: <ReceiptsEmpty onCreate={() => openDrawer("salesReceipt")} />,
    }),
    [confirm, openDrawer]
  );

  return (
    <>
      <Explorer config={config} />
      {dialog}
    </>
  );
}

function ReceiptsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Cash Sales</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Record over-the-counter sales that are paid for on the spot — no invoice, no waiting for payment.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New cash sale
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: how it works */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a cash sale works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <ReceiptText className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Sale total</p>
                    <p className="text-[11px] text-muted-foreground">SR-0001</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium">$45.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5 bg-brand-50/30 dark:bg-brand-950/10">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 dark:bg-brand-950/40">
                    <Banknote className="size-3.5 text-brand-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-700 dark:text-brand-300">Paid into</p>
                    <p className="text-[11px] text-muted-foreground">Cash drawer</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">+$45.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Nothing owed</p>
                </div>
                <span className="font-mono text-sm font-bold">$0.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Counter or till sale", desc: "A walk-in customer buys something and pays right away — cash or card.", color: "border-l-brand-400" },
              { title: "Market or pop-up stall", desc: "Selling at an event? Log each sale as it's paid for, with the money landing in your till.", color: "border-l-blue-400" },
              { title: "On-the-spot service", desc: "Completed a job and got paid immediately? Record it without raising an invoice.", color: "border-l-amber-400" },
              { title: "No invoice needed", desc: "Use an invoice instead when the customer pays you later.", color: "border-l-purple-400" },
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
