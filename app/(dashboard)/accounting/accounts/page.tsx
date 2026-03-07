"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";


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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subType: string | null;
  isActive: boolean;
  description: string | null;
  currencyCode: string;
}

const TYPE_COLORS: Record<string, string> = {
  asset: "border-blue-200 bg-blue-50 text-blue-700",
  liability: "border-orange-200 bg-orange-50 text-orange-700",
  equity: "border-purple-200 bg-purple-50 text-purple-700",
  revenue: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expense: "border-red-200 bg-red-50 text-red-700",
};

const TYPE_BORDER_COLORS: Record<string, string> = {
  asset: "border-l-blue-500",
  liability: "border-l-orange-500",
  equity: "border-l-purple-500",
  revenue: "border-l-emerald-500",
  expense: "border-l-red-500",
};

const ALL_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

const columns: Column<Account>[] = [
  {
    key: "code",
    header: "Code",
    className: "w-24",
    render: (r) => <span className="font-mono text-sm">{r.code}</span>,
  },
  {
    key: "name",
    header: "Name",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.name}</p>
        {r.description && (
          <p className="text-xs text-muted-foreground truncate max-w-xs">
            {r.description}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={TYPE_COLORS[r.type] || ""}>
        {r.type}
      </Badge>
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
    className: "w-20",
    render: (r) => (
      <span className={`text-xs ${r.isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
        {r.isActive ? "Active" : "Inactive"}
      </span>
    ),
  },
];

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    type: "asset",
    subType: "",
    description: "",
    currencyCode: "USD",
  });
  const [saving, setSaving] = useState(false);

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
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
      const res = await fetch("/api/v1/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          ...form,
          subType: form.subType || null,
          description: form.description || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Account created");
      setDialogOpen(false);
      setForm({ code: "", name: "", type: "asset", subType: "", description: "", currencyCode: "USD" });
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSaving(false);
    }
  }

  const typeBreakdown = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  if (!loading && accounts.length === 0) {
    return (
      <BlurReveal>
        <div className="min-h-[60vh] flex flex-col justify-center gap-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Chart of Accounts</h2>
              <p className="text-sm text-muted-foreground mt-1">Organize where money comes from and where it goes.</p>
            </div>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Account
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ALL_TYPES.map((type) => (
              <div
                key={type}
                className={`rounded-lg border border-dashed border-t-4 ${TYPE_BORDER_COLORS[type].replace("border-l-", "border-t-")} p-4 space-y-3 opacity-50`}
              >
                <p className="text-sm font-medium capitalize">{type}</p>
                <p className="text-2xl font-mono font-semibold tabular-nums text-muted-foreground/30">0</p>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                  {type === "asset" ? "Cash, receivables, equipment" :
                   type === "liability" ? "Payables, loans, credit cards" :
                   type === "equity" ? "Owner capital, retained earnings" :
                   type === "revenue" ? "Sales, service income, interest" :
                   "Rent, payroll, supplies"}
                </p>
              </div>
            ))}
          </div>
        </div>
        <AccountDialog
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
    <BlurReveal className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="Chart of accounts summary across all account types and statuses.">
        <div className="space-y-4">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {ALL_TYPES.map((type) => (
              <div
                key={type}
                className={`rounded-lg border border-l-4 ${TYPE_BORDER_COLORS[type]} bg-card p-4`}
              >
                <p className="text-xs font-medium text-muted-foreground capitalize">{type}</p>
                <p className="text-2xl font-semibold mt-1 tabular-nums">{typeBreakdown[type] || 0}</p>
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
              New Account
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Accounts" description="View and manage all accounts in your chart of accounts.">
        <DataTable
          columns={columns}
          data={accounts}
          loading={loading}
          onRowClick={(r) => router.push(`/accounting/accounts/${r.id}`)}
        />
      </Section>

      <AccountDialog
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

function AccountDialog({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: { code: string; name: string; type: string; subType: string; description: string; currencyCode: string };
  setForm: (f: typeof form) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl">
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="1000"
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Cash"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Input
                value={form.currencyCode}
                onChange={(e) => setForm({ ...form, currencyCode: e.target.value })}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Account description..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.code || !form.name || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
