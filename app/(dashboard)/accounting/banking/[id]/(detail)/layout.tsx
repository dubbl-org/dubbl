"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  CircleDot,
  History,
  ListFilter,
  RefreshCcw,
  Settings2,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { motion, MotionConfig } from "motion/react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { formatMoney } from "@/lib/money";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { cn } from "@/lib/utils";
import type {
  BankAccountDetail,
  Transaction,
  StatementImport,
  ImportPreview,
  StatementFormat,
  OpenBill,
  SuggestedMatch,
} from "../_components";
import { ImportSheet, MatchToBillSheet, CreateExpenseSheet } from "../_components";
import { ACCOUNT_TYPE_LABELS } from "../_components";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface BankAccountContextValue {
  account: BankAccountDetail;
  setAccount: (fn: (prev: BankAccountDetail | null) => BankAccountDetail | null) => void;
  transactions: Transaction[];
  imports: StatementImport[];
  refetch: () => void;
  // Transaction actions
  handleReconcile: (txId: string) => Promise<void>;
  handleExclude: (txId: string) => Promise<void>;
  handleOpenMatch: (tx: Transaction) => void;
  handleOpenExpense: (tx: Transaction) => void;
  // Import
  openImport: () => void;
  // Summary
  summary: {
    unreconciled: number;
    reconciled: number;
    excluded: number;
    credits: number;
    debits: number;
    total: number;
  };
}

const BankAccountContext = createContext<BankAccountContextValue | null>(null);

