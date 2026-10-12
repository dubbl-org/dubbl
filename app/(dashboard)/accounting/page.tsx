"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, BookOpen, BarChart3, Check, Undo2, Pencil, Trash2, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { ContentReveal } from "@/components/ui/content-reveal";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { Explorer } from "@/components/dashboard/explorer/explorer";
import { DocumentPreview } from "@/components/dashboard/explorer/document-preview";
import { ActionButton, postJson } from "@/components/dashboard/explorer/action-button";
import { DateCell, MutedCell, NumberCell, StatusPill, daysUntil, formatDay } from "@/components/dashboard/explorer/cells";
import type { ExplorerConfig, ExplorerHelpers, ExplorerStatus } from "@/components/dashboard/explorer/types";

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  reference: string | null;
  status: "draft" | "posted" | "void";
  /** Decimal string, e.g. "125.00" */
  totalDebit: string;
  sourceType: string | null;
  sourceId: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  autoReverseDate: string | null;
  reversedByEntryId: string | null;
  reversesEntryId: string | null;
  createdAt: string;
}

interface EntryLine {
  id: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
  currencyCode?: string;
}

const STATUSES: ExplorerStatus[] = [
  { value: "draft", label: "Draft", color: "#A1A1AA", hint: "Saved but not in your books yet. Post it to make it count in your reports" },
  { value: "posted", label: "Posted", color: "#10B981", hint: "Final and counted in your books and reports" },
  { value: "reversed", label: "Reversed", color: "#8B5CF6", hint: "Cancelled by a matching opposite entry, so together they add up to zero" },
  { value: "void", label: "Cancelled", color: "#D4D4D8", hint: "Cancelled, so it no longer counts" },
];

const toCents = (decimal: string | number | null | undefined) => Math.round(parseFloat(String(decimal ?? 0)) * 100) || 0;
const amountOf = (e: Entry) => toCents(e.totalDebit);

function statusOf(e: Entry) {
  if (e.status === "posted" && (e.reversedByEntryId || e.voidedAt)) return "reversed";
  return e.status;
}

const isManual = (e: Entry) => !e.sourceType || e.sourceType === "manual";

/** Where an entry came from, in words a founder recognises. */
const SOURCE_RULES: [RegExp, string][] = [
  [/^manual$/, "Typed in by hand"],
  [/(^|_)reversal$|^auto_reversal$/, "Reversal"],
  [/^stripe/, "Stripe"],
  [/^invoice/, "Invoices"],
  [/^sales_receipt/, "Sales receipts"],
  [/^bill/, "Bills"],
  [/^expense_claim/, "Expense claims"],
  [/^expense/, "Expenses"],
  [/^payment/, "Payments"],
  [/^credit_note/, "Credit notes"],
  [/^debit_note/, "Debit notes"],
  [/^customer_credit/, "Customer credit"],
  [/^bad_debt/, "Bad debts"],
  [/^(bank|transfer|statement_import|csv_import|reconciliation)/, "Banking"],
  [/^(depreciation|disposal|asset_|cwip_)/, "Fixed assets"],
  [/^loan/, "Loans"],
  [/^accrual/, "Accruals"],
  [/^recurring_journal/, "Recurring journals"],
  [/^(payroll|contractor_payment)/, "Payroll"],
  [/^(inventory|goods_receipt|landed_cost|stock_take|assembly_build)/, "Inventory"],
  [/^(vat_return|tax_settlement)/, "Tax"],
  [/^opening_balance/, "Opening balances"],
  [/^year_end_close/, "Year-end close"],
  [/^fx_gain_loss/, "Currency gains and losses"],
  [/^revenue_recognition/, "Revenue recognition"],
];

