"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  currencyCode: string;
  balance: number;
  isActive: boolean;
  chartAccount: { id: string; name: string; code: string } | null;
}

const columns: Column<BankAccount>[] = [
  {
    key: "name",
    header: "Account Name",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.accountName}</p>
        {r.bankName && (
          <p className="text-xs text-muted-foreground">{r.bankName}</p>
        )}
      </div>
    ),
  },
  {
    key: "number",
    header: "Account Number",
    className: "w-40",
    render: (r) => (
      <span className="font-mono text-sm text-muted-foreground">
        {r.accountNumber ? `****${r.accountNumber.slice(-4)}` : "-"}
      </span>
    ),
  },
  {
    key: "glAccount",
    header: "GL Account",
    className: "w-40",
    render: (r) => (
      <span className="text-sm text-muted-foreground">
        {r.chartAccount ? `${r.chartAccount.code} - ${r.chartAccount.name}` : "-"}
      </span>
    ),
  },
  {
    key: "currency",
    header: "Currency",
    className: "w-24",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.currencyCode}</span>
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
          r.isActive
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-gray-200 bg-gray-50 text-gray-700"
        }
      >
        {r.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    key: "balance",
    header: "Balance",
    className: "w-32 text-right",
    render: (r) => (
      <span
        className={`font-mono text-sm tabular-nums ${
          r.balance < 0 ? "text-red-600" : ""
        }`}
      >
        {formatMoney(r.balance, r.currencyCode)}
      </span>
    ),
  },
];

export default function BankingPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
    bankName: "",
    currencyCode: "USD",
  });
  const [saving, setSaving] = useState(false);

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/bank-accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.bankAccounts) setAccounts(data.bankAccounts);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function createAccount() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/bank-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          accountName: form.accountName,
          accountNumber: form.accountNumber || null,
          bankName: form.bankName || null,
          currencyCode: form.currencyCode,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Bank account created");
      setDialogOpen(false);
      setForm({ accountName: "", accountNumber: "", bankName: "", currencyCode: "USD" });
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bank account");
    } finally {
      setSaving(false);
    }
  }

  if (!loading && accounts.length === 0) {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Bank Accounts" description="Connect and manage your bank accounts for importing and reconciling transactions.">
          <EmptyState
            icon={Landmark}
            title="No bank accounts"
            description="Add a bank account to start importing and reconciling transactions."
          >
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Bank Account
            </Button>
          </EmptyState>
        </Section>
        <CreateAccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          form={form}
          setForm={setForm}
          onSubmit={createAccount}
          loading={saving}
        />
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="Banking and connected accounts summary across balances and statuses.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className="rounded-lg border bg-card p-4 space-y-2 cursor-pointer hover:border-foreground/20 transition-colors"
                onClick={() => router.push(`/accounting/banking/${acc.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark className="size-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium truncate">{acc.accountName}</p>
                  </div>
                  <span className={`size-2 rounded-full shrink-0 ${acc.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />
                </div>
                {acc.bankName && (
                  <p className="text-xs text-muted-foreground">{acc.bankName}</p>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    {acc.accountNumber ? `****${acc.accountNumber.slice(-4)}` : "-"}
                  </span>
                  <span className={`font-mono text-lg font-semibold tabular-nums ${acc.balance < 0 ? "text-red-600" : ""}`}>
                    {formatMoney(acc.balance, acc.currencyCode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              Add Bank Account
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Bank Accounts" description="View and manage all connected bank accounts.">
        <DataTable
          columns={columns}
          data={accounts}
          loading={loading}
          emptyMessage="No bank accounts found."
          onRowClick={(r) => router.push(`/accounting/banking/${r.id}`)}
        />
      </Section>

      <CreateAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        onSubmit={createAccount}
        loading={saving}
      />
    </BlurReveal>
  );
}

function CreateAccountDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    currencyCode: string;
  };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Account Name</Label>
            <Input
              value={form.accountName}
              onChange={(e) =>
                setForm({ ...form, accountName: e.target.value })
              }
              placeholder="Business Checking"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Bank Name</Label>
              <Input
                value={form.bankName}
                onChange={(e) =>
                  setForm({ ...form, bankName: e.target.value })
                }
                placeholder="First National Bank"
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) =>
                  setForm({ ...form, accountNumber: e.target.value })
                }
                placeholder="****1234"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input
              value={form.currencyCode}
              onChange={(e) =>
                setForm({ ...form, currencyCode: e.target.value })
              }
              placeholder="USD"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.accountName || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Add Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
