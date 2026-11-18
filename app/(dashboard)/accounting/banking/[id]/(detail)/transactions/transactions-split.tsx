"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Paperclip, Plus } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountPicker } from "@/components/dashboard/account-picker";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Transaction } from "../../_components";
import { ExpenseDrawer } from "@/components/dashboard/expense-drawer";
import { cleanDescription as clean, splitDescription as split } from "@/lib/format/description";

type Candidate = {
  type: "existing_payment" | "existing_journal" | "transfer" | "existing_expense";
  id: string;
  journalEntryId: string | null;
  date: string;
  description: string;
  amount: number;
  meta?: Record<string, unknown>;
};

type Ranked = { candidate: Candidate; confidence: number; reasons: string[] };

const money = (cents: number, cur: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(cents / 100);

export function TransactionsSplit({
  transactions,
  cur,
  orgId,
  onRefetch,
  onCreateExpense,
  onExclude,
  onSettled,
  onUnsettled,
}: {
  transactions: Transaction[];
  cur: string;
  orgId: string | null;
  onRefetch: () => void;
  onCreateExpense: (tx: Transaction) => void;
  onCategorize: (tx: Transaction) => void;
  onExclude: (txId: string) => void;
  onSettled: (txId: string) => void;
  onUnsettled: (txId: string) => void;
}) {
  const [matches, setMatches] = useState<Record<string, Ranked[]>>({});
  const [linking, setLinking] = useState<string | null>(null);
  // What a line became, held locally so the row can settle immediately. The
  // page used to refetch, which dropped a skeleton over the whole statement and
  // made a one-click action feel like a reload.
  const [resolved, setResolved] = useState<
    Record<string, { label: string; claimId?: string }>
  >({});
  const [drawerClaim, setDrawerClaim] = useState<string | null>(null);

  // One lookup per line, in parallel: the row cannot say what it can do until
  // the books have been asked, and asking per row on click would make every
  // row feel unresponsive.
  const unreconciled = transactions.filter((t) => t.status === "unreconciled");
  const ids = unreconciled.map((t) => t.id).join(",");

  useEffect(() => {
    if (!orgId || !ids) return;
    let live = true;
    Promise.all(
      ids.split(",").map((id) =>
        fetch(`/api/v1/bank-transactions/${id}/match`, {
          headers: { "x-organization-id": orgId },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data): [string, Ranked[]] => [
            id,
            ((data?.existingMatches ?? []) as Ranked[])
              .filter(
                (m) =>
                  m.confidence >= 45 &&
                  (m.candidate.journalEntryId ||
                    m.candidate.type === "existing_payment" ||
                    m.candidate.type === "existing_expense")
              )
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 3),
          ])
          .catch((): [string, Ranked[]] => [id, []])
      )
    ).then((rows) => {
      if (live) setMatches(Object.fromEntries(rows));
    });
    return () => {
      live = false;
    };
  }, [ids, orgId]);

  const link = useCallback(
    async (tx: Transaction, m: Ranked) => {
      if (!orgId) return;
      setLinking(tx.id);
      try {
        // A recorded-but-unposted expense claim is matched through its own
        // endpoint, which posts the liability; everything else links a journal.
        const isClaim = m.candidate.type === "existing_expense";
        const res = await fetch(
          `/api/v1/bank-transactions/${tx.id}/${isClaim ? "match-expense" : "match"}`,
          {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-organization-id": orgId },
            body: JSON.stringify(
              isClaim
                ? { expenseClaimId: String(m.candidate.meta?.expenseClaimId ?? m.candidate.id) }
                : m.candidate.type === "existing_payment"
                  ? { matchType: "existing_payment", paymentId: m.candidate.id }
                  : { matchType: "existing_journal", journalEntryId: m.candidate.journalEntryId }
            ),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Could not link this transaction");
          return;
        }
        setResolved((prev) => ({
          ...prev,
          [tx.id]: {
            label: isClaim
              ? String(m.candidate.meta?.title ?? split(m.candidate.description).payee)
              : "Reconciled",
            claimId: isClaim
              ? String(m.candidate.meta?.expenseClaimId ?? m.candidate.id)
              : undefined,
          },
        }));
        onSettled(tx.id);
        toast.success("Reconciled", { description: split(m.candidate.description).payee });
      } finally {
        setLinking(null);
      }
    },
    [orgId, onSettled]
  );

  return (
    <>
    <ExpenseDrawer claimId={drawerClaim} orgId={orgId} onClose={() => setDrawerClaim(null)} />
    <div className="overflow-hidden rounded-xl border">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-4 border-b bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Transaction</span>
        <span>Reconcile</span>
      </div>
      {transactions.map((tx) => (
        <Row
          key={tx.id}
          tx={tx}
          cur={cur}
          orgId={orgId}
          candidates={matches[tx.id]}
          resolved={resolved[tx.id]}
          linking={linking === tx.id}
          onLink={(m) => link(tx, m)}
          onCreateExpense={() => onCreateExpense(tx)}
          onExclude={() => onExclude(tx.id)}
          onOpenClaim={(id) => setDrawerClaim(id)}
          onUnresolve={() => {
            setResolved((prev) => {
              const next = { ...prev };
              delete next[tx.id];
              return next;
            });
            onUnsettled(tx.id);
          }}
          onResolve={(label: string) => {
            setResolved((prev) => ({ ...prev, [tx.id]: { label } }));
            onSettled(tx.id);
          }}
        />
      ))}
    </div>
    </>
  );
}

function Row({
  tx,
  cur,
  orgId,
  candidates,
  resolved,
  linking,
  onLink,
  onCreateExpense,
  onExclude,
  onResolve,
  onOpenClaim,
  onUnresolve,
}: {
  tx: Transaction;
  cur: string;
  orgId: string | null;
  candidates: Ranked[] | undefined;
  resolved: { label: string; claimId?: string } | undefined;
  linking: boolean;
  onLink: (m: Ranked) => void;
  onCreateExpense: () => void;
  onExclude: () => void;
  onResolve: (label: string) => void;
  onOpenClaim: (id: string) => void;
  onUnresolve: () => void;
}) {
  const { payee, detail } = split(tx.description);
  const done = tx.status !== "unreconciled";
  const best = candidates?.[0];
  const [undoing, setUndoing] = useState(false);

  async function undo(id: string, claimId: string) {
    if (!orgId) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/v1/bank-transactions/${id}/match-expense`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ expenseClaimId: claimId, reason: "Unlinked from the bank statement" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not undo this link");
      toast.success("Link removed", { description: "The transaction is back to do" });
      onUnresolve();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo this link");
    } finally {
      setUndoing(false);
    }
  }

  return (
    <div
      className={cn(
        "grid gap-4 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] sm:items-start",
        done && "bg-muted/20"
      )}
    >
      {/* Left: the line as a person reads a statement */}
      <div className="min-w-0 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{payee}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{tx.date}</span>
        </div>
        {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
        <p className="mt-0.5 select-all font-mono text-[10px] text-muted-foreground/70" title={tx.id}>
          {tx.id.slice(0, 8)}
        </p>
        <p
          className={cn(
            "mt-1 text-sm tabular-nums",
            tx.amount < 0 ? "text-foreground" : "text-emerald-600"
          )}
        >
          {money(tx.amount, cur)}
        </p>
      </div>

      {/* Right: what already exists, what might match, or a way to record it */}
      <div className="min-w-0">
        {resolved ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3 py-2"
          >
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.06, type: "spring", stiffness: 500, damping: 22 }}
              className="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"
            >
              <Check className="size-2.5" strokeWidth={3} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {resolved.label}
              </p>
              <p className="text-[11px] text-muted-foreground">Reconciled just now</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {resolved.claimId && (
                <button
                  type="button"
                  onClick={() => onOpenClaim(resolved.claimId!)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Open
                </button>
              )}
              {resolved.claimId && (
                <button
                  type="button"
                  onClick={() => undo(tx.id, resolved.claimId!)}
                  disabled={undoing}
                  className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  {undoing ? "Undoing…" : "Undo"}
                </button>
              )}
            </div>
          </motion.div>
        ) : done ? (
          tx.expenseClaimId ? (
            <button
              type="button"
              onClick={() => onOpenClaim(tx.expenseClaimId!)}
              className="flex w-full items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              <Check className="size-3.5 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {tx.accountName || "Reconciled"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Open the expense claim
                </p>
              </div>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Check className="size-3.5 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {tx.accountName || (tx.status === "excluded" ? "Ignored" : "Reconciled")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {tx.journalEntryId ? "Recorded in your books" : "No ledger entry"}
                </p>
              </div>
            </div>
          )
        ) : candidates === undefined ? (
          <p className="flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Looking for matches…
          </p>
        ) : best ? (
          <div className="space-y-1.5">
            {candidates.map((m, index) => {
              const confident = m.confidence >= 70;
              return (
                <div
                  key={m.candidate.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2",
                    index === 0 && confident && "border-emerald-600/40 bg-emerald-600/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {split(m.candidate.description).payee}
                      <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                        {m.confidence}%
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.candidate.date}
                      {typeof m.candidate.meta?.itemCount === "number" &&
                        ` · ${m.candidate.meta.itemCount} item${m.candidate.meta.itemCount === 1 ? "" : "s"}`}
                      {typeof m.candidate.meta?.totalAmount === "number" &&
                        ` · ${money(Number(m.candidate.meta.totalAmount), String(m.candidate.meta.currencyCode ?? cur))}`}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.reasons.join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={confident && index === 0 ? "default" : "outline"}
                    className="shrink-0 gap-1 px-2 text-xs"
                    loading={linking}
                    onClick={() => onLink(m)}
                  >
                    Link <ArrowRight className="size-3" />
                  </Button>
                </div>
              );
            })}
            <button
              type="button"
              className="w-full px-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onCreateExpense}
            >
              None of these — create a new expense
            </button>
          </div>
        ) : (
          <InlineExpense tx={tx} cur={cur} orgId={orgId} onSaved={() => onResolve(`Expense recorded · ${payee}`)} onFallback={onCreateExpense} onIgnore={onExclude} />
        )}
      </div>
    </div>
  );
}

/**
 * Records the line as an expense without leaving the page: the amount, date and
 * payee are already known, so the only decisions left are the account and the
 * receipt.
 */
function InlineExpense({
  tx,
  cur,
  orgId,
  onSaved,
  onFallback,
  onIgnore,
}: {
  tx: Transaction;
  cur: string;
  orgId: string | null;
  onSaved: () => void;
  onFallback: () => void;
  onIgnore: () => void;
}) {
  const { payee } = split(tx.description);
  const [accountId, setAccountId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!orgId || !accountId) return;
    setSaving(true);
    try {
      let receiptFileKey: string | undefined;
      let receiptFileName: string | undefined;

      if (file) {
        const presign = await fetch("/api/v1/attachments/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-organization-id": orgId },
          body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream", fileSize: file.size }),
        });
        const signed = await presign.json().catch(() => ({}));
        if (!presign.ok) throw new Error(signed.error || "Could not prepare the receipt upload");
        const put = await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Receipt upload failed");
        receiptFileKey = signed.attachment?.fileKey ?? signed.attachment?.key;
        receiptFileName = file.name;
      }

      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          title: payee,
          currencyCode: cur,
          items: [
            {
              date: tx.date,
              description: clean(tx.description) || payee,
              amount: Math.abs(tx.amount) / 100,
              accountId: accountId || null,
              receiptFileKey: receiptFileKey ?? null,
              receiptFileName: receiptFileName ?? null,
            },
          ],
        }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(created.error || "Could not create the expense");
      toast.success(`Recorded ${money(tx.amount, cur)} to ${payee}`, {
        description: file ? "Receipt attached." : undefined,
      });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <AccountPicker value={accountId} onChange={setAccountId} allowCreate />
        </div>
        <label className="shrink-0 cursor-pointer rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent" title="Attach the receipt or invoice">
          <Paperclip className="size-3.5" />
          <input
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          size="sm"
          className="shrink-0 gap-1 px-2 text-xs"
          loading={saving}
          disabled={!accountId}
          onClick={create}
        >
          <Plus className="size-3" /> Record
        </Button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
        <span className="truncate">
          {file ? file.name : `Records ${money(tx.amount, cur)} as ${payee}`}
        </span>
        <span className="text-border">·</span>
        <button type="button" className="shrink-0 hover:text-foreground" onClick={onFallback}>
          More options
        </button>
        <button type="button" className="shrink-0 hover:text-foreground" onClick={onIgnore}>
          Ignore
        </button>
      </div>
    </div>
  );
}
