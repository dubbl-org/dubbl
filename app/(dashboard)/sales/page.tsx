"use client";

import { useMemo } from "react";
import { Plus, Send, CheckCircle2, Banknote } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Invoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  invoiceType: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currencyCode: string;
  dunningLevel: number;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

interface Payment {
  id: string;
  paymentNumber: string;
  date: string;
  amount: number;
  method: string;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not sent to the customer yet" },
  { value: "pending_approval", label: "Awaiting approval", color: "#6366F1", hint: "Waiting for someone on your team to approve it" },
  { value: "sent", label: "Sent", color: "#0EA5E9", hint: "Sent and not due yet" },
  { value: "partial", label: "Part paid", color: "#F59E0B", hint: "The customer paid some of it" },
  { value: "overdue", label: "Overdue", color: "#EF4444", hint: "Past its due date and not fully paid" },
  { value: "paid", label: "Paid", color: "#10B981", hint: "Fully paid" },
  { value: "rejected", label: "Rejected", color: "#F97316", hint: "Sent back during approval" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

const OPEN = new Set(["sent", "partial", "overdue"]);
const METHODS: Record<string, string> = { bank_transfer: "Bank transfer", cash: "Cash", check: "Check", card: "Card", other: "Other" };

/** Treat anything unpaid past its due date as overdue, whatever was last saved. */
function statusOf(inv: Invoice) {
  if ((inv.status === "sent" || inv.status === "partial") && inv.amountDue > 0) {
    const d = daysUntil(inv.dueDate);
    if (d != null && d < 0) return "overdue";
  }
  return inv.status;
}

const isOpen = (inv: Invoice) => OPEN.has(statusOf(inv)) && inv.amountDue > 0;

async function bulk(action: "send-reminder" | "mark-as-sent", ids: string[], helpers: ExplorerHelpers) {
  const data = await postJson<{ summary?: { sent: number; skipped: number; failed: number } }>("/api/v1/invoices/bulk", { action, invoiceIds: ids });
  const s = data.summary ?? { sent: 0, skipped: 0, failed: 0 };
  const word = action === "send-reminder" ? "reminder" : "invoice";
  const parts = [s.sent && `${s.sent} ${word}${s.sent === 1 ? "" : "s"} sent`, s.skipped && `${s.skipped} skipped`, s.failed && `${s.failed} failed`].filter(Boolean);
  (s.failed ? toast.error : toast.success)(parts.join(", ") || "Nothing to do");
  helpers.clearSelection();
  if (s.sent) helpers.refresh();
}

function sumDue(rows: Invoice[]) {
  return rows.reduce((s, i) => s + i.amountDue, 0);
}

export default function InvoicesPage() {
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Sales · Invoices");

  const config = useMemo<ExplorerConfig<Invoice>>(
    () => ({
      id: "invoices",
      endpoint: "/api/v1/invoices",
      noun: { one: "Invoice", many: "Invoices" },
      getId: (i) => i.id,
      href: (i) => `/sales/${i.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (i) => i.issueDate, label: "Issue date" },
      party: { get: (i) => i.contact?.name, label: "Customer", many: "Customers" },
      amount: (i) => i.total,
      amountLabel: "Invoiced",
      currency: (i) => i.currencyCode,
      search: (i) => [i.invoiceNumber, i.contact?.name, i.contact?.email, i.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [
        { key: "type", label: "Type", value: (i) => (i.invoiceType === "standard" ? "Standard" : i.invoiceType === "deposit" ? "Deposit" : "Retainer") },
        { key: "currency", label: "Currency", value: (i) => i.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (i) => i.invoiceNumber, render: (i) => <NumberCell value={i.invoiceNumber} /> },
        { key: "customer", label: "Customer", value: (i) => i.contact?.name, render: (i) => <PartyCell name={i.contact?.name} /> },
        { key: "issued", label: "Issued", className: "w-32", value: (i) => i.issueDate, render: (i) => <DateCell value={i.issueDate} /> },
        { key: "due", label: "Due", className: "w-44", value: (i) => i.dueDate, render: (i) => <DueCell value={i.dueDate} open={isOpen(i)} /> },
        { key: "status", label: "Status", className: "w-36", value: statusOf, render: (i) => <StatusPill value={statusOf(i)} options={STATUSES} /> },
        { key: "type", label: "Type", className: "w-28", hidden: true, value: (i) => i.invoiceType },
        { key: "reference", label: "Reference", hidden: true, value: (i) => i.reference, render: (i) => <MutedCell value={i.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (i) => i.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (i) => i.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (i) => i.total, render: (i) => <MoneyCell cents={i.total} currency={i.currencyCode} /> },
        { key: "paid", label: "Paid", align: "right", className: "w-32", money: true, value: (i) => i.amountPaid, render: (i) => <MoneyCell cents={i.amountPaid} currency={i.currencyCode} className={i.amountPaid > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined} /> },
        {
          key: "balance",
          label: "Still owed",
          align: "right",
          className: "w-32",
          money: true,
          hint: "What the customer still has to pay",
          value: (i) => (i.status === "void" ? 0 : i.amountDue),
          render: (i) => (
            <MoneyCell
              cents={i.status === "void" ? 0 : i.amountDue}
              currency={i.currencyCode}
              className={statusOf(i) === "overdue" ? "font-semibold text-red-600 dark:text-red-400" : isOpen(i) ? "font-medium" : undefined}
            />
          ),
        },
        { key: "reminders", label: "Reminders", align: "right", className: "w-28", hidden: true, hint: "How many payment reminders have gone out", value: (i) => i.dunningLevel },
        { key: "sent", label: "Sent on", className: "w-32", hidden: true, value: (i) => i.sentAt, render: (i) => <DateCell value={i.sentAt} /> },
        { key: "paidOn", label: "Paid on", className: "w-32", hidden: true, value: (i) => i.paidAt, render: (i) => <DateCell value={i.paidAt} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (i) => i.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (i) => i.createdAt, render: (i) => <DateCell value={i.createdAt} /> },
      ],
      metrics: (rows) => {
        const open = rows.filter(isOpen);
        const late = open.filter((i) => statusOf(i) === "overdue");
        const soon = open.filter((i) => {
          const d = daysUntil(i.dueDate);
          return d != null && d >= 0 && d <= 30;
        });
        const lateDays = late.map((i) => -(daysUntil(i.dueDate) ?? 0));
        const avgLate = lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
        const collected = rows.reduce((s, i) => s + (i.status === "void" ? 0 : i.amountPaid), 0);
        const billed = rows.reduce((s, i) => s + (i.status === "void" || i.status === "draft" ? 0 : i.total), 0);
        const drafts = rows.filter((i) => i.status === "draft");
        return [
          { key: "owed", label: "Customers owe you", color: "#F59E0B", value: formatMoney(sumDue(open)), note: `${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`, hint: "Everything sent that hasn't been fully paid yet." },
          { key: "late", label: "Overdue", color: "#EF4444", status: "overdue", value: formatMoney(sumDue(late)), note: late.length ? `${late.length} late · ${avgLate} days on average` : "Nothing is late", hint: "Unpaid invoices past their due date. Chase these first." },
          { key: "soon", label: "Due in 30 days", color: "#0EA5E9", value: formatMoney(sumDue(soon)), note: `${soon.length} invoice${soon.length === 1 ? "" : "s"} coming due`, hint: "Money you should receive in the next month if customers pay on time." },
          { key: "collected", label: "Collected", color: "#10B981", status: "paid", value: formatMoney(collected), note: billed ? `${Math.round((collected / billed) * 100)}% of what you billed` : "Nothing billed yet", hint: "Payments received against these invoices." },
          { key: "billed", label: "Billed", color: "#8B5CF6", value: formatMoney(billed), note: `${rows.length - drafts.length} sent invoices`, hint: "The total of every invoice you've sent, paid or not." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(drafts.reduce((s, i) => s + i.total, 0)), hint: "Invoices you started but haven't sent." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const remindable = selected.filter(isOpen);
        const drafts = selected.filter((i) => i.status === "draft");
        return (
          <>
            <ActionButton icon={<Send className="size-3.5" />} run={() => bulk("send-reminder", remindable.map((i) => i.id), helpers)} className={remindable.length ? undefined : "pointer-events-none opacity-40"}>
              Send reminder{remindable.length ? ` (${remindable.length})` : ""}
            </ActionButton>
            <ActionButton icon={<CheckCircle2 className="size-3.5" />} run={() => bulk("mark-as-sent", drafts.map((i) => i.id), helpers)} className={drafts.length ? undefined : "pointer-events-none opacity-40"}>
              Mark as sent{drafts.length ? ` (${drafts.length})` : ""}
            </ActionButton>
          </>
        );
      },
      preview: (inv, helpers) => (
        <DocumentPreview
          url={`/api/v1/invoices/${inv.id}`}
          pick={(json) => {
            const doc = json.invoice as (Invoice & { lines?: never[]; notes?: string | null }) | undefined;
            const payments = (json.payments as Payment[] | undefined) ?? [];
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
                { label: "Paid", cents: doc?.amountPaid, tone: "#059669" },
                { label: "Still owed", cents: doc?.amountDue, strong: true },
              ],
              extra: payments.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">Payments received</p>
                  <div className="divide-y divide-border/60 rounded-xl border border-border/80">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <Banknote className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{formatDay(p.date)}</span>
                          <span className="block text-[12px] text-muted-foreground">{p.paymentNumber} · {METHODS[p.method] ?? p.method}</span>
                        </span>
                        <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(p.amount, inv.currencyCode)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ),
            };
          }}
          number={inv.invoiceNumber}
          status={statusOf(inv)}
          statusOptions={STATUSES}
          party={inv.contact?.name}
          partySub={inv.contact?.email}
          amount={inv.status === "void" ? inv.total : inv.amountDue > 0 ? inv.amountDue : inv.total}
          amountLabel={inv.amountDue > 0 && inv.status !== "void" ? "still owed" : "total"}
          currency={inv.currencyCode}
          facts={[
            { label: "Issued", value: formatDay(inv.issueDate) },
            { label: "Due", value: <DueCell value={inv.dueDate} open={isOpen(inv)} /> },
            { label: "Total", value: formatMoney(inv.total, inv.currencyCode) },
            { label: "Paid so far", value: formatMoney(inv.amountPaid, inv.currencyCode) },
            { label: "Reminders sent", value: inv.dunningLevel },
            { label: "Reference", value: inv.reference || "—" },
          ]}
          actions={
            <>
              {isOpen(inv) && (
                <ActionButton primary icon={<Send className="size-3.5" />} run={() => bulk("send-reminder", [inv.id], helpers)}>
                  Send reminder
                </ActionButton>
              )}
              {inv.status === "draft" && (
                <ActionButton primary icon={<CheckCircle2 className="size-3.5" />} run={() => bulk("mark-as-sent", [inv.id], helpers)}>
                  Mark as sent
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <InvoicesEmpty onCreate={() => openDrawer("invoice")} />,
    }),
    [openDrawer]
  );

  return <Explorer config={config} />;
}

function InvoicesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="flex flex-col items-center gap-10 pt-16 pb-12">
        {/* Invoice lifecycle stepper */}
        <div className="w-full max-w-xl">
          <div className="grid grid-cols-3 gap-0">
            {[
              { step: "1", label: "Create", sub: "Draft your invoice with line items and pricing", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
              { step: "2", label: "Send", sub: "Email it directly to your customer", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
              { step: "3", label: "Get paid", sub: "Track payments and outstanding balances", color: "bg-brand-500", ring: "ring-brand-200 dark:ring-brand-900" },
            ].map(({ step, label, sub, color, ring }, i) => (
              <div key={step} className="flex flex-col items-center text-center relative">
                {i < 2 && (
                  <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                )}
                <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>
                  {step}
                </div>
                <p className="mt-3 text-sm font-medium">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight">Start getting paid</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Create your first invoice to begin tracking revenue.</p>
          <Button
            onClick={onCreate}
            size="lg"
            className="mt-5 bg-brand-600 hover:bg-brand-700"
          >
            <Plus className="mr-2 size-4" />
            New Invoice
          </Button>
        </div>

        {/* Preview stat cards (empty) */}
        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
          {[
            { label: "Outstanding", value: "$0.00" },
            { label: "Overdue", value: "$0.00" },
            { label: "Paid this month", value: "$0.00" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-dashed p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </ContentReveal>
  );
}
