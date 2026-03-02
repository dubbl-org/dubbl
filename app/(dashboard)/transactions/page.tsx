"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  reference: string | null;
  status: "draft" | "posted" | "void";
  totalDebit: string;
  createdAt: string;
}

const columns: Column<Entry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entryNumber}
      </span>
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
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.description}</p>
        {r.reference && (
          <p className="text-xs text-muted-foreground">{r.reference}</p>
        )}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge
        variant="outline"
        className={
          r.status === "posted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : r.status === "void"
            ? "border-red-200 bg-red-50 text-red-700"
            : ""
        }
      >
        {r.status}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(Math.round(parseFloat(r.totalDebit) * 100))}
      </span>
    ),
  },
];

export default function TransactionsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/entries", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!loading && entries.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Transactions" description="Manage journal entries." />
        <EmptyState
          icon={ArrowLeftRight}
          title="No journal entries"
          description="Create your first journal entry to start tracking your finances."
        >
          <Button
            onClick={() => router.push("/transactions/new")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Entry
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Transactions" description="Manage journal entries.">
        <Button
          onClick={() => router.push("/transactions/new")}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Entry
        </Button>
      </PageHeader>
      <DataTable
        columns={columns}
        data={entries}
        loading={loading}
        emptyMessage="No entries found."
        onRowClick={(r) => router.push(`/transactions/${r.id}`)}
      />
    </div>
  );
}