export function useBankAccountContext() {
  const ctx = useContext(BankAccountContext);
  if (!ctx) throw new Error("useBankAccountContext must be used within bank account layout");
  return ctx;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const PAGE_TABS = [
  { value: "overview", label: "Overview", icon: Wallet, href: (id: string) => `/accounting/banking/${id}` },
  { value: "transactions", label: "Transactions", icon: ListFilter, href: (id: string) => `/accounting/banking/${id}/transactions` },
  { value: "imports", label: "Imports", icon: History, href: (id: string) => `/accounting/banking/${id}/imports` },
  { value: "settings", label: "Settings", icon: Settings2, href: (id: string) => `/accounting/banking/${id}/settings` },
] as const;

function getActiveTab(pathname: string): string {
  if (pathname.endsWith("/transactions")) return "transactions";
  if (pathname.endsWith("/imports")) return "imports";
  if (pathname.endsWith("/settings")) return "settings";
  return "overview";
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function BankAccountDetailLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [loading, setLoading] = useState(true);

  // Import sheet state
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualContent, setManualContent] = useState("");
  const [format, setFormat] = useState<StatementFormat>("auto");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Match / expense sheet state
  const [matchTx, setMatchTx] = useState<Transaction | null>(null);
  const [matchBills, setMatchBills] = useState<OpenBill[]>([]);
  const [matchSuggestions, setMatchSuggestions] = useState<SuggestedMatch[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [expenseTx, setExpenseTx] = useState<Transaction | null>(null);

  useEntityTitle(account?.accountName ?? undefined);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch(`/api/v1/bank-accounts/${id}`, { headers }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/transactions`, { headers }).then((r) => r.json()),
      fetch(`/api/v1/bank-accounts/${id}/imports`, { headers }).then((r) => r.json()),
    ])
      .then(([accountData, txData, importData]) => {
        setAccount(accountData.bankAccount || null);
        setTransactions(txData.data || []);
        setImports(importData.imports || []);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const unreconciled = transactions.filter((tx) => tx.status === "unreconciled").length;
    const reconciled = transactions.filter((tx) => tx.status === "reconciled").length;
    const excluded = transactions.filter((tx) => tx.status === "excluded").length;
    const credits = transactions
      .filter((tx) => tx.amount > 0 && tx.status !== "excluded")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const debits = transactions
      .filter((tx) => tx.amount < 0 && tx.status !== "excluded")
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return { unreconciled, reconciled, excluded, credits, debits, total: transactions.length };
  }, [transactions]);

  // Transaction actions
  async function handleReconcile(txId: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/bank-transactions/${txId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Transaction reconciled");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reconcile");
    }
  }

  async function handleExclude(txId: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/bank-transactions/${txId}/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Transaction status updated");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function handleOpenMatch(tx: Transaction) {
    if (!orgId) return;
    setMatchTx(tx);
    setMatchLoading(true);
    setMatchBills([]);
    setMatchSuggestions([]);
    try {
      const res = await fetch(`/api/v1/bank-transactions/${tx.id}/match`, {
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        const data = await res.json();
        setMatchBills(data.openBills || []);
        setMatchSuggestions(data.suggestedMatches || []);
      }
    } finally {
      setMatchLoading(false);
    }
  }

  function handleOpenExpense(tx: Transaction) {
    setExpenseTx(tx);
  }

  // Import handlers
  async function readStatementContent(): Promise<{ content: string; fileName: string | null }> {
    if (selectedFile) return { content: await selectedFile.text(), fileName: selectedFile.name };
    return { content: manualContent, fileName: null };
  }

  async function handlePreview() {
    if (!orgId) return;
    setPreviewing(true);
    try {
      const { content, fileName } = await readStatementContent();
      const res = await fetch(`/api/v1/bank-accounts/${id}/transactions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ mode: "preview", content, fileName, format: format === "auto" ? null : format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data.preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to preview");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!orgId) return;
    setImporting(true);
    try {
      const { content, fileName } = await readStatementContent();
      const res = await fetch(`/api/v1/bank-accounts/${id}/transactions/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ mode: "commit", content, fileName, format: format === "auto" ? null : format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Imported ${data.import.imported} transactions`);
      setImportOpen(false);
      setSelectedFile(null);
      setManualContent("");
      setFormat("auto");
      setPreview(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (!account) {
    return (
      <div className="space-y-4 pt-12 text-center">
        <p className="text-sm text-muted-foreground">Account not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/accounting/banking")}>Back to Banking</Button>
      </div>
    );
  }

  const cur = account.currencyCode;
  const reconciledPct = summary.total > 0 ? Math.round((summary.reconciled / summary.total) * 100) : 0;
  const activeTab = getActiveTab(pathname);

  return (
    <BankAccountContext.Provider value={{
      account,
      setAccount,
      transactions,
      imports,
      refetch: fetchData,
      handleReconcile,
      handleExclude,
      handleOpenMatch,
      handleOpenExpense,
      openImport: () => setImportOpen(true),
      summary,
    }}>
      <ContentReveal>
        {/* Back link */}
        <button
          onClick={() => router.push("/accounting/banking")}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to banking
        </button>

        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: account.color + "18", color: account.color }}
            >
              <CircleDot className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <h1 className="text-base sm:text-lg font-semibold tracking-tight">{account.accountName}</h1>
                <Badge variant="outline">{ACCOUNT_TYPE_LABELS[account.accountType]}</Badge>
                <Badge variant="outline" className="text-[10px]">{account.currencyCode}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {[account.bankName, account.countryCode, account.accountNumber ? `····${account.accountNumber.slice(-4)}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Manual imports"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/accounting/banking/${id}/reconcile`)}>
              <RefreshCcw className="mr-2 size-3.5" />
              Reconcile
            </Button>
            <Button size="sm" onClick={() => setImportOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Upload className="mr-2 size-3.5" />
              Import
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4 mb-8">
          <div>
            <p className="text-[11px] text-muted-foreground">Balance</p>
            <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">{formatMoney(account.balance, cur)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ArrowDownRight className="size-3 text-emerald-500" />Money In</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-600">{formatMoney(summary.credits, cur)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><ArrowUpRight className="size-3 text-red-500" />Money Out</p>
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-red-600">{formatMoney(summary.debits, cur)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Reconciled</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${reconciledPct}%` }} />
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">{reconciledPct}%</span>
            </div>
          </div>
        </div>

        {/* Page tabs */}
        <nav className="-mt-2 mb-8 flex items-center gap-1 overflow-x-auto border-b border-border">
          {PAGE_TABS.map((t) => {
            const Icon = t.icon;
            const tabHref = t.href(id);
            const active = activeTab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => router.push(tabHref)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {t.label}
                {t.value === "transactions" && summary.unreconciled > 0 && (
                  <span className="ml-1 text-[11px] tabular-nums text-amber-600">{summary.unreconciled}</span>
                )}
                {t.value === "imports" && imports.length > 0 && (
                  <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">{imports.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <MotionConfig reducedMotion="never">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            {children}
          </motion.div>
        </MotionConfig>
      </ContentReveal>

      {/* Import Sheet */}
      <ImportSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        selectedFile={selectedFile}
        setSelectedFile={setSelectedFile}
        manualContent={manualContent}
        setManualContent={setManualContent}
        format={format}
        setFormat={setFormat}
        preview={preview}
        previewing={previewing}
        importing={importing}
        onPreview={handlePreview}
        onImport={handleImport}
        currencyCode={cur}
      />

      {/* Match to Bill Sheet */}
      <MatchToBillSheet
        transaction={matchTx}
        onClose={() => setMatchTx(null)}
        bills={matchBills}
        suggestions={matchSuggestions}
        loading={matchLoading}
        currencyCode={cur}
        orgId={orgId}
        onMatched={() => { setMatchTx(null); fetchData(); }}
      />

      {/* Create Expense Sheet */}
      <CreateExpenseSheet
        transaction={expenseTx}
        onClose={() => setExpenseTx(null)}
        currencyCode={cur}
        orgId={orgId}
        onCreated={() => { setExpenseTx(null); fetchData(); }}
      />
    </BankAccountContext.Provider>
  );
}
