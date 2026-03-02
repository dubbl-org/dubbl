"use client";

import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
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
  { key: "ref", header: "Reference", className: "w-28", render: (r) => <span className="text-sm text-muted-foreground">{r.reference || "—"}</span> },
  { key: "debit", header: "Debit", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{r.debit ? formatMoney(r.debit) : ""}</span> },
  { key: "credit", header: "Credit", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{r.credit ? formatMoney(r.credit) : ""}</span> },
  { key: "balance", header: "Balance", className: "w-28 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.runningBalance)}</span> },
];

export default function GeneralLedgerPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [accounts, setAccounts] = useState<AccountLedger[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/general-ledger?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAccounts(data.accounts || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
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
        <DataTable columns={entryColumns} data={[]} loading={true} />
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
        accounts.map((acct) => (
          <div key={acct.accountId} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                <span className="font-mono text-sm text-muted-foreground mr-2">{acct.accountCode}</span>
                {acct.accountName}
              </h2>
              <span className="text-sm text-muted-foreground capitalize">{acct.accountType}</span>
            </div>
            <DataTable columns={entryColumns} data={acct.entries} emptyMessage="No entries." />
            <div className="flex justify-between px-4 py-2 bg-muted/50 rounded-lg text-sm font-semibold">
              <span>Account Total</span>
              <div className="flex gap-6 font-mono tabular-nums">
                <span>Dr: {formatMoney(acct.totalDebit)}</span>
                <span>Cr: {formatMoney(acct.totalCredit)}</span>
                <span>Bal: {formatMoney(acct.balance)}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
