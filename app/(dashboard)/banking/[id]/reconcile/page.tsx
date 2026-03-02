"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Search,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newRecOpen, setNewRecOpen] = useState(false);
  const [recForm, setRecForm] = useState({
    startDate: "",
    endDate: "",
    startBalance: "",
    endBalance: "",
  });
  const [savingRec, setSavingRec] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch(`/api/v1/bank-accounts/${id}`, { headers }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/transactions?status=unreconciled&limit=100`, {
        headers,
      }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/reconciliations`, {
        headers,
      }).then((r) => r.json()),
    ])
      .then(([accountData, txData, recData]) => {
        if (accountData.bankAccount) setAccount(accountData.bankAccount);
        if (txData.data) setTransactions(txData.data);
        if (recData.data) setReconciliations(recData.data);
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

  function toggleSelect(txId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  }

  async function reconcileSelected() {
    if (!orgId || selectedIds.size === 0) return;
    const headers = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
    };

    let success = 0;
    for (const txId of selectedIds) {
      try {
        const res = await fetch(`/api/v1/bank-transactions/${txId}/reconcile`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });
        if (res.ok) success++;
      } catch {
        // continue with remaining
      }
    }

    toast.success(`Reconciled ${success} transaction${success !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
    fetchData();
  }

  async function excludeSelected() {
    if (!orgId || selectedIds.size === 0) return;
    const headers = {
      "Content-Type": "application/json",
      "x-organization-id": orgId,
    };

    let success = 0;
    for (const txId of selectedIds) {
      try {
        const res = await fetch(`/api/v1/bank-transactions/${txId}/exclude`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });
        if (res.ok) success++;
      } catch {
        // continue with remaining
      }
    }

    toast.success(`Excluded ${success} transaction${success !== 1 ? "s" : ""}`);
    setSelectedIds(new Set());
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
      toast.success("Reconciliation created");
      setNewRecOpen(false);
      setRecForm({ startDate: "", endDate: "", startBalance: "", endBalance: "" });
      fetchData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create reconciliation"
      );
    } finally {
      setSavingRec(false);
    }
  }

  const selectedTotal = filteredTransactions
    .filter((t) => selectedIds.has(t.id))
    .reduce((sum, t) => sum + t.amount, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reconcile" description="Loading..." />
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading transactions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/banking/${id}`)}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={`Reconcile: ${account?.accountName || ""}`}
          description="Match and reconcile bank transactions."
        >
          <Button
            variant="outline"
            onClick={() => setNewRecOpen(true)}
          >
            New Reconciliation
          </Button>
        </PageHeader>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Statement Balance
          </p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums">
            {formatMoney(account?.balance || 0)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Unreconciled
          </p>
          <p className="mt-1 text-xl font-bold font-mono tabular-nums">
            {transactions.length} transactions
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Selected Total
          </p>
          <p
            className={`mt-1 text-xl font-bold font-mono tabular-nums ${
              selectedTotal < 0 ? "text-red-600" : selectedTotal > 0 ? "text-emerald-600" : ""
            }`}
          >
            {formatMoney(selectedTotal)}
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedIds.size} selected
          </p>
        </div>
      </div>

      {/* Search and actions */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            {selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0
              ? "Deselect All"
              : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                onClick={reconcileSelected}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle className="mr-1 size-3" />
                Reconcile ({selectedIds.size})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={excludeSelected}
              >
                <XCircle className="mr-1 size-3" />
                Exclude ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Transaction list */}
      {filteredTransactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
            <CheckCircle className="size-6 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">All caught up!</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            No unreconciled transactions to review.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {filteredTransactions.map((tx) => (
            <div
              key={tx.id}
              onClick={() => toggleSelect(tx.id)}
              className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${
                selectedIds.has(tx.id)
                  ? "bg-emerald-50 border-l-2 border-l-emerald-500"
                  : "hover:bg-muted/50"
              }`}
            >
              {/* Checkbox */}
              <div
                className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                  selectedIds.has(tx.id)
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "border-gray-300"
                }`}
              >
                {selectedIds.has(tx.id) && (
                  <CheckCircle className="size-3" />
                )}
              </div>

              {/* Icon */}
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  tx.amount >= 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {tx.amount >= 0 ? (
                  <ArrowLeftRight className="size-4" />
                ) : (
                  <ArrowLeftRight className="size-4" />
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {tx.description}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {tx.date}
                  </span>
                  {tx.reference && (
                    <span className="text-xs text-muted-foreground">
                      Ref: {tx.reference}
                    </span>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div className="text-right shrink-0">
                <p
                  className={`font-mono text-sm font-medium tabular-nums ${
                    tx.amount < 0 ? "text-red-600" : "text-emerald-600"
                  }`}
                >
                  {tx.amount >= 0 ? "+" : ""}
                  {formatMoney(tx.amount)}
                </p>
              </div>

              {/* Status */}
              <Badge
                variant="outline"
                className={statusColors[tx.status] || ""}
              >
                {tx.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Past reconciliations */}
      {reconciliations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Past Reconciliations</h3>
          <div className="rounded-lg border divide-y">
            {reconciliations.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {rec.startDate} to {rec.endDate}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Balance: {formatMoney(rec.startBalance)} to{" "}
                    {formatMoney(rec.endBalance)}
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

      {/* New Reconciliation Dialog */}
      <Dialog open={newRecOpen} onOpenChange={setNewRecOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={recForm.startDate}
                  onChange={(e) =>
                    setRecForm({ ...recForm, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={recForm.endDate}
                  onChange={(e) =>
                    setRecForm({ ...recForm, endDate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Opening Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recForm.startBalance}
                  onChange={(e) =>
                    setRecForm({ ...recForm, startBalance: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Closing Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recForm.endBalance}
                  onChange={(e) =>
                    setRecForm({ ...recForm, endBalance: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRecOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createReconciliation}
              disabled={
                !recForm.startDate || !recForm.endDate || savingRec
              }
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {savingRec ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const statusColors: Record<string, string> = {
  unreconciled: "border-amber-200 bg-amber-50 text-amber-700",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excluded: "border-gray-200 bg-gray-50 text-gray-700",
};
