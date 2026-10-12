"use client";

import { useMemo, useState } from "react";
import { Plus, Receipt, Send, ThumbsUp, X as XIcon, Banknote, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Button } from "@/components/ui/button";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { formatMoney } from "@/lib/money";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MoneyCell, MutedCell, PartyCell, StatusPill, daysUntil, formatDay, toDayKey } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface ExpenseClaim {
  id: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  currencyCode: string;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  rejectionReason: string | null;
  submittedByUser: { name: string | null; email: string } | null;
}

interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
  category: string | null;
  receiptFileName: string | null;
  isMileage?: boolean;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Not submitted for approval yet" },
  { value: "submitted", label: "Awaiting approval", color: "#6366F1", hint: "Submitted and waiting for someone to approve it" },
  { value: "approved", label: "To reimburse", color: "#0EA5E9", hint: "Approved. The person still needs paying back" },
  { value: "rejected", label: "Rejected", color: "#EF4444", hint: "Sent back. It can be fixed and submitted again" },
  { value: "paid", label: "Paid back", color: "#10B981", hint: "The person has been reimbursed" },
];

const personOf = (c: ExpenseClaim) => c.submittedByUser?.name || c.submittedByUser?.email || null;

/** Days a submitted claim has been waiting for a decision. */
const waitingDays = (c: ExpenseClaim) => (c.status === "submitted" && c.submittedAt ? -(daysUntil(c.submittedAt) ?? 0) : null);

function sum(rows: ExpenseClaim[]) {
  return rows.reduce((s, c) => s + c.totalAmount, 0);
}

/** Run one action per claim, then report how many worked. */
async function runEach(items: ExpenseClaim[], url: (c: ExpenseClaim) => string, body: unknown, done: string, helpers: ExplorerHelpers) {
  let ok = 0;
  let failed = 0;
  for (const c of items) {
    try {
      await postJson(url(c), body);
      ok++;
    } catch {
      failed++;
    }
  }
  const parts = [ok && `${ok} claim${ok === 1 ? "" : "s"} ${done}`, failed && `${failed} failed`].filter(Boolean);
  (failed ? toast.error : toast.success)(parts.join(", ") || "Nothing to do");
  helpers.clearSelection();
  if (ok) helpers.refresh();
}

type Target = { claim: ExpenseClaim; helpers: ExplorerHelpers };

