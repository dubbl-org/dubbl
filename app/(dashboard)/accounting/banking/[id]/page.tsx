"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  ArrowLeftRight,
  ArrowDownCircle,
  ArrowUpCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";

interface BankAccountDetail {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  currencyCode: string;
  balance: number;
  isActive: boolean;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: "unreconciled" | "reconciled" | "excluded";
}

const statusColors: Record<string, string> = {
  unreconciled: "border-amber-200 bg-amber-50 text-amber-700",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excluded: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<Transaction>[] = [
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
    className: "w-32",
    render: (r) => (
      <Badge variant="outline" className={statusColors[r.status] || ""}>
        {r.status}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-32 text-right",
    render: (r) => (
      <span
        className={`font-mono text-sm tabular-nums ${
          r.amount < 0 ? "text-red-600" : "text-emerald-600"
        }`}
      >
        {r.amount >= 0 ? "+" : ""}
        {formatMoney(r.amount)}
      </span>
    ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "w-32 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {r.balance != null ? formatMoney(r.balance) : "-"}
      </span>
    ),
  },
];

export default function BankAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch(`/api/v1/bank-accounts/${id}`, { headers }).then((r) => r.json()),
      fetch(
        `/api/v1/bank-accounts/${id}/transactions${
          statusFilter !== "all" ? `?status=${statusFilter}` : ""
        }`,
        { headers }
      ).then((r) => r.json()),
    ])
      .then(([accountData, txData]) => {
        if (accountData.bankAccount) setAccount(accountData.bankAccount);
        if (txData.data) setTransactions(txData.data);
      })
      .finally(() => setLoading(false));
  }, [id, orgId, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function importCSV() {
    if (!orgId) return;
    setImporting(true);
    try {
      const res = await fetch(
        `/api/v1/bank-accounts/${id}/transactions/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": orgId,
          },
          body: JSON.stringify({ csv: csvText }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast.success(`Imported ${data.imported} transactions`);
      setImportOpen(false);
      setCsvText("");
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to import CSV"
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleReconcile(txId: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/bank-transactions/${txId}/reconcile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Transaction reconciled");
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reconcile"
      );
    }
  }

  async function handleExclude(txId: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/bank-transactions/${txId}/exclude`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Transaction status updated");
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status"
      );
    }
  }

  const unreconciledCount = transactions.filter(
    (t) => t.status === "unreconciled"
  ).length;
  const reconciledCount = transactions.filter(
    (t) => t.status === "reconciled"
  ).length;
  const credits = transactions
    .filter((t) => t.amount > 0 && t.status !== "excluded")
    .reduce((sum, t) => sum + t.amount, 0);
  const debits = transactions
    .filter((t) => t.amount < 0 && t.status !== "excluded")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const actionColumns: Column<Transaction>[] = [
    ...columns,
    {
      key: "actions",
      header: "",
      className: "w-24",
      render: (r) => (
        <div className="flex items-center gap-1">
          {r.status === "unreconciled" && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleReconcile(r.id);
                }}
                className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                title="Reconcile"
              >
                <CheckCircle className="size-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleExclude(r.id);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-50"
                title="Exclude"
              >
                <XCircle className="size-4" />
              </button>
            </>
          )}
          {r.status === "excluded" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExclude(r.id);
              }}
              className="rounded p-1 text-amber-600 hover:bg-amber-50"
              title="Restore"
            >
              <ArrowLeftRight className="size-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/accounting/banking")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={account?.accountName || "Bank Account"}
          description={
            account
              ? [account.bankName, account.accountNumber ? `****${account.accountNumber.slice(-4)}` : null]
                  .filter(Boolean)
                  .join(" - ") || "Bank account transactions"
              : "Loading..."
          }
        >
          <Button
            variant="outline"
            onClick={() => router.push(`/accounting/banking/${id}/reconcile`)}
          >
            <CheckCircle className="mr-2 size-4" />
            Reconcile
          </Button>
          <Button
            onClick={() => setImportOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Upload className="mr-2 size-4" />
            Import CSV
          </Button>
        </PageHeader>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          title="Current Balance"
          value={formatMoney(account?.balance || 0)}
          icon={ArrowLeftRight}
        />
        <StatCard
          title="Money In"
          value={formatMoney(credits)}
          icon={ArrowDownCircle}
          changeType="positive"
        />
        <StatCard
          title="Money Out"
          value={formatMoney(debits)}
          icon={ArrowUpCircle}
          changeType="negative"
        />
        <StatCard
          title="Unreconciled"
          value={unreconciledCount.toString()}
          change={`${reconciledCount} reconciled`}
          icon={CheckCircle}
        />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unreconciled">Unreconciled</TabsTrigger>
          <TabsTrigger value="reconciled">Reconciled</TabsTrigger>
          <TabsTrigger value="excluded">Excluded</TabsTrigger>
        </TabsList>
      </Tabs>

      {!loading && transactions.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions"
          description="Import a CSV bank statement to get started."
        >
          <Button
            onClick={() => setImportOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Upload className="mr-2 size-4" />
            Import CSV
          </Button>
        </EmptyState>
      ) : (
        <DataTable
          columns={actionColumns}
          data={transactions}
          loading={loading}
          emptyMessage="No transactions found."
        />
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Bank Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paste CSV Data</Label>
              <Textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={`Date,Description,Amount\n2025-01-15,Coffee Shop,-4.50\n2025-01-15,Payment Received,1500.00`}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Supported formats: Date/Description/Amount,
              Date/Description/Debit/Credit, or similar CSV layouts. The first
              row should be column headers.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={importCSV}
              disabled={!csvText.trim() || importing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
