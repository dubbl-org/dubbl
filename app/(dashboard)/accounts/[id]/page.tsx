"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Skeleton } from "@/components/ui/skeleton";

interface LedgerEntry {
  entryId: string;
  entryNumber: number;
  date: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  balance: string;
}

interface AccountDetail {
  id: string;
  code: string;
  name: string;
  type: string;
  balance: string;
}

const columns: Column<LedgerEntry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <a
        href={`/transactions/${r.entryId}`}
        className="font-mono text-xs text-emerald-600 hover:underline"
      >
        {r.entryNumber}
      </a>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (r) => <span className="text-sm">{r.description}</span>,
  },
  {
    key: "debit",
    header: "Debit",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {parseFloat(r.debitAmount) > 0 ? parseFloat(r.debitAmount).toFixed(2) : ""}
      </span>
    ),
  },
  {
    key: "credit",
    header: "Credit",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {parseFloat(r.creditAmount) > 0 ? parseFloat(r.creditAmount).toFixed(2) : ""}
      </span>
    ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm font-medium tabular-nums">
        {parseFloat(r.balance).toFixed(2)}
      </span>
    ),
  },
];

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<AccountDetail | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/accounts/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.account) setAccount(data.account);
        if (data.ledger) setLedger(data.ledger);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!account) {
    return <p className="text-muted-foreground">Account not found.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${account.code} · ${account.name}`}
        description={`Account ledger for this ${account.type} account.`}
      >
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="text-xl font-bold font-mono tabular-nums">
            {parseFloat(account.balance).toFixed(2)}
          </p>
        </div>
      </PageHeader>
      <DataTable
        columns={columns}
        data={ledger}
        emptyMessage="No transactions in this account yet."
      />
    </div>
  );
}