export default function ExpensesPage() {
  const { open: openDrawer } = useCreateDrawer();
  useDocumentTitle("Purchases · Expenses");

  const [rejecting, setRejecting] = useState<Target | null>(null);

  const config = useMemo<ExplorerConfig<ExpenseClaim>>(
    () => ({
      id: "expense-claims",
      endpoint: "/api/v1/expenses",
      noun: { one: "Expense claim", many: "Expense claims" },
      getId: (c) => c.id,
      href: (c) => `/purchases/expenses/${c.id}`,
      status: { get: (c) => c.status, options: STATUSES },
      date: { get: (c) => c.createdAt, label: "Created" },
      party: { get: personOf, label: "Person", many: "People" },
      amount: (c) => c.totalAmount,
      amountLabel: "Claimed",
      currency: (c) => c.currencyCode,
      search: (c) => [c.title, c.description, c.submittedByUser?.name, c.submittedByUser?.email, c.rejectionReason],
      defaultSort: { key: "created", dir: "desc" },
      facets: [{ key: "currency", label: "Currency", value: (c) => c.currencyCode }],
      columns: [
        {
          key: "title",
          label: "Claim",
          value: (c) => c.title,
          render: (c) => (
            <span className="min-w-0">
              <span className="block truncate font-medium">{c.title}</span>
              {c.description && <span className="block truncate text-[11.5px] text-muted-foreground">{c.description}</span>}
            </span>
          ),
        },
        { key: "person", label: "Person", className: "w-52", hint: "Who is asking to be paid back", value: personOf, render: (c) => <PartyCell name={personOf(c)} /> },
        { key: "created", label: "Created", className: "w-32", value: (c) => c.createdAt, render: (c) => <DateCell value={c.createdAt} /> },
        { key: "submitted", label: "Submitted", className: "w-32", value: (c) => c.submittedAt, render: (c) => <DateCell value={c.submittedAt} /> },
        { key: "status", label: "Status", className: "w-40", value: (c) => c.status, render: (c) => <StatusPill value={c.status} options={STATUSES} /> },
        {
          key: "waiting",
          label: "Waiting",
          align: "right",
          className: "w-24",
          hint: "Days a submitted claim has waited for a decision",
          value: waitingDays,
          render: (c) => {
            const d = waitingDays(c);
            if (d == null) return <span className="text-muted-foreground/50">—</span>;
            return <span className={d > 7 ? "tabular-nums font-medium text-amber-600 dark:text-amber-400" : "tabular-nums text-foreground/80"}>{d}d</span>;
          },
        },
        { key: "amount", label: "Amount", align: "right", className: "w-32", money: true, value: (c) => c.totalAmount, render: (c) => <MoneyCell cents={c.totalAmount} currency={c.currencyCode} className="font-medium" /> },
        {
          key: "owed",
          label: "Still to pay back",
          align: "right",
          className: "w-36",
          money: true,
          hidden: true,
          hint: "Approved but not reimbursed yet",
          value: (c) => (c.status === "approved" ? c.totalAmount : 0),
        },
        { key: "approvedOn", label: "Approved on", className: "w-32", hidden: true, value: (c) => c.approvedAt, render: (c) => <DateCell value={c.approvedAt} /> },
        { key: "paidOn", label: "Paid back on", className: "w-32", hidden: true, value: (c) => c.paidAt, render: (c) => <DateCell value={c.paidAt} /> },
        { key: "rejectedOn", label: "Rejected on", className: "w-32", hidden: true, value: (c) => c.rejectedAt, render: (c) => <DateCell value={c.rejectedAt} /> },
        { key: "reason", label: "Rejection reason", hidden: true, value: (c) => c.rejectionReason, render: (c) => <MutedCell value={c.rejectionReason} /> },
        { key: "email", label: "Email", hidden: true, value: (c) => c.submittedByUser?.email, render: (c) => <MutedCell value={c.submittedByUser?.email} /> },
        { key: "currency", label: "Currency", className: "w-24", hidden: true, value: (c) => c.currencyCode },
      ],
      metrics: (rows) => {
        const waiting = rows.filter((c) => c.status === "submitted");
        const toPay = rows.filter((c) => c.status === "approved");
        const paid = rows.filter((c) => c.status === "paid");
        const rejected = rows.filter((c) => c.status === "rejected");
        const drafts = rows.filter((c) => c.status === "draft");
        const oldest = Math.max(0, ...waiting.map((c) => waitingDays(c) ?? 0));
        const monthKey = toDayKey(new Date()).slice(0, 7);
        const thisMonth = rows.filter((c) => c.status !== "draft" && c.status !== "rejected" && (c.submittedAt ?? c.createdAt).slice(0, 7) === monthKey);
        return [
          { key: "waiting", label: "Awaiting approval", color: "#6366F1", status: "submitted", value: formatMoney(sum(waiting)), note: waiting.length ? `${waiting.length} claim${waiting.length === 1 ? "" : "s"} · oldest ${oldest}d` : "Nothing to review", hint: "Claims someone needs to approve or reject." },
          { key: "toPay", label: "To reimburse", color: "#0EA5E9", status: "approved", value: formatMoney(sum(toPay)), note: `${toPay.length} approved claim${toPay.length === 1 ? "" : "s"}`, hint: "Approved claims you still need to pay people back for." },
          { key: "paid", label: "Paid back", color: "#10B981", status: "paid", value: formatMoney(sum(paid)), note: `${paid.length} claim${paid.length === 1 ? "" : "s"} reimbursed`, hint: "Money you've already paid back to your team." },
          { key: "month", label: "Claimed this month", color: "#8B5CF6", value: formatMoney(sum(thisMonth)), note: `${thisMonth.length} claim${thisMonth.length === 1 ? "" : "s"}`, hint: "Claims submitted this calendar month, not counting drafts or rejected ones." },
          { key: "rejected", label: "Rejected", color: "#EF4444", status: "rejected", value: rejected.length.toString(), note: formatMoney(sum(rejected)), hint: "Claims sent back. They can be fixed and submitted again." },
          { key: "drafts", label: "Drafts", color: "#A1A1AA", status: "draft", value: drafts.length.toString(), note: formatMoney(sum(drafts)), hint: "Claims started but not submitted yet." },
        ];
      },
      bulkActions: (selected, helpers) => {
        const waiting = selected.filter((c) => c.status === "submitted");
        const toPay = selected.filter((c) => c.status === "approved");
        return (
          <>
            <ActionButton icon={<ThumbsUp className="size-3.5" />} run={() => runEach(waiting, (c) => `/api/v1/expenses/${c.id}/approve`, undefined, "approved", helpers)} className={waiting.length ? undefined : "pointer-events-none opacity-40"}>
              Approve{waiting.length ? ` (${waiting.length})` : ""}
            </ActionButton>
            <ActionButton icon={<Banknote className="size-3.5" />} run={() => runEach(toPay, (c) => `/api/v1/expenses/${c.id}/pay`, { date: toDayKey(new Date()) }, "marked as paid", helpers)} className={toPay.length ? undefined : "pointer-events-none opacity-40"}>
              Mark paid today{toPay.length ? ` (${toPay.length})` : ""}
            </ActionButton>
          </>
        );
      },
      preview: (c, helpers) => (
        <DocumentPreview
          url={`/api/v1/expenses/${c.id}`}
          pick={(json) => {
            const doc = json.expenseClaim as (ExpenseClaim & { items?: ExpenseItem[] }) | undefined;
            const items = doc?.items ?? [];
            const receipts = items.filter((i) => i.receiptFileName).length;
            return {
              lines: items.map((i) => ({
                description: [formatDay(i.date), i.description, i.category].filter(Boolean).join(" · "),
                amount: i.amount,
              })),
              notes: doc?.description,
              totals: [{ label: "Total", cents: doc?.totalAmount, strong: true }],
              extra: items.length > 0 && (
                <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                  <Paperclip className="size-3.5" />
                  {receipts === items.length ? "Every item has a receipt" : `${receipts} of ${items.length} items have a receipt`}
                </p>
              ),
            };
          }}
          number={c.title}
          plainTitle
          status={c.status}
          statusOptions={STATUSES}
          party={personOf(c)}
          partySub={c.submittedByUser?.name ? c.submittedByUser.email : null}
          amount={c.totalAmount}
          amountLabel="claimed"
          currency={c.currencyCode}
          facts={[
            { label: "Created", value: formatDay(c.createdAt) },
            { label: "Submitted", value: formatDay(c.submittedAt) },
            { label: "Approved", value: formatDay(c.approvedAt) },
            { label: "Paid back", value: formatDay(c.paidAt) },
            ...(c.rejectionReason && c.status === "rejected" ? [{ label: "Why it was rejected", value: c.rejectionReason }] : []),
          ]}
          actions={
            <>
              {(c.status === "draft" || c.status === "rejected") && (
                <ActionButton primary icon={<Send className="size-3.5" />} success="Expense claim submitted for approval" run={async () => { await postJson(`/api/v1/expenses/${c.id}/submit`); helpers.refresh(); }}>
                  Submit for approval
                </ActionButton>
              )}
              {c.status === "submitted" && (
                <>
                  <ActionButton primary icon={<ThumbsUp className="size-3.5" />} success="Expense claim approved" run={async () => { await postJson(`/api/v1/expenses/${c.id}/approve`); helpers.refresh(); }}>
                    Approve
                  </ActionButton>
                  <ActionButton icon={<XIcon className="size-3.5" />} run={async () => setRejecting({ claim: c, helpers })}>
                    Reject
                  </ActionButton>
                </>
              )}
              {c.status === "approved" && (
                <ActionButton primary icon={<Banknote className="size-3.5" />} success="Expense claim marked as paid" run={async () => { await postJson(`/api/v1/expenses/${c.id}/pay`, { date: toDayKey(new Date()) }); helpers.refresh(); }}>
                  Mark paid today
                </ActionButton>
              )}
            </>
          }
        />
      ),
      empty: <ExpensesEmpty onCreate={() => openDrawer("expense")} />,
    }),
    [openDrawer]
  );

  return (
    <>
      <Explorer config={config} />
      <RejectDialog target={rejecting} onClose={() => setRejecting(null)} />
    </>
  );
}

function RejectDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target) return;
    if (!reason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setBusy(true);
    try {
      await postJson(`/api/v1/expenses/${target.claim.id}/reject`, { reason: reason.trim() });
      toast.success("Expense claim rejected");
      target.helpers.refresh();
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setReason(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject this claim?</DialogTitle>
          <DialogDescription>
            {target ? `${target.claim.title} · ${formatMoney(target.claim.totalAmount, target.claim.currencyCode)}. ` : ""}
            It goes back to the person so they can fix it and submit again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. missing receipt for the taxi" />
          </div>
          <Button onClick={submit} loading={busy} className="w-full bg-red-600 hover:bg-red-700">
            Reject claim
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal>
      <div>
        {/* Full-width pipeline steps */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 rounded-lg border overflow-hidden mb-8">
          {[
            { label: "Draft", desc: "Create expense claim", color: "bg-gray-400", bg: "bg-gray-50 dark:bg-gray-900/30" },
            { label: "Submitted", desc: "Submit for review", color: "bg-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20" },
            { label: "Approved", desc: "Manager approves", color: "bg-brand-500", bg: "bg-brand-50 dark:bg-brand-900/20" },
            { label: "Paid", desc: "Reimbursement sent", color: "bg-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20" },
          ].map(({ label, desc, color, bg }, i) => (
            <div key={label} className={`relative flex flex-col items-center py-6 px-3 text-center border-r last:border-r-0 ${bg}`}>
              <div className={`absolute top-0 left-0 right-0 h-1 ${color} opacity-30`} />
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground/50 tabular-nums">{i + 1}</span>
                <div className={`size-2.5 rounded-full ${color}`} />
              </div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Skeleton table background with overlay */}
        <div className="relative">
          <div className="pointer-events-none w-full rounded-lg border overflow-hidden">
            <div className="flex items-center gap-4 border-b bg-muted/50 px-4 h-10">
              <div className="h-2 w-28 rounded bg-muted-foreground/20" />
              <div className="h-2 w-20 rounded bg-muted-foreground/20" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="ml-auto h-2 w-16 rounded bg-muted-foreground/20" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-12">
                <div className={`h-2.5 rounded bg-muted flex-1 max-w-[200px] ${i % 2 === 0 ? "max-w-[180px]" : "max-w-[220px]"}`} />
                <div className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-24" : "w-20"} hidden sm:block`} />
                <div className="h-2.5 w-20 rounded bg-muted/50 hidden sm:block" />
                <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium hidden sm:block ${
                  i % 3 === 0 ? "bg-blue-100 text-blue-400 dark:bg-blue-900/40 dark:text-blue-500" :
                  i % 3 === 1 ? "bg-brand-100 text-brand-400 dark:bg-brand-900/40 dark:text-brand-500" :
                  "bg-purple-100 text-purple-400 dark:bg-purple-900/40 dark:text-purple-500"
                }`}>
                  {i % 3 === 0 ? "submitted" : i % 3 === 1 ? "approved" : "paid"}
                </div>
                <div className={`h-2.5 rounded bg-muted/40 ${i % 2 === 0 ? "w-16" : "w-14"}`} />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-content-bg/20 via-content-bg/70 to-content-bg" />

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-950/50">
              <Receipt className="size-7 text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-tight">No expense claims yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
              Submit expenses and track them through approval to reimbursement.
            </p>
            <Button onClick={onCreate} size="lg" className="mt-6 bg-brand-600 hover:bg-brand-700">
              <Plus className="mr-2 size-4" />
              New Expense Claim
            </Button>
          </div>
        </div>
      </div>
    </ContentReveal>
  );
}