function sourceLabel(type: string | null) {
  if (!type) return "Typed in by hand";
  for (const [re, label] of SOURCE_RULES) if (re.test(type)) return label;
  const words = type.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function sum(rows: Entry[]) {
  return rows.reduce((s, e) => s + amountOf(e), 0);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

async function postDrafts(drafts: Entry[], helpers: ExplorerHelpers) {
  let ok = 0;
  const failed: string[] = [];
  for (const e of drafts) {
    try {
      await postJson(`/api/v1/entries/${e.id}/post`);
      ok++;
    } catch (err) {
      failed.push(`#${e.entryNumber}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  if (ok) toast.success(`${plural(ok, "entry", "entries")} posted to your books`);
  if (failed.length) toast.error(`${failed.length} couldn't be posted`, { description: failed.slice(0, 3).join(" · ") });
  helpers.clearSelection();
  if (ok) helpers.refresh();
}

export default function TransactionsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [reversing, setReversing] = useState<{ entry: Entry; helpers: ExplorerHelpers } | null>(null);

  useDocumentTitle("Accounting · Manual entries");

  const config = useMemo<ExplorerConfig<Entry>>(
    () => ({
      id: "journal-entries",
      endpoint: "/api/v1/entries",
      // This route returns `{ entries }` with no paging, newest first
      select: (json) => ((json as { entries?: Entry[] }).entries ?? []),
      noun: { one: "Entry", many: "Journal entries" },
      getId: (e) => e.id,
      href: (e) => `/accounting/${e.id}`,
      status: { get: statusOf, options: STATUSES },
      date: { get: (e) => e.date, label: "Entry date" },
      amount: amountOf,
      amountLabel: "Moved",
      search: (e) => [String(e.entryNumber), `#${e.entryNumber}`, e.description, e.reference, sourceLabel(e.sourceType), e.voidReason],
      defaultSort: { key: "date", dir: "desc" },
      facets: [
        { key: "source", label: "Source", value: (e) => sourceLabel(e.sourceType) },
        { key: "origin", label: "How it was made", value: (e) => (isManual(e) ? "By hand" : "Automatically") },
        { key: "autoReverse", label: "Undoes itself", value: (e) => (e.autoReverseDate ? "Reverses on a set date" : null) },
      ],
      columns: [
        { key: "number", label: "#", className: "w-20", value: (e) => e.entryNumber, render: (e) => <NumberCell value={`#${e.entryNumber}`} /> },
        { key: "date", label: "Date", className: "w-32", value: (e) => e.date, render: (e) => <DateCell value={e.date} /> },
        {
          key: "description",
          label: "Description",
          value: (e) => e.description,
          render: (e) => <span className="block truncate font-medium">{e.description}</span>,
        },
        { key: "reference", label: "Reference", className: "w-36", value: (e) => e.reference, render: (e) => <MutedCell value={e.reference} /> },
        {
          key: "source",
          label: "Source",
          className: "w-44",
          hint: "Where the entry came from: typed in by hand, or created for you by an invoice, bill, bank transaction and so on",
          value: (e) => sourceLabel(e.sourceType),
          render: (e) => (
            <span className="inline-flex items-center gap-1.5 truncate text-foreground/80">
              <span className={isManual(e) ? "size-1.5 shrink-0 rounded-full bg-foreground/50" : "size-1.5 shrink-0 rounded-full bg-sky-500"} />
              {sourceLabel(e.sourceType)}
            </span>
          ),
        },
        { key: "status", label: "Status", className: "w-32", value: statusOf, render: (e) => <StatusPill value={statusOf(e)} options={STATUSES} /> },
        {
          key: "amount",
          label: "Amount",
          align: "right",
          className: "w-32",
          money: true,
          hint: "Total of the debit side. Every entry balances, so the credit side is the same",
          value: amountOf,
        },
        { key: "posted", label: "Posted on", className: "w-32", hidden: true, value: (e) => e.postedAt, render: (e) => <DateCell value={e.postedAt} /> },
        {
          key: "autoReverse",
          label: "Undoes itself on",
          className: "w-36",
          hidden: true,
          hint: "A matching opposite entry is posted automatically on this date",
          value: (e) => e.autoReverseDate,
          render: (e) => <DateCell value={e.autoReverseDate} />,
        },
        { key: "cancelled", label: "Cancelled on", className: "w-32", hidden: true, value: (e) => e.voidedAt, render: (e) => <DateCell value={e.voidedAt} /> },
        { key: "reason", label: "Why it was cancelled", hidden: true, value: (e) => e.voidReason, render: (e) => <MutedCell value={e.voidReason} /> },
        {
          key: "kind",
          label: "Kind",
          className: "w-28",
          hidden: true,
          value: (e) => (e.reversesEntryId ? "Reversal" : "Original"),
        },
        { key: "sourceType", label: "System source", className: "w-40", hidden: true, value: (e) => e.sourceType ?? "manual" },
        { key: "created", label: "Created", className: "w-32", hidden: true, value: (e) => e.createdAt, render: (e) => <DateCell value={e.createdAt} /> },
      ],
      metrics: (rows) => {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const thisMonth = rows.filter((e) => e.date?.startsWith(monthKey) && statusOf(e) !== "void");
        const drafts = rows.filter((e) => e.status === "draft");
        const posted = rows.filter((e) => statusOf(e) === "posted");
        const manual = rows.filter(isManual);
        const undone = rows.filter((e) => ["reversed", "void"].includes(statusOf(e)));
        const pendingReverse = rows
          .filter((e) => e.autoReverseDate && !e.reversedByEntryId && statusOf(e) !== "void")
          .filter((e) => (daysUntil(e.autoReverseDate) ?? -1) >= 0)
          .sort((a, b) => (a.autoReverseDate ?? "").localeCompare(b.autoReverseDate ?? ""));
        return [
          { key: "month", label: "Entries this month", color: "#0EA5E9", value: thisMonth.length.toLocaleString(), note: `${formatMoney(sum(thisMonth))} moved`, hint: "Entries dated this calendar month, whatever their status." },
          { key: "drafts", label: "Drafts not posted yet", color: "#A1A1AA", status: "draft", value: drafts.length.toLocaleString(), note: drafts.length ? `${formatMoney(sum(drafts))} waiting` : "Nothing waiting", hint: "Drafts don't count in your reports until you post them." },
          { key: "posted", label: "Total moved", color: "#10B981", status: "posted", value: formatMoney(sum(posted)), note: `${plural(posted.length, "posted entry", "posted entries")}`, hint: "The total of every posted entry that still counts in your books." },
          {
            key: "manual",
            label: "Typed in by hand",
            color: "#6366F1",
            value: rows.length ? `${Math.round((manual.length / rows.length) * 100)}%` : "—",
            note: `${manual.length.toLocaleString()} by hand · ${(rows.length - manual.length).toLocaleString()} automatic`,
            hint: "Most entries are created for you by invoices, bills, bank transactions and so on. Hand-made ones are worth a second look.",
          },
          { key: "undone", label: "Reversed or cancelled", color: "#8B5CF6", status: "reversed", value: undone.length.toLocaleString(), note: formatMoney(sum(undone)), hint: "Entries that were undone with a matching opposite entry, or cancelled." },
          {
            key: "autoReverse",
            label: "Will undo themselves",
            color: "#F59E0B",
            value: pendingReverse.length.toLocaleString(),
            note: pendingReverse[0] ? `Next on ${formatDay(pendingReverse[0].autoReverseDate)}` : "None scheduled",
            hint: "Entries set to reverse automatically on a date, such as accruals and prepayments.",
          },
        ];
      },
      bulkActions: (selected, helpers) => {
        const drafts = selected.filter((e) => e.status === "draft");
        return (
          <ActionButton
            icon={<Check className="size-3.5" />}
            run={() => postDrafts(drafts, helpers)}
            className={drafts.length ? undefined : "pointer-events-none opacity-40"}
          >
            Post to books{drafts.length ? ` (${drafts.length})` : ""}
          </ActionButton>
        );
      },
      preview: (e, helpers) => {
        const status = statusOf(e);
        return (
          <DocumentPreview
            number={`Entry #${e.entryNumber}`}
            status={status}
            statusOptions={STATUSES}
            amount={amountOf(e)}
            amountLabel="moved"
            facts={[
              { label: "Date", value: formatDay(e.date) },
              { label: "Source", value: sourceLabel(e.sourceType) },
              { label: "Reference", value: e.reference || "—" },
              { label: "Posted on", value: formatDay(e.postedAt) },
              { label: "Created", value: formatDay(e.createdAt) },
              e.voidedAt
                ? { label: "Cancelled on", value: formatDay(e.voidedAt) }
                : e.autoReverseDate
                  ? { label: "Undoes itself on", value: formatDay(e.autoReverseDate) }
                  : { label: "Kind", value: e.reversesEntryId ? "Reversal of another entry" : "Original" },
            ]}
            actions={
              <>
                {e.status === "draft" && (
                  <>
                    <ActionButton
                      primary
                      icon={<Check className="size-3.5" />}
                      success="Posted to your books"
                      run={async () => {
                        await postJson(`/api/v1/entries/${e.id}/post`);
                        helpers.refresh();
                      }}
                    >
                      Post to books
                    </ActionButton>
                    <ActionButton icon={<Pencil className="size-3.5" />} run={async () => router.push(`/accounting/${e.id}`)}>
                      Edit draft
                    </ActionButton>
                    <ActionButton
                      icon={<Trash2 className="size-3.5" />}
                      className="text-red-600 dark:text-red-400"
                      run={() =>
                        confirm({
                          title: `Delete draft #${e.entryNumber}?`,
                          description: "This removes the draft for good. It was never in your books, so your reports won't change.",
                          confirmLabel: "Delete draft",
                          destructive: true,
                          onConfirm: async () => {
                            const orgId = localStorage.getItem("activeOrgId");
                            const res = await fetch(`/api/v1/entries/${e.id}`, { method: "DELETE", headers: orgId ? { "x-organization-id": orgId } : {} });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              toast.error(typeof data.error === "string" ? data.error : "Couldn't delete this draft");
                              throw new Error("delete failed");
                            }
                            toast.success("Draft deleted");
                            helpers.refresh();
                          },
                        })
                      }
                    >
                      Delete
                    </ActionButton>
                  </>
                )}
                {status === "posted" && (
                  <ActionButton icon={<Undo2 className="size-3.5" />} run={async () => setReversing({ entry: e, helpers })}>
                    Reverse entry
                  </ActionButton>
                )}
              </>
            }
          >
            {e.voidReason && (
              <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-3.5 py-3 text-[13px]">
                <p className="text-[12px] font-medium text-red-700 dark:text-red-400">Why it was cancelled</p>
                <p className="mt-0.5 text-foreground/85">{e.voidReason}</p>
              </div>
            )}
            <EntryLines id={e.id} />
            {(e.reversedByEntryId || e.reversesEntryId) && (
              <div className="mt-4 flex flex-wrap gap-2 text-[12.5px]">
                {e.reversedByEntryId && <LinkedEntry href={`/accounting/${e.reversedByEntryId}`} label="See the reversing entry" />}
                {e.reversesEntryId && <LinkedEntry href={`/accounting/${e.reversesEntryId}`} label="See the entry this undoes" />}
              </div>
            )}
          </DocumentPreview>
        );
      },
      empty: <EntriesEmpty onCreate={() => openDrawer("entry")} />,
    }),
    [openDrawer, router, confirm]
  );

  return (
    <>
      <Explorer config={config} />

      <section className="mt-8 max-w-2xl">
        <ActivityFeed />
      </section>

      <ReverseDialog
        target={reversing}
        onClose={() => setReversing(null)}
      />
      {confirmDialog}
    </>
  );
}

function LinkedEntry({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.045] px-2 py-1 font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.07]">
      {label}
      <ArrowUpRight className="size-3" />
    </Link>
  );
}

/** The debit and credit lines of one entry, loaded when the preview opens. */
function EntryLines({ id }: { id: string }) {
  const [state, setState] = useState<{ id: string; lines: EntryLine[] } | null>(null);
  const loading = state?.id !== id;

  useEffect(() => {
    let cancelled = false;
    const orgId = localStorage.getItem("activeOrgId");
    fetch(`/api/v1/entries/${id}`, { headers: orgId ? { "x-organization-id": orgId } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setState({ id, lines: (json?.entry?.lines as EntryLine[] | undefined) ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ id, lines: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const lines = !loading && state ? state.lines : [];
  const debit = lines.reduce((s, l) => s + toCents(l.debitAmount), 0);
  const credit = lines.reduce((s, l) => s + toCents(l.creditAmount), 0);
  const money = (cents: number, currency?: string) => (cents ? formatMoney(cents, currency || "USD") : "");

  return (
    <div className="mt-6">
      <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">What moved where</p>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">No lines on this entry</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/80">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="h-8 bg-foreground/[0.025] text-[11.5px] text-muted-foreground">
                <th className="px-3 text-left font-medium">Account</th>
                <th className="w-28 px-2 text-right font-medium">Debit</th>
                <th className="w-28 px-3 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      {l.accountCode && <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">{l.accountCode}</span>}
                      <span className="truncate font-medium">{l.accountName || "Unknown account"}</span>
                    </span>
                    {l.description && <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{l.description}</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(toCents(l.debitAmount), l.currencyCode)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(toCents(l.creditAmount), l.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border/80 bg-foreground/[0.015] font-semibold">
                <td className="px-3 py-2.5">
                  Total
                  {debit !== credit && <span className="ml-2 text-[12px] font-medium text-red-600 dark:text-red-400">Doesn&apos;t balance</span>}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(debit)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function ReverseDialog({ target, onClose }: { target: { entry: Entry; helpers: ExplorerHelpers } | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!target || !reason.trim()) return;
    setBusy(true);
    try {
      await postJson(`/api/v1/entries/${target.entry.id}/void`, { reason: reason.trim() });
      toast.success(`Entry #${target.entry.entryNumber} reversed`);
      target.helpers.refresh();
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reverse this entry");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse entry #{target?.entry.entryNumber}?</DialogTitle>
          <DialogDescription>
            We&apos;ll post a matching opposite entry on the same date, so the two cancel out and your reports no longer count it. Please add a reason.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you reversing this entry?" rows={3} />
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={!reason.trim() || busy}>
            {busy ? "Reversing..." : "Reverse entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EntriesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Manual entries</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Direct adjustments to your books, used for things like accruals or corrections.
          </p>
        </div>
        <Button onClick={onCreate} size="sm" className="bg-brand-600 hover:bg-brand-700">
          <Plus className="mr-2 size-4" />
          New manual entry
        </Button>
      </div>

      <div className="flex flex-col items-center gap-10 pt-8 pb-12">
        {/* Entry lifecycle stepper */}
        <div className="w-full max-w-xl">
          <div className="grid grid-cols-3 gap-0">
            {[
              { step: "1", icon: BookOpen, label: "Set up accounts", sub: "Set up the categories you record transactions against", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
              { step: "2", icon: ArrowLeftRight, label: "Record entries", sub: "Add manual entries to adjust your books when needed", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
              { step: "3", icon: BarChart3, label: "Generate reports", sub: "View trial balance, income statement, and more", color: "bg-brand-500", ring: "ring-brand-200 dark:ring-brand-900" },
            ].map(({ step, icon: StepIcon, label, sub, color, ring }, i) => (
              <div key={step} className="flex flex-col items-center text-center relative">
                {i < 2 && <div className="absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />}
                <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>{step}</div>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <StepIcon className="size-3.5 text-muted-foreground" />
                  <p className="text-sm font-medium">{label}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-lg font-semibold tracking-tight">Start tracking transactions</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Add your first manual entry to adjust your books.</p>
          <Button onClick={onCreate} size="lg" className="mt-5 bg-brand-600 hover:bg-brand-700">
            <Plus className="mr-2 size-4" />
            New manual entry
          </Button>
        </div>

        {/* Preview stat cards (empty) */}
        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
          {[
            { label: "Total in your books", value: "$0.00" },
            { label: "In your books", value: "0" },
            { label: "Drafts", value: "0" },
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
