"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, BookOpen } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";

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
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const entryColumns: Column<LedgerEntry>[] = [
  { key: "date", header: "Date", className: "w-28", render: (r) => <span className="text-sm">{r.date}</span> },
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
        if (!cancelled) setAccounts(data.accounts || []);
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
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <BookOpen className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">No entries found</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No posted journal entries in the selected date range.
            </p>
          </div>
      ) : (
        <div>
          <div className="space-y-6">
            {accounts.map((acct) => (
              <div key={acct.accountId} className="space-y-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-sm sm:text-base font-semibold">
                    <span className="font-mono text-xs sm:text-sm text-muted-foreground mr-2">{acct.accountCode}</span>
                    {acct.accountName}
                  </h2>
                  <span className="text-xs sm:text-sm text-muted-foreground capitalize">{acct.accountType}</span>
                </div>
                <DataTable columns={entryColumns} data={acct.entries} emptyMessage="No entries." />
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                  <span>Account Total</span>
                  <div className="flex gap-3 sm:gap-6 font-mono tabular-nums text-xs sm:text-sm">
                    <span>Dr: {formatMoney(acct.totalDebit)}</span>
                    <span>Cr: {formatMoney(acct.totalCredit)}</span>
                    <span>Bal: {formatMoney(acct.balance)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ContentReveal>
  );
}
