"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  CreditCard as CreditCardIcon,
  Banknote,
  ChevronRight,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { ContentReveal } from "@/components/ui/content-reveal";
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

const ACCOUNT_TYPE_GROUP_LABELS: Record<string, string> = {
  checking: "Bank Accounts",
  savings: "Savings Accounts",
  credit_card: "Credit Cards",
  cash: "Cash Accounts",
  loan: "Loans",
  investment: "Investments",
  other: "Other Accounts",
};

const ACCOUNT_TYPE_ICONS: Record<BankAccountType, React.ElementType> = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCardIcon,
  cash: Banknote,
  loan: Building2,
  investment: TrendingUp,
  other: Wallet,
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
      <ContentReveal>
        <div className="flex flex-col items-center gap-12 pt-20 pb-16">
          {/* Step flow */}
          <div className="w-full max-w-lg">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-0">
              {[
                {
                  step: "1",
                  label: "Add account",
                  sub: "Create a bank account with currency and type",
                  icon: Landmark,
                  color: "bg-blue-500",
                  ring: "ring-blue-200 dark:ring-blue-900",
                  iconBg: "bg-blue-50 dark:bg-blue-950/40",
                  iconColor: "text-blue-600 dark:text-blue-400",
                },
                {
                  step: "2",
                  label: "Import statements",
                  sub: "Upload CSV, OFX, CAMT, and more formats",
                  icon: ArrowUpRight,
                  color: "bg-amber-500",
                  ring: "ring-amber-200 dark:ring-amber-900",
                  iconBg: "bg-amber-50 dark:bg-amber-950/40",
                  iconColor: "text-amber-600 dark:text-amber-400",
                },
                {
                  step: "3",
                  label: "Reconcile",
                  sub: "Match transactions to invoices and bills",
                  icon: ChevronRight,
                  color: "bg-emerald-500",
                  ring: "ring-emerald-200 dark:ring-emerald-900",
                  iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
                  iconColor: "text-emerald-600 dark:text-emerald-400",
                },
              ].map(({ step, label, sub, icon: Icon, color, ring, iconBg, iconColor }, i) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  {i < 2 && (
                    <div className="hidden sm:block absolute top-5 left-[calc(50%+20px)] w-[calc(100%-40px)] h-px bg-border" />
                  )}
                  <div className={cn(
                    "relative z-10 flex size-10 items-center justify-center rounded-xl ring-4",
                    color, ring
                  )}>
                    <Icon className="size-5 text-white" />
                  </div>
                  <p className="mt-3 text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[160px] leading-relaxed">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="text-center space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
              <Landmark className="size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Connect your first account</h2>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-md mx-auto">
                Add a bank account to start importing statements and tracking balances.
              </p>
            </div>
            <Button
              onClick={() => setDrawerOpen(true)}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Bank Account
            </Button>
          </div>

          {/* Preview stats */}
          <div className="w-full max-w-md grid grid-cols-2 gap-3 opacity-30">
            {[
              { label: "Total Balance", value: "$0.00" },
              { label: "Accounts", value: "0" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-dashed p-4 text-center">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-1 font-mono text-sm font-medium text-muted-foreground tabular-nums">{value}</p>
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
      </ContentReveal>
    );
  }

  const positiveBalance = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const negativeBalance = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Math.abs(a.balance), 0);
  const currencies = [...new Set(accounts.map((a) => a.currencyCode))];

  // Group accounts by type
  const groupedAccounts = accounts.reduce<Record<string, BankAccount[]>>((groups, account) => {
    const key = account.accountType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(account);
    return groups;
  }, {});

  const typeOrder: BankAccountType[] = ["checking", "savings", "credit_card", "cash", "loan", "investment", "other"];
  const sortedGroups = typeOrder.filter((t) => groupedAccounts[t]);
  const hasMultipleGroups = sortedGroups.length > 1;

  return (
    <ContentReveal className="space-y-6 sm:space-y-8">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] text-muted-foreground">Total Balance</p>
          <p className={cn(
            "mt-0.5 font-mono text-lg font-semibold tabular-nums",
            totals.balance > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : totals.balance < 0
                ? "text-red-600 dark:text-red-400"
                : ""
          )}>
            {formatMoney(totals.balance)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Money In
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatMoney(positiveBalance)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-red-500" />
            Money Out
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
            {formatMoney(negativeBalance)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Accounts</p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <p className="font-mono text-lg font-semibold tabular-nums">{accounts.length}</p>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {totals.active} active
            </span>
          </div>
          {currencies.length > 1 && (
            <p className="text-xs text-muted-foreground">{currencies.length} currencies</p>
          )}
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Bank Accounts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage accounts, balances, and statement imports
          </p>
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

      {/* Account cards grouped by type */}
      <div className="space-y-6">
        {sortedGroups.map((type) => {
          const group = groupedAccounts[type];
          const Icon = ACCOUNT_TYPE_ICONS[type];

          return (
            <div key={type}>
              {hasMultipleGroups && (
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {ACCOUNT_TYPE_GROUP_LABELS[type] || type}
                  </p>
                  <span className="text-xs text-muted-foreground/60 tabular-nums">({group.length})</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {group.map((account) => {
                  const AccountIcon = ACCOUNT_TYPE_ICONS[account.accountType];
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => router.push(`/accounting/banking/${account.id}`)}
                      className="group relative flex w-full items-start gap-4 rounded-xl border bg-card p-4 text-left transition-all duration-200 hover:shadow-md hover:border-border/80 hover:bg-muted/30"
                    >
                      {/* Accent left border */}
                      <div
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full transition-all duration-200 group-hover:top-2 group-hover:bottom-2"
                        style={{ backgroundColor: account.color }}
                      />

                      {/* Account icon */}
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
                        style={{
                          backgroundColor: account.color + "14",
                          color: account.color,
                        }}
                      >
                        <AccountIcon className="size-5" />
                      </div>

                      {/* Account info */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{account.accountName}</p>
                          {!account.isActive && (
                            <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground border-muted-foreground/30">
                              Inactive
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {account.bankName && (
                            <span className="truncate">{account.bankName}</span>
                          )}
                          {account.bankName && account.accountNumber && (
                            <span className="text-border">·</span>
                          )}
                          {account.accountNumber && (
                            <span className="font-mono tabular-nums">····{account.accountNumber.slice(-4)}</span>
                          )}
                          {!account.bankName && !account.accountNumber && (
                            <span>Manual imports</span>
                          )}
                        </div>

                        {/* Balance + currency */}
                        <div className="flex items-baseline gap-2 pt-0.5">
                          <p className={cn(
                            "font-mono text-base font-semibold tabular-nums",
                            account.balance > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : account.balance < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                          )}>
                            {formatMoney(account.balance, account.currencyCode)}
                          </p>
                          <span className="text-[11px] text-muted-foreground font-medium">{account.currencyCode}</span>
                        </div>
                      </div>

                      {/* Hover arrow */}
                      <ChevronRight className="size-4 shrink-0 mt-0.5 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <CreateAccountDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        form={form}
        setForm={setForm}
        onSubmit={createAccount}
        loading={saving}
      />
    </ContentReveal>
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
