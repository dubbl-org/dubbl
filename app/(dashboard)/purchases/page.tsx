"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart, AlertTriangle, Clock, CheckCircle2, Check, ThumbsUp, X as XIcon, DollarSign, FileBarChart } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { decimalToMinorUnits, formatMoney, minorUnitsToDecimal } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, DueCell, MoneyCell, MutedCell, NumberCell, PartyCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Bill {
  id: string;
  billNumber: string;
  contactId: string;
  issueDate: string;
  dueDate: string;
  status: string;
  reference: string | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currencyCode: string;
  receivedAt: string | null;
  paidAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  contact: { name: string; email: string | null } | null;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not in your books yet. Add it once the details are right" },
  { value: "pending_approval", label: "Awaiting approval", color: "#6366F1", hint: "Waiting for someone on your team to approve it" },
  { value: "received", label: "To pay", color: "#0EA5E9", hint: "In your books and not due yet" },
  { value: "partial", label: "Part paid", color: "#F59E0B", hint: "You've paid some of it" },
  { value: "overdue", label: "Overdue", color: "#EF4444", hint: "Past its due date and not fully paid" },
  { value: "paid", label: "Paid", color: "#10B981", hint: "Fully paid" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

const OPEN = new Set(["received", "partial", "overdue"]);

/** Treat anything unpaid past its due date as overdue, whatever was last saved. */
function statusOf(b: Bill) {
  if ((b.status === "received" || b.status === "partial") && b.amountDue > 0) {
    const d = daysUntil(b.dueDate);
    if (d != null && d < 0) return "overdue";
  }
  return b.status;
}

const isOpen = (b: Bill) => OPEN.has(statusOf(b)) && b.amountDue > 0;

/** Aging bucket for unpaid bills, the same buckets the old overview showed. */
function ageOf(b: Bill) {
  if (!isOpen(b)) return null;
  const late = -(daysUntil(b.dueDate) ?? 0);
  if (late <= 0) return "Not due yet";
  if (late <= 30) return "1–30 days late";
  if (late <= 60) return "31–60 days late";
  return "60+ days late";
}

function sumDue(rows: Bill[]) {
  return rows.reduce((s, b) => s + b.amountDue, 0);
}

/** Run one action per bill, then report how many worked. */
async function runEach(items: Bill[], url: (b: Bill) => string, done: string, helpers: ExplorerHelpers) {
  let ok = 0;
  let failed = 0;
  for (const b of items) {
    try {
      await postJson(url(b));
      ok++;
    } catch {
      failed++;
    }
  }
  const parts = [ok && `${ok} bill${ok === 1 ? "" : "s"} ${done}`, failed && `${failed} failed`].filter(Boolean);
  (failed ? toast.error : toast.success)(parts.join(", ") || "Nothing to do");
  helpers.clearSelection();
  if (ok) helpers.refresh();
}

type Target = { bill: Bill; helpers: ExplorerHelpers };

export default function BillsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Purchases · Bills");

  const [paying, setPaying] = useState<Target | null>(null);
  const [rejecting, setRejecting] = useState<Target | null>(null);

  const config = useMemo<ExplorerConfig<Bill>>(
    () => ({
      id: "bills",
      endpoint: "/api/v1/bills",
      noun: { one: "Bill", many: "Bills" },
      getId: (b) => b.id,
      href: (b) => `/purchases/${b.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (b) => b.issueDate, label: "Bill date" },
      party: { get: (b) => b.contact?.name, label: "Supplier", many: "Suppliers" },
      amount: (b) => b.total,
      amountLabel: "Billed",
      currency: (b) => b.currencyCode,
      search: (b) => [b.billNumber, b.contact?.name, b.contact?.email, b.reference],
      defaultSort: { key: "issued", dir: "desc" },
      facets: [
        { key: "age", label: "Age", value: ageOf },
        { key: "currency", label: "Currency", value: (b) => b.currencyCode },
      ],
      columns: [
        { key: "number", label: "Number", className: "w-32", value: (b) => b.billNumber, render: (b) => <NumberCell value={b.billNumber} /> },
        { key: "supplier", label: "Supplier", value: (b) => b.contact?.name, render: (b) => <PartyCell name={b.contact?.name} /> },
        { key: "issued", label: "Bill date", className: "w-32", value: (b) => b.issueDate, render: (b) => <DateCell value={b.issueDate} /> },
        { key: "due", label: "Due", className: "w-44", value: (b) => b.dueDate, render: (b) => <DueCell value={b.dueDate} open={isOpen(b)} /> },
        { key: "status", label: "Status", className: "w-40", value: statusOf, render: (b) => <StatusPill value={statusOf(b)} options={STATUSES} /> },
        { key: "reference", label: "Reference", hidden: true, hint: "The supplier's own invoice number or your note", value: (b) => b.reference, render: (b) => <MutedCell value={b.reference} /> },
        { key: "subtotal", label: "Before tax", align: "right", className: "w-32", money: true, hidden: true, value: (b) => b.subtotal },
        { key: "tax", label: "Tax", align: "right", className: "w-28", money: true, hidden: true, value: (b) => b.taxTotal },
        { key: "total", label: "Total", align: "right", className: "w-32", money: true, value: (b) => b.total, render: (b) => <MoneyCell cents={b.total} currency={b.currencyCode} /> },
        { key: "paid", label: "Paid", align: "right", className: "w-32", money: true, value: (b) => b.amountPaid, render: (b) => <MoneyCell cents={b.amountPaid} currency={b.currencyCode} className={b.amountPaid > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined} /> },
        {
          key: "balance",
          label: "You owe",
          align: "right",
          className: "w-32",
          money: true,
          hint: "What you still have to pay this supplier",
          value: (b) => (b.status === "void" || b.status === "draft" ? 0 : b.amountDue),
          render: (b) => (
            <MoneyCell
              cents={b.status === "void" || b.status === "draft" ? 0 : b.amountDue}
              currency={b.currencyCode}
              className={statusOf(b) === "overdue" ? "font-semibold text-red-600 dark:text-red-400" : isOpen(b) ? "font-medium" : undefined}
            />
          ),
        },
        {
          key: "late",
          label: "Days late",
          align: "right",
          className: "w-28",
          hidden: true,
          hint: "How many days past the due date an unpaid bill is",
          value: (b) => (statusOf(b) === "overdue" ? -(daysUntil(b.dueDate) ?? 0) : null),
          render: (b) => (statusOf(b) === "overdue" ? <span className="tabular-nums text-red-600 dark:text-red-400">{-(daysUntil(b.dueDate) ?? 0)}</span> : <span className="text-muted-foreground/50">—</span>),
        },
        { key: "age", label: "Age", className: "w-36", hidden: true, hint: "Unpaid bills grouped by how late they are", value: ageOf, render: (b) => <MutedCell value={ageOf(b)} /> },
        { key: "approvedOn", label: "Approved on", className: "w-32", hidden: true, value: (b) => b.approvedAt, render: (b) => <DateCell value={b.approvedAt} /> },
        { key: "booked", label: "Added to books", className: "w-36", hidden: true, hint: "When the bill started counting toward what you owe", value: (b) => b.receivedAt, render: (b) => <DateCell value={b.receivedAt} /> },
        { key: "paidOn", label: "Paid on", className: "w-32", hidden: true, value: (b) => b.paidAt, render: (b) => <DateCell value={b.paidAt} /> },
        { key: "rejection", label: "Rejection reason", hidden: true, value: (b) => b.rejectionReason, render: (b) => <MutedCell value={b.rejectionReason} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (b) => b.currencyCode },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (b) => b.createdAt, render: (b) => <DateCell value={b.createdAt} /> },
      ],
      metrics: (rows) => {
        const open = rows.filter(isOpen);
        const late = open.filter((b) => statusOf(b) === "overdue");
        const dueIn = (b: Bill, max: number) => {
          const d = daysUntil(b.dueDate);
          return d != null && d >= 0 && d <= max;
        };
        const soon = open.filter((b) => dueIn(b, 30));
        const week = open.filter((b) => dueIn(b, 7));
        const lateDays = late.map((b) => -(daysUntil(b.dueDate) ?? 0));
        const avgLate = lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : 0;
        const paid = rows.reduce((s, b) => s + (b.status === "void" ? 0 : b.amountPaid), 0);
        const billed = rows.reduce((s, b) => s + (b.status === "void" || b.status === "draft" || b.status === "pending_approval" ? 0 : b.total), 0);
        const waiting = rows.filter((b) => b.status === "pending_approval");
        const drafts = rows.filter((b) => b.status === "draft");
        return [
          { key: "owe", label: "You owe suppliers", color: "#F59E0B", value: formatMoney(sumDue(open)), note: `${open.length} unpaid bill${open.length === 1 ? "" : "s"}`, hint: "Everything in your books that you haven't fully paid yet." },
          { key: "late", label: "Overdue", color: "#EF4444", status: "overdue", value: formatMoney(sumDue(late)), note: late.length ? `${late.length} late · ${avgLate} days on average` : "Nothing is late", hint: "Unpaid bills past their due date. Pay or talk to these suppliers first." },
          { key: "soon", label: "Due in 30 days", color: "#0EA5E9", value: formatMoney(sumDue(soon)), note: week.length ? `${formatMoney(sumDue(week))} of it this week` : `${soon.length} bill${soon.length === 1 ? "" : "s"} coming due`, hint: "Cash you'll need for bills falling due in the next month." },
          { key: "paid", label: "Paid", color: "#10B981", status: "paid", value: formatMoney(paid), note: billed ? `${Math.round((paid / billed) * 100)}% of what you were billed` : "Nothing billed yet", hint: "Payments you've made against these bills." },
          { key: "approval", label: "Awaiting approval", color: "#6366F1", status: "pending_approval", value: formatMoney(waiting.reduce((s, b) => s + b.total, 0)), note: `${waiting.length} bill${waiting.length === 1 ? "" : "s"} to review`, hint: "Bills someone needs to approve before they count toward what you owe." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(drafts.reduce((s, b) => s + b.total, 0)), hint: "Bills you started but haven't added to your books." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const waiting = selected.filter((b) => b.status === "pending_approval");
        const drafts = selected.filter((b) => b.status === "draft");
        return (
          <>
            <ActionButton icon={<ThumbsUp className="size-3.5" />} run={() => runEach(waiting, (b) => `/api/v1/bills/${b.id}/approve`, "approved", helpers)} className={waiting.length ? undefined : "pointer-events-none opacity-40"}>
              Approve{waiting.length ? ` (${waiting.length})` : ""}
            </ActionButton>
            <ActionButton icon={<Check className="size-3.5" />} run={() => runEach(drafts, (b) => `/api/v1/bills/${b.id}/receive`, "added to your books", helpers)} className={drafts.length ? undefined : "pointer-events-none opacity-40"}>
              Add to my books{drafts.length ? ` (${drafts.length})` : ""}
            </ActionButton>
          </>
        );
      },
      preview: (b, helpers) => (
        <DocumentPreview
          url={`/api/v1/bills/${b.id}`}
          pick={(json) => {
            const doc = json.bill as (Bill & { lines?: never[]; notes?: string | null }) | undefined;
            return {
              lines: doc?.lines,
              notes: doc?.notes,
              totals: [
                { label: "Before tax", cents: doc?.subtotal },
                { label: "Tax", cents: doc?.taxTotal },
                { label: "Total", cents: doc?.total, strong: true },
                { label: "Paid", cents: doc?.amountPaid, tone: "#059669" },
                { label: "You owe", cents: doc?.amountDue, strong: true },
              ],
              extra: doc?.rejectionReason && doc.status === "draft" && (
                <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-3 py-2.5 text-[13px]">
                  <p className="font-medium text-red-700 dark:text-red-400">Sent back during approval</p>
                  <p className="mt-0.5 text-foreground/80">{doc.rejectionReason}</p>
                </div>
              ),
            };
          }}
          number={b.billNumber}
          status={statusOf(b)}
          statusOptions={STATUSES}
          party={b.contact?.name}
          partySub={b.contact?.email}
          amount={isOpen(b) ? b.amountDue : b.total}
          amountLabel={isOpen(b) ? "you owe" : "total"}
          currency={b.currencyCode}
          facts={[
            { label: "Bill date", value: formatDay(b.issueDate) },
            { label: "Due", value: <DueCell value={b.dueDate} open={isOpen(b)} /> },
            { label: "Total", value: formatMoney(b.total, b.currencyCode) },
            { label: "Paid so far", value: formatMoney(b.amountPaid, b.currencyCode) },
            { label: "Paid on", value: formatDay(b.paidAt) },
            { label: "Reference", value: b.reference || "—" },
          ]}
          actions={
            <>
              {b.status === "pending_approval" && (
                <>
                  <ActionButton primary icon={<ThumbsUp className="size-3.5" />} success="Bill approved and added to your books" run={async () => { await postJson(`/api/v1/bills/${b.id}/approve`); helpers.refresh(); }}>
                    Approve
                  </ActionButton>
                  <ActionButton icon={<XIcon className="size-3.5" />} run={async () => setRejecting({ bill: b, helpers })}>
                    Reject
                  </ActionButton>
                </>
              )}
              {b.status === "draft" && (
                <ActionButton primary icon={<Check className="size-3.5" />} success="Bill added to your books" run={async () => { await postJson(`/api/v1/bills/${b.id}/receive`); helpers.refresh(); }}>
                  Add to my books
                </ActionButton>
              )}
              {isOpen(b) && (
                <ActionButton primary icon={<DollarSign className="size-3.5" />} run={async () => setPaying({ bill: b, helpers })}>
                  Record payment
                </ActionButton>
              )}
              <ActionButton icon={<FileBarChart className="size-3.5" />} run={async () => router.push(`/contacts/${b.contactId}/statement`)}>
                Supplier statement
              </ActionButton>
            </>
          }
        />
      ),
      empty: <BillsEmpty onCreate={() => openDrawer("bill")} />,
    }),
    [openDrawer, router]
  );

  return (
    <>
      <Explorer config={config} />
      <PayDialog target={paying} onClose={() => setPaying(null)} />
      <RejectDialog target={rejecting} onClose={() => setRejecting(null)} />
    </>
  );
}

function PayDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => toDayKey(new Date()));
  const [busy, setBusy] = useState(false);
  const bill = target?.bill;

  async function submit() {
    if (!target || !bill) return;
    const cents = amount ? decimalToMinorUnits(parseFloat(amount) || 0, bill.currencyCode) : bill.amountDue;
    if (!cents || cents <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      await postJson(`/api/v1/bills/${bill.id}/pay`, { amount: cents, date });
      toast.success("Payment recorded");
      target.helpers.refresh();
      setAmount("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setAmount(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          {bill && (
            <DialogDescription>
              {bill.billNumber} · {bill.contact?.name ?? "Supplier"} · {formatMoney(bill.amountDue, bill.currencyCode)} still owed
            </DialogDescription>
          )}
        </DialogHeader>
        {bill && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <CurrencyInput value={amount} onChange={setAmount} placeholder={minorUnitsToDecimal(bill.amountDue, bill.currencyCode)} />
              <p className="text-xs text-muted-foreground">Leave empty to pay the full amount.</p>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button onClick={submit} loading={busy} className="w-full bg-brand-600 hover:bg-brand-700">
              Record payment
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await postJson(`/api/v1/bills/${target.bill.id}/reject`, { reason: reason.trim() || undefined });
      toast.success("Bill rejected and sent back to draft");
      target.helpers.refresh();
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reject this bill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this bill?</DialogTitle>
          <DialogDescription>This sends the bill back to draft so it can be fixed and re-submitted. Add a reason so everyone knows why.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. amount doesn't match the order" />
          </div>
          <Button onClick={submit} loading={busy} className="w-full bg-red-600 hover:bg-red-700">
            Reject bill
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BillsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div className="relative">
        {/* Background skeleton table */}
        <div className="pointer-events-none w-full rounded-lg border overflow-hidden">
          <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
            <div className="h-2 w-16 rounded bg-muted-foreground/20" />
            <div className="h-2 w-24 rounded bg-muted-foreground/20" />
            <div className="h-2 w-14 rounded bg-muted-foreground/20 hidden sm:block" />
            <div className="h-2 w-14 rounded bg-muted-foreground/20 hidden sm:block" />
            <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20" />
            <div className="h-2 w-16 rounded bg-muted-foreground/20" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
              <div className={`h-2.5 rounded bg-muted ${i % 3 === 0 ? "w-20" : i % 3 === 1 ? "w-16" : "w-24"}`} />
              <div className={`h-2.5 rounded bg-muted/70 flex-1 max-w-[140px] ${i % 2 === 0 ? "max-w-[160px]" : "max-w-[120px]"}`} />
              <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
              <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
              <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                i % 4 === 0 ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" :
                i % 4 === 1 ? "bg-amber-100 text-amber-400 dark:bg-amber-900/40 dark:text-amber-500" :
                i % 4 === 2 ? "bg-brand-100 text-brand-400 dark:bg-brand-900/40 dark:text-brand-500" :
                "bg-red-100 text-red-400 dark:bg-red-900/40 dark:text-red-500"
              }`}>
                {i % 4 === 0 ? "to pay" : i % 4 === 1 ? "part paid" : i % 4 === 2 ? "paid" : "overdue"}
              </div>
              <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`} />
              <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-14" : "w-16"}`} />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

        {/* CTA overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/50">
            <ShoppingCart className="size-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">Track what you owe</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
            Add bills from your suppliers to keep track of what you owe, when it&apos;s due, and how long bills have been waiting to be paid.
          </p>
          <Button onClick={onCreate} size="lg" className="mt-6 bg-brand-600 hover:bg-brand-700">
            <Plus className="mr-2 size-4" />
            New Bill
          </Button>
        </div>
      </div>

      {/* Feature cards - full width */}
      <div className="grid gap-4 sm:grid-cols-3 mt-8">
        {[
          {
            icon: Clock,
            title: "Aging tracking",
            desc: "See how long bills have been outstanding with automatic aging buckets.",
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-950/40",
          },
          {
            icon: AlertTriangle,
            title: "Overdue alerts",
            desc: "Bills approaching or past their due date are highlighted so you never miss a payment.",
            color: "text-red-600 dark:text-red-400",
            bg: "bg-red-50 dark:bg-red-950/40",
          },
          {
            icon: CheckCircle2,
            title: "Payment matching",
            desc: "Record payments against bills and track outstanding balances automatically.",
            color: "text-brand-600 dark:text-brand-400",
            bg: "bg-brand-50 dark:bg-brand-950/40",
          },
        ].map(({ icon: Icon, title, desc, color, bg }) => (
          <div key={title} className="rounded-xl p-5">
            <div className={`flex size-9 items-center justify-center rounded-lg ${bg}`}>
              <Icon className={`size-4.5 ${color}`} />
            </div>
            <h3 className="mt-3 text-[13px] font-semibold">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </ContentReveal>
  );
}
