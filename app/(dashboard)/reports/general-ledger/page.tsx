"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface LedgerEntry {
  date: string;
  entryNumber: number;
  description: string;
  reference: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface AccountLedger {
  accountId: string;
  accountName: string;
  accountCode: string;
  accountType: string;
  entries: LedgerEntry[];
  totalEntries: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const entryColumns: Column<LedgerEntry>[] = [
  { key: "date", header: "Date", className: "w-28", render: (r) => <span className="text-sm">{new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> },
  { key: "entry", header: "Entry #", className: "w-24", render: (r) => <span className="font-mono text-sm">{r.entryNumber}</span> },
  { key: "desc", header: "Description", render: (r) => <span className="text-sm">{r.description}</span> },
  { key: "ref", header: "Reference", className: "w-28", render: (r) => <span className="text-sm text-muted-foreground">{r.reference || "-"}</span> },
  { key: "debit", header: "Debit", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{r.debit ? formatMoney(r.debit) : ""}</span> },
  { key: "credit", header: "Credit", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{r.credit ? formatMoney(r.credit) : ""}</span> },
  { key: "balance", header: "Balance", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.runningBalance)}</span> },
];

export default function GeneralLedgerPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [accounts, setAccounts] = useState<AccountLedger[]>([]);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set());

  const toggleAccount = useCallback((accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  const loadMoreEntries = useCallback(async (accountId: string) => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const acct = accounts.find((a) => a.accountId === accountId);
    if (!acct) return;

    setLoadingMore((prev) => new Set(prev).add(accountId));
    try {
      const offset = acct.entries.length;
      const params = new URLSearchParams({ startDate, endDate, accountId, offset: String(offset), limit: "200" });
      const res = await fetch(`/api/v1/reports/general-ledger?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.entries?.length) {
        setAccounts((prev) => prev.map((a) =>
          a.accountId === accountId
            ? { ...a, entries: [...a.entries, ...data.entries] }
            : a
        ));
      }
    } finally {
      setLoadingMore((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  }, [accounts, startDate, endDate]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/general-ledger?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          const accts = data.accounts || [];
          setAccounts(accts);
          setExpandedAccounts(new Set(accts.map((a: AccountLedger) => a.accountId)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="General Ledger"
        description="All journal lines grouped by account with running balance."
      >
        {accounts.length > 0 && (
          <ExportButton
            data={accounts.flatMap((a) => a.entries.map((e) => ({ account: a.accountCode, accountName: a.accountName, ...e })))}
            columns={["account", "accountName", "date", "entryNumber", "description", "reference", "debit", "credit", "runningBalance"]}
            filename="general-ledger"
          />
        )}
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : accounts.length === 0 ? (
        <ContentReveal>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">No entries found</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No posted journal entries in the selected date range.
            </p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} · {accounts.reduce((s, a) => s + a.totalEntries, 0)} entries
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setExpandedAccounts(new Set(accounts.map((a) => a.accountId)))}>
                  Expand all
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setExpandedAccounts(new Set())}>
                  Collapse all
                </Button>
              </div>
            </div>
            {accounts.map((acct) => {
              const isExpanded = expandedAccounts.has(acct.accountId);
              const hasMore = acct.entries.length < acct.totalEntries;
              const isLoading = loadingMore.has(acct.accountId);

              return (
                <div key={acct.accountId} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggleAccount(acct.accountId)}
                    className="flex w-full items-center justify-between px-3 py-2.5 sm:px-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                      <h2 className="text-sm sm:text-base font-semibold">
                        <span className="font-mono text-xs sm:text-sm text-muted-foreground mr-2">{acct.accountCode}</span>
                        {acct.accountName}
                      </h2>
                      <span className="text-xs text-muted-foreground capitalize hidden sm:inline">{acct.accountType}</span>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-6 font-mono tabular-nums text-xs sm:text-sm shrink-0">
                      <span className="hidden sm:inline text-muted-foreground">Dr: {formatMoney(acct.totalDebit)}</span>
                      <span className="hidden sm:inline text-muted-foreground">Cr: {formatMoney(acct.totalCredit)}</span>
                      <span className="font-semibold">Bal: {formatMoney(acct.balance)}</span>
                      <span className={cn("text-xs px-1.5 py-0.5 rounded-full", acct.totalEntries > 0 ? "bg-muted text-muted-foreground" : "text-muted-foreground/50")}>
                        {acct.totalEntries}
                      </span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div>
                      <DataTable columns={entryColumns} data={acct.entries} emptyMessage="No entries." />
                      {hasMore && (
                        <div className="border-t px-4 py-2 text-center">
                          <Button variant="ghost" size="sm" className="text-xs h-7" disabled={isLoading} onClick={() => loadMoreEntries(acct.accountId)}>
                            {isLoading ? "Loading..." : `Load more (${acct.entries.length} of ${acct.totalEntries})`}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
