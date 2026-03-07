"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CircleDot, Plus, ArrowUpRight, Waves } from "lucide-react";
import { toast } from "sonner";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { Section } from "@/components/dashboard/section";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type BankAccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "loan"
  | "investment"
  | "other";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string | null;
  bankName: string | null;
  currencyCode: string;
  countryCode: string | null;
  accountType: BankAccountType;
  color: string;
  balance: number;
  isActive: boolean;
}

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
  cash: "Cash",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

const ACCOUNT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function BankingPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    accountName: "",
    accountNumber: "",
    bankName: "",
    currencyCode: "USD",
    countryCode: "",
    accountType: "checking" as BankAccountType,
    color: ACCOUNT_COLORS[0],
  });

  function fetchAccounts() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/bank-accounts", {
      headers: { "x-organization-id": orgId },
    })
      .then((res) => res.json())
      .then((data) => setAccounts(data.bankAccounts || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  const totals = useMemo(() => {
    const active = accounts.filter((a) => a.isActive).length;
    const balance = accounts.reduce((sum, a) => sum + a.balance, 0);
    return { active, balance };
  }, [accounts]);

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
          countryCode: form.countryCode || null,
          accountType: form.accountType,
          color: form.color,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Bank account created");
      setDrawerOpen(false);
      setForm({
        accountName: "",
        accountNumber: "",
        bankName: "",
        currencyCode: "USD",
        countryCode: "",
        accountType: "checking",
        color: ACCOUNT_COLORS[(accounts.length + 1) % ACCOUNT_COLORS.length],
      });
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create bank account");
    } finally {
      setSaving(false);
    }
  }

  if (loading && accounts.length === 0) return <BrandLoader />;

  // Empty state
  if (!loading && accounts.length === 0) {
    return (
      <BlurReveal>
        <div className="flex flex-col items-center gap-10 pt-16 pb-12">
          <div className="w-full max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-0">
              {[
                { step: "1", label: "Add account", sub: "Create a bank account with currency and type", color: "bg-blue-500", ring: "ring-blue-200 dark:ring-blue-900" },
                { step: "2", label: "Import", sub: "Upload statements in CSV, OFX, CAMT, and more", color: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-900" },
                { step: "3", label: "Reconcile", sub: "Match transactions to invoices and bills", color: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-900" },
              ].map(({ step, label, sub, color, ring }, i) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  {i < 2 && (
                    <div className="hidden sm:block absolute top-4 left-[calc(50%+16px)] w-[calc(100%-32px)] h-px bg-border" />
                  )}
                  <div className={`relative z-10 flex size-8 items-center justify-center rounded-full ${color} ring-4 ${ring} text-white text-xs font-bold`}>
                    {step}
                  </div>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[150px] leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">Connect your first account</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Add a bank account to start importing statements and tracking balances.</p>
            <Button
              onClick={() => setDrawerOpen(true)}
              size="lg"
              className="mt-5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Bank Account
            </Button>
          </div>

          <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-3 gap-3 opacity-40">
            {[
              { label: "Total Balance", value: "$0.00" },
              { label: "Accounts", value: "0" },
              { label: "Live Sync", value: "Coming soon" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-dashed p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-mono font-medium text-muted-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <CreateAccountDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          form={form}
          setForm={setForm}
          onSubmit={createAccount}
          loading={saving}
        />
      </BlurReveal>
    );
  }

  const positiveBalance = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const negativeBalance = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Math.abs(a.balance), 0);
  const currencies = [...new Set(accounts.map((a) => a.currencyCode))];

  return (
    <BlurReveal className="space-y-6 sm:space-y-10">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Total Balance</p>
          <p className="mt-0.5 font-mono text-lg sm:text-xl font-semibold tabular-nums">{formatMoney(totals.balance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />Money In
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(positiveBalance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span className="size-2 rounded-full bg-red-500" />Money Out
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(negativeBalance)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Accounts</p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{accounts.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{totals.active} active{currencies.length > 1 ? ` · ${currencies.length} currencies` : ""}</p>
        </div>
      </div>

      <div className="h-px bg-border" />

      <Section title="Bank Accounts" description="Manage accounts, balances, and statement imports.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{accounts.length}</span> accounts
              <span className="text-border">·</span>
              <span className="tabular-nums">{totals.active} active</span>
              {currencies.length > 1 && (
                <>
                  <span className="text-border">·</span>
                  <span>{currencies.length} currencies</span>
                </>
              )}
            </div>
            <Button
              onClick={() => setDrawerOpen(true)}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Account
            </Button>
          </div>

          <div className="rounded-lg border divide-y">
            {accounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => router.push(`/accounting/banking/${account.id}`)}
                className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
              >
                {/* Icon */}
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: account.color + "18", color: account.color }}
                >
                  <CircleDot className="size-5" />
                </div>

                {/* Name + bank */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{account.accountName}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {ACCOUNT_TYPE_LABELS[account.accountType]}
                    </Badge>
                    {!account.isActive && (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[account.bankName, account.countryCode, account.accountNumber ? `····${account.accountNumber.slice(-4)}` : null]
                      .filter(Boolean)
                      .join(" · ") || "Manual imports"}
                  </p>
                </div>

                {/* Balance */}
                <div className="text-right shrink-0">
                  <p className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    account.balance > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : account.balance < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  )}>
                    {formatMoney(account.balance, account.currencyCode)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{account.currencyCode}</p>
                </div>

                {/* Arrow */}
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="flex items-center gap-3 py-2 text-muted-foreground">
        <Waves className="size-3.5 shrink-0" />
        <p className="text-xs">Live bank sync coming soon. For now, import statements manually.</p>
      </div>

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        form={form}
        setForm={setForm}
        onSubmit={createAccount}
        loading={saving}
      />
    </BlurReveal>
  );
}

// ---------------------------------------------------------------------------
// Create Account Drawer
// ---------------------------------------------------------------------------
function CreateAccountDrawer({
  open,
  onOpenChange,
  form,
  setForm,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    currencyCode: string;
    countryCode: string;
    accountType: BankAccountType;
    color: string;
  };
  setForm: (value: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    currencyCode: string;
    countryCode: string;
    accountType: BankAccountType;
    color: string;
  }) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Building2 className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">New Bank Account</SheetTitle>
              <SheetDescription>Add an account to track transactions and import statements.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account Details</p>
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                placeholder="Global Operating Account"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input
                  value={form.bankName}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="Revolut Business"
                />
              </div>
              <div className="space-y-2">
                <Label>Account Type</Label>
                <Select
                  value={form.accountType}
                  onValueChange={(value) =>
                    setForm({ ...form, accountType: value as BankAccountType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account Number / IBAN</Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                placeholder="1234 or GB29NWBK..."
              />
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Region &amp; Currency</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={form.currencyCode}
                  onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
                  placeholder="USD"
                  maxLength={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                  placeholder="US"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Accent Color</p>
            <div className="flex gap-2">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    "size-6 rounded-full ring-2 ring-transparent transition-all",
                    form.color === c && "ring-offset-2 ring-gray-400"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Choose ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.accountName.trim() || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Create Account"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
