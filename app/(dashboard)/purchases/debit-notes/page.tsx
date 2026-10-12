"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, CreditCard, ReceiptText, FileText, Send, ArrowDownRight } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface DebitNote {
  id: string;
  debitNoteNumber: string;
  billId: string | null;
  issueDate: string;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountApplied: number;
  amountRemaining: number;
  currencyCode: string;
  sentAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not recorded with the supplier yet, so it can't be used" },
  { value: "sent", label: "Available", color: "#0EA5E9", hint: "Recorded and still has credit you can use against a bill" },
  { value: "applied", label: "Used", color: "#8B5CF6", hint: "All of the credit has been used against bills" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

const live = (d: DebitNote) => d.status !== "void";
const usable = (d: DebitNote) => d.status === "sent" && d.amountRemaining > 0;

export default function DebitNotesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Purchases · Supplier Credits");

  const config = useMemo<ExplorerConfig<DebitNote>>(
    () => ({
      id: "debit-notes",
      endpoint: "/api/v1/debit-notes",
      noun: { one: "Supplier credit", many: "Supplier credits" },
      getId: (d) => d.id,
      href: (d) => `/purchases/debit-notes/${d.id}`,
      status: { get: (d) => d.status, options: STATUSES },
      date: { get: (d) => d.issueDate, label: "Credit date" },
      party: { get: (d) => d.contact?.name, label: "Supplier", many: "Suppliers" },
      amount: (d) => d.total,
      amountLabel: "Credited",
      currency: (d) => d.currencyCode,
      search: (d) => [d.debitNoteNumber, d.contact?.name, d.contact?.email, d.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [
        { key: "source", label: "Source", value: (d) => (d.billId ? "From a bill" : "Standalone") },
        { key: "currency", label: "Currency", value: (d) => d.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (d) => d.debitNoteNumber, render: (d) => <NumberCell value={d.debitNoteNumber} /> },
        { key: "supplier", label: "Supplier", value: (d) => d.contact?.name, render: (d) => <PartyCell name={d.contact?.name} /> },
        { key: "issued", label: "Credit date", className: "w-32", value: (d) => d.issueDate, render: (d) => <DateCell value={d.issueDate} /> },
        { key: "status", label: "Status", className: "w-32", value: (d) => d.status, render: (d) => <StatusPill value={d.status} options={STATUSES} /> },
        { key: "reference", label: "Reference", hint: "Usually the bill this credit came from", value: (d) => d.reference, render: (d) => <MutedCell value={d.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (d) => d.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (d) => d.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (d) => d.total, render: (d) => <MoneyCell cents={d.total} currency={d.currencyCode} /> },
        {
          key: "used",
          label: "Used",
          align: "right",
          className: "w-32",
          money: true,
          hint: "How much has already come off your bills",
          value: (d) => (live(d) ? d.amountApplied : 0),
          render: (d) => <MoneyCell cents={live(d) ? d.amountApplied : 0} currency={d.currencyCode} />,
        },
        {
          key: "remaining",
          label: "Left to use",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Credit you can still take off a bill from this supplier",
          value: (d) => (live(d) ? d.amountRemaining : 0),
          render: (d) => (
            <MoneyCell cents={live(d) ? d.amountRemaining : 0} currency={d.currencyCode} className={usable(d) ? "font-semibold text-emerald-600 dark:text-emerald-400" : undefined} />
          ),
        },
        { key: "linked", label: "From a bill", className: "w-28", hidden: true, value: (d) => (d.billId ? "Yes" : "No") },
        { key: "sent", label: "Recorded on", className: "w-32", hidden: true, value: (d) => d.sentAt, render: (d) => <DateCell value={d.sentAt} /> },
        { key: "voided", label: "Cancelled on", className: "w-32", hidden: true, value: (d) => d.voidedAt, render: (d) => <DateCell value={d.voidedAt} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (d) => d.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (d) => d.createdAt, render: (d) => <DateCell value={d.createdAt} /> },
      ],
      metrics: (rows) => {
        const valid = rows.filter(live);
        const issued = valid.reduce((s, d) => s + d.total, 0);
        const used = valid.reduce((s, d) => s + d.amountApplied, 0);
        const available = rows.filter(usable);
        const suppliers = new Set(available.map((d) => d.contact?.name).filter(Boolean)).size;
        const drafts = rows.filter((d) => d.status === "draft");
        const usedUp = rows.filter((d) => d.status === "applied");
        return [
          { key: "available", label: "Credit to use", color: "#10B981", status: "sent", value: formatMoney(available.reduce((s, d) => s + d.amountRemaining, 0)), note: available.length ? `${available.length} credit${available.length === 1 ? "" : "s"} from ${suppliers} supplier${suppliers === 1 ? "" : "s"}` : "Nothing waiting to be used", hint: "Money suppliers owe you back. Take it off their next bill instead of paying in full." },
          { key: "used", label: "Already used", color: "#8B5CF6", value: formatMoney(used), note: issued ? `${Math.round((used / issued) * 100)}% of all credit` : "No credit yet", hint: "Credit that has already come off your bills." },
          { key: "issued", label: "Total credited", color: "#0EA5E9", value: formatMoney(issued), note: `${valid.length} credit${valid.length === 1 ? "" : "s"}, not counting cancelled`, hint: "Everything suppliers have credited you, used or not." },
          { key: "usedUp", label: "Fully used", color: "#6366F1", status: "applied", value: usedUp.length.toString(), note: formatMoney(usedUp.reduce((s, d) => s + d.total, 0)), hint: "Credits with nothing left on them." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(drafts.reduce((s, d) => s + d.total, 0)), hint: "Credits you started but haven't recorded yet, so they can't be used." },
        ];
      },
      preview: (d) => (
        <DocumentPreview
          url={`/api/v1/debit-notes/${d.id}`}
          pick={(json) => {
            const doc = json.debitNote as (DebitNote & { lines?: never[]; notes?: string | null }) | undefined;
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total credit", cents: doc?.total, strong: true },
                { label: "Used", cents: doc?.amountApplied, tone: "#7C3AED" },
                { label: "Left to use", cents: doc?.status === "void" ? 0 : doc?.amountRemaining, strong: true },
              ],
            };
          }}
          number={d.debitNoteNumber}
          status={d.status}
          statusOptions={STATUSES}
          party={d.contact?.name}
          partySub={d.contact?.email}
          amount={usable(d) ? d.amountRemaining : d.total}
          amountLabel={usable(d) ? "left to use" : "total"}
          currency={d.currencyCode}
          facts={[
            { label: "Credit date", value: formatDay(d.issueDate) },
            { label: "Recorded on", value: formatDay(d.sentAt) },
            { label: "Total credit", value: formatMoney(d.total, d.currencyCode) },
            { label: "Used so far", value: formatMoney(d.amountApplied, d.currencyCode) },
            { label: "Reference", value: d.reference || "—" },
            { label: "Currency", value: d.currencyCode },
          ]}
          actions={
            <>
              {d.status === "draft" && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={async () => router.push(`/purchases/debit-notes/${d.id}`)}>
                  Review and send
                </ActionButton>
              )}
              {usable(d) && (
                <ActionButton primary icon={<ArrowDownRight className="size-3.5" />} run={async () => router.push(`/purchases/debit-notes/${d.id}`)}>
                  Use against a bill
                </ActionButton>
              )}
              {d.billId && (
                <ActionButton icon={<FileText className="size-3.5" />} run={async () => router.push(`/purchases/${d.billId}`)}>
                  View original bill
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <DebitNotesEmpty onCreate={() => openDrawer("debitNote")} />,
    }),
    [openDrawer, router]
  );

  return <Explorer config={config} />;
}

function DebitNotesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="pt-12 pb-12 space-y-10">
        {/* Top: title + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Supplier Credits</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              A supplier credit is money a supplier owes you back — a reduction on what you owe them. Use it against a bill instead of paying full price.
            </p>
          </div>
          <Button onClick={onCreate} className="bg-brand-600 hover:bg-brand-700 shrink-0">
            <Plus className="mr-2 size-4" />
            New supplier credit
          </Button>
        </div>

        <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
          {/* Left: Ledger-style calculation */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">How a supplier credit works</p>
            </div>
            <div className="divide-y">
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950/40">
                    <ReceiptText className="size-3.5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Bill total</p>
                    <p className="text-[11px] text-muted-foreground">BILL-0042</p>
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
                    <p className="text-[11px] text-muted-foreground">DN-0001</p>
                  </div>
                </div>
                <span className="font-mono text-sm font-medium text-brand-600 dark:text-brand-400">-$200.00</span>
              </div>
              <div className="flex items-center justify-between px-3 sm:px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="size-7" />
                  <p className="text-sm font-semibold">Now owed to supplier</p>
                </div>
                <span className="font-mono text-sm font-bold">$1,000.00</span>
              </div>
            </div>
          </div>

          {/* Right: Use cases */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">When to use</p>
            {[
              { title: "Supplier overcharged you", desc: "Billed too much by a supplier? Record a credit to get the amount back.", color: "border-l-blue-400" },
              { title: "You returned goods", desc: "Sent stock back to a supplier? Record the credit and use it against a bill.", color: "border-l-amber-400" },
              { title: "Service not delivered", desc: "Paid for work that wasn't done? Record a partial or full credit from the supplier.", color: "border-l-brand-400" },
              { title: "Agreed discount", desc: "Supplier gave you a retroactive discount? Apply it against what you owe.", color: "border-l-purple-400" },
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
