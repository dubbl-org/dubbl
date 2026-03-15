"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  ArrowUpRight,
  Landmark,
  PiggyBank,
  CreditCard as CreditCardIcon,
  Banknote,
  ChevronRight,
  Wallet,
  TrendingUp,
  Building2,
  ArrowDownLeft,
  MoreHorizontal,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

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

export default function BankingPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBalances, setShowBalances] = useState(true);

  useDocumentTitle("Accounting \u00B7 Bank Accounts");

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
    const handler = () => fetchAccounts();
    window.addEventListener("bank-accounts-changed", handler);
    return () => window.removeEventListener("bank-accounts-changed", handler);
  }, []);

  const totals = useMemo(() => {
    const active = accounts.filter((a) => a.isActive).length;
    const balance = accounts.reduce((sum, a) => sum + a.balance, 0);
    return { active, balance };
  }, [accounts]);

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
                },
                {
                  step: "2",
                  label: "Import statements",
                  sub: "Upload CSV, OFX, CAMT, and more formats",
                  icon: ArrowUpRight,
                  color: "bg-amber-500",
                  ring: "ring-amber-200 dark:ring-amber-900",
                },
                {
                  step: "3",
                  label: "Reconcile",
                  sub: "Match transactions to invoices and bills",
                  icon: ChevronRight,
                  color: "bg-emerald-500",
                  ring: "ring-emerald-200 dark:ring-emerald-900",
                },
              ].map(({ step, label, sub, icon: Icon, color, ring }, i) => (
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
              onClick={() => openDrawer("bankAccount")}
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
      </ContentReveal>
    );
  }

  const positiveBalance = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const negativeBalance = accounts.filter((a) => a.balance < 0).reduce((s, a) => s + Math.abs(a.balance), 0);
  const currencies = [...new Set(accounts.map((a) => a.currencyCode))];
  const maxBalance = Math.max(...accounts.map((a) => Math.abs(a.balance)), 1);

  // Group accounts by type
  const groupedAccounts = accounts.reduce<Record<string, BankAccount[]>>((groups, account) => {
    const key = account.accountType;
    if (!groups[key]) groups[key] = [];
    groups[key].push(account);
    return groups;
  }, {});

  const typeOrder: BankAccountType[] = ["checking", "savings", "credit_card", "cash", "loan", "investment", "other"];
  const sortedGroups = typeOrder.filter((t) => groupedAccounts[t]);

  return (
    <ContentReveal className="space-y-6 sm:space-y-8">
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
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
            {showBalances ? formatMoney(totals.balance) : "********"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ArrowDownLeft className="size-3 text-emerald-500" />
            Money In
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {showBalances ? formatMoney(positiveBalance) : "********"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <ArrowUpRight className="size-3 text-red-500" />
            Money Out
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
            {showBalances ? formatMoney(negativeBalance) : "********"}
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground"
            onClick={() => setShowBalances(!showBalances)}
          >
            {showBalances ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {showBalances ? "Hide" : "Show"}
          </Button>
          <Button
            onClick={() => openDrawer("bankAccount")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Account
          </Button>
        </div>
      </div>

      {/* Account list grouped by type */}
      <div className="space-y-6">
        {sortedGroups.map((type) => {
          const group = groupedAccounts[type];
          const Icon = ACCOUNT_TYPE_ICONS[type];
          const groupBalance = group.reduce((s, a) => s + a.balance, 0);

          return (
            <div key={type}>
              {sortedGroups.length > 1 && (
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {ACCOUNT_TYPE_GROUP_LABELS[type] || type}
                    </p>
                    <span className="text-xs text-muted-foreground/50 tabular-nums">({group.length})</span>
                  </div>
                  <p className="text-xs font-mono tabular-nums text-muted-foreground">
                    {showBalances ? formatMoney(groupBalance) : "****"}
                  </p>
                </div>
              )}

              <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
                {group.map((account) => {
                  const AccountIcon = ACCOUNT_TYPE_ICONS[account.accountType];
                  const balancePct = Math.min((Math.abs(account.balance) / maxBalance) * 100, 100);

                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => router.push(`/accounting/banking/${account.id}`)}
                      className="group relative flex w-full items-center gap-3 sm:gap-4 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                    >
                      {/* Icon with accent */}
                      <div
                        className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105"
                        style={{
                          backgroundColor: account.color + "14",
                          color: account.color,
                        }}
                      >
                        <AccountIcon className="size-4 sm:size-5" />
                      </div>

                      {/* Account info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{account.accountName}</p>
                          {!account.isActive && (
                            <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground border-muted-foreground/30">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
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
                            <span>{ACCOUNT_TYPE_LABELS[account.accountType]}</span>
                          )}
                          {sortedGroups.length <= 1 && (
                            <>
                              <span className="text-border">·</span>
                              <span>{ACCOUNT_TYPE_LABELS[account.accountType]}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Balance bar + amount */}
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        {/* Mini balance bar - hidden on mobile */}
                        <div className="hidden sm:block w-20">
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${balancePct}%`,
                                backgroundColor: account.balance >= 0 ? account.color : "#ef4444",
                              }}
                            />
                          </div>
                        </div>

                        {/* Balance */}
                        <div className="text-right min-w-[90px]">
                          <p className={cn(
                            "font-mono text-sm font-semibold tabular-nums",
                            account.balance > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : account.balance < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                          )}>
                            {showBalances ? formatMoney(account.balance, account.currencyCode) : "****"}
                          </p>
                          <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{account.currencyCode}</p>
                        </div>

                        {/* Actions */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <div className="flex size-7 items-center justify-center rounded-md text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:bg-muted cursor-pointer">
                              <MoreHorizontal className="size-4" />
                            </div>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/accounting/banking/${account.id}`); }}>
                              <ExternalLink className="size-3.5 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/accounting/banking/${account.id}/transactions`); }}>
                              <ArrowUpRight className="size-3.5 mr-2" />
                              Transactions
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Chevron */}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover:text-muted-foreground group-hover:translate-x-0.5 hidden sm:block" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ContentReveal>
  );
}
