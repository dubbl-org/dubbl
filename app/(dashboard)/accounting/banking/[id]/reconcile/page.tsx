"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle,
  Search,
  XCircle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { ReconciliationReport, type ReconciliationData } from "../_components";

interface BankAccountDetail {
  id: string;
  accountName: string;
  balance: number;
  currencyCode: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: "unreconciled" | "reconciled" | "excluded";
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  journalEntryId?: string | null;
  reconciliationId?: string | null;
}

// A statement line should be categorized/matched (its journal entry recorded)
// before it's reconciled, so the books stay in sync with the bank.
function isCategorized(t: Transaction): boolean {
  return Boolean(t.journalEntryId);
}

interface Reconciliation {
  id: string;
  startDate: string;
  endDate: string;
  startBalance: number;
  endBalance: number;
  status: "in_progress" | "completed";
  createdAt: string;
}

export default function ReconcilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [report, setReport] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recForm, setRecForm] = useState({
    startDate: "",
    endDate: "",
    startBalance: "",
    endBalance: "",
  });
  const [savingRec, setSavingRec] = useState(false);
  const [acting, setActing] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  useDocumentTitle("Accounting \u00B7 Match statement to your books");

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    // Pull both the still-to-review lines (status=unreconciled) and the
    // categorized/matched lines (status=reconciled — categorize/match flip the
    // status while recording a journal entry) so the latter can be ticked off
    // into a statement reconciliation. Lines already part of a completed
    // statement reconciliation (reconciliationId set) are filtered out below.
    Promise.all([
      fetch(`/api/v1/bank-accounts/${id}`, { headers }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/transactions?status=unreconciled&limit=100`, {
        headers,
      }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/transactions?status=reconciled&limit=100`, {
        headers,
      }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/reconciliations`, {
        headers,
      }).then((r) => r.json()),
      // Statement-vs-GL report: end balance, GL balance, running difference and
      // the reconciled / unreconciled splits, scoped to the latest reconciliation.
      fetch(`/api/v1/bank-accounts/${id}/reconciliation`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([accountData, unreconciledData, reconciledData, recData, reportData]) => {
        if (accountData.bankAccount) setAccount(accountData.bankAccount);
        const unreconciled: Transaction[] = unreconciledData.data ?? [];
        // Categorized lines that haven't yet been rolled into a completed
        // statement reconciliation.
        const categorized: Transaction[] = (reconciledData.data ?? []).filter(
          (t: Transaction) => t.journalEntryId && !t.reconciliationId
        );
        setTransactions([...unreconciled, ...categorized]);
        if (recData.data) setReconciliations(recData.data);
        setReport(reportData && reportData.bankAccountId ? reportData : null);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredTransactions = transactions.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.description.toLowerCase().includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.date.includes(q)
    );
  });

  // Only categorized/matched lines may be included in a reconciliation.
  const selectableTransactions = filteredTransactions.filter(isCategorized);
  const uncategorizedCount = filteredTransactions.length - selectableTransactions.length;

  function toggleSelect(tx: Transaction) {
    if (!isCategorized(tx)) {
      toast.error("Add this transaction to your books before matching it to the statement.");
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tx.id)) next.delete(tx.id);
      else next.add(tx.id);
      return next;
    });
  }

  function selectAll() {
    if (
      selectableTransactions.length > 0 &&
      selectedIds.size === selectableTransactions.length
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableTransactions.map((t) => t.id)));
    }
  }

  async function bulkAction(action: "reconcile" | "exclude") {
    if (!orgId || selectedIds.size === 0) return;
    setActing(true);
    const headers = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
    };

    let success = 0;
    for (const txId of selectedIds) {
      try {
        const res = await fetch(`/api/v1/bank-transactions/${txId}/${action}`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });
        if (res.ok) success++;
      } catch {
        // continue
      }
    }

    const label = action === "reconcile" ? "Matched" : "Ignored";
    toast.success(`${label} ${success} transaction${success !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    setActing(false);
    fetchData();
  }

  async function createReconciliation() {
    if (!orgId) return;
    setSavingRec(true);
    try {
      const res = await fetch(`/api/v1/bank-accounts/${id}/reconciliations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          startDate: recForm.startDate,
          endDate: recForm.endDate,
          startBalance: Math.round(parseFloat(recForm.startBalance) * 100) || 0,
          endBalance: Math.round(parseFloat(recForm.endBalance) * 100) || 0,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Statement check started");
      setSheetOpen(false);
      setRecForm({ startDate: "", endDate: "", startBalance: "", endBalance: "" });
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't start the statement check"
      );
    } finally {
      setSavingRec(false);
    }
  }

  const selectedTotal = filteredTransactions
    .filter((t) => selectedIds.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  const unreconciledTotal = transactions.reduce((sum, t) => sum + t.amount, 0);

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => router.push(`/accounting/banking/${id}`)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight truncate">
            Match statement to your books · {account?.accountName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Tick off transactions that appear on your bank statement
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
          Check a statement
        </Button>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-3 divide-x">
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Account balance</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
              {formatMoney(account?.balance || 0)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Still to match</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
              {transactions.length}
              <span className="text-sm font-normal text-muted-foreground ml-1.5">
                ({formatMoney(unreconciledTotal)})
              </span>
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Selected</p>
            <p className={cn(
              "mt-1 text-xl font-semibold font-mono tabular-nums",
              selectedIds.size > 0
                ? selectedTotal < 0 ? "text-red-600" : "text-emerald-600"
                : "text-muted-foreground/30"
            )}>
              {selectedIds.size > 0 ? formatMoney(selectedTotal) : "-"}
              {selectedIds.size > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1.5">
                  ({selectedIds.size} items)
                </span>
              )}
            </p>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-t bg-muted/30">
            <Button
              size="sm"
              onClick={() => bulkAction("reconcile")}
              disabled={acting}
              className="bg-emerald-600 hover:bg-emerald-700"
              title="Tick off these lines as appearing on your bank statement"
            >
              <CheckCircle className="mr-1.5 size-3.5" />
              Mark {selectedIds.size} as on statement
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkAction("exclude")}
              disabled={acting}
              title="Leave these lines out of your books"
            >
              <XCircle className="mr-1.5 size-3.5" />
              Ignore {selectedIds.size}
            </Button>
            <div className="flex-1" />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Statement vs GL report + running difference + adjustment */}
      {report && account && (
        <ReconciliationReport
          data={report}
          currencyCode={account.currencyCode}
          orgId={orgId}
          bankAccountId={id}
          onChanged={fetchData}
        />
      )}

      {/* Transaction list */}
      {filteredTransactions.length === 0 && transactions.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <CheckCircle className="size-8 text-emerald-500 mx-auto" />
          <h3 className="mt-3 text-sm font-semibold">All caught up</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Nothing left to match to your statement.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search transactions..."
                className="pl-9 h-8 text-sm"
              />
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              onClick={selectAll}
              disabled={selectableTransactions.length === 0}
            >
              {selectableTransactions.length > 0 &&
              selectedIds.size === selectableTransactions.length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>

          {uncategorizedCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="font-medium">
                {uncategorizedCount} transaction{uncategorizedCount !== 1 ? "s" : ""} not in your books yet.
              </span>{" "}
              Assign {uncategorizedCount !== 1 ? "them" : "it"} to a category or match {uncategorizedCount !== 1 ? "them" : "it"} from the
              bank account page first — only lines that are in your books can be matched to the statement.
            </div>
          )}

          <div className="rounded-lg border divide-y">
            {filteredTransactions.map((tx) => {
              const selected = selectedIds.has(tx.id);
              const isIncome = tx.amount >= 0;
              const categorized = isCategorized(tx);
              return (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => toggleSelect(tx)}
                  aria-disabled={!categorized}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    !categorized
                      ? "cursor-not-allowed opacity-60 hover:bg-muted/20"
                      : selected
                        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                        : "hover:bg-muted/40"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded transition-colors",
                      !categorized
                        ? "border border-dashed border-muted-foreground/30"
                        : selected
                          ? "bg-emerald-600 text-white"
                          : "border border-muted-foreground/25"
                    )}
                  >
                    {selected && categorized && <Check className="size-3" />}
                  </div>

                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    isIncome
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                  )}>
                    {isIncome ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      {categorized && tx.accountName && (
                        <span className="text-xs text-muted-foreground truncate shrink min-w-0">
                          &rarr; {tx.accountName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{tx.date}</span>
                      {tx.reference && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-xs text-muted-foreground">{tx.reference}</span>
                        </>
                      )}
                      {!categorized && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            Add to your books first
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <p className={cn(
                    "font-mono text-sm font-medium tabular-nums shrink-0",
                    isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  )}>
                    {isIncome ? "+" : ""}{formatMoney(tx.amount)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Past reconciliations */}
      {reconciliations.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold">Past statement checks</h3>
          <div className="rounded-lg border divide-y">
            {reconciliations.map((rec) => (
              <div key={rec.id} className="flex items-center gap-4 px-4 py-3">
                <Calendar className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {rec.startDate} to {rec.endDate}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatMoney(rec.startBalance)} to {formatMoney(rec.endBalance)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    rec.status === "completed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  {rec.status === "completed" ? "Completed" : "In Progress"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Reconciliation Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
            <div>
              <SheetTitle className="text-lg">Check a statement</SheetTitle>
              <SheetDescription>
                Enter your bank statement dates and balances to start checking it against your books.
              </SheetDescription>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Statement Period
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <DatePicker
                    value={recForm.startDate}
                    onChange={(v) =>
                      setRecForm({ ...recForm, startDate: v })
                    }
                    placeholder="Select date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <DatePicker
                    value={recForm.endDate}
                    onChange={(v) =>
                      setRecForm({ ...recForm, endDate: v })
                    }
                    placeholder="Select date"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Statement Balances
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Opening Balance</Label>
                  <CurrencyInput
                    prefix="$"
                    value={recForm.startBalance}
                    onChange={(v) =>
                      setRecForm({ ...recForm, startBalance: v })
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Closing Balance</Label>
                  <CurrencyInput
                    prefix="$"
                    value={recForm.endBalance}
                    onChange={(v) =>
                      setRecForm({ ...recForm, endBalance: v })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createReconciliation}
              disabled={!recForm.startDate || !recForm.endDate || savingRec}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {savingRec ? "Starting..." : "Start checking"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
