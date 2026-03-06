"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  CircleDot,
  Clock3,
  FileStack,
  FileText,
  Loader2,
  RefreshCcw,
  Settings2,
  Upload,
  Wallet,
  X,
  XCircle,
  ListFilter,
  History,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";

type BankAccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "loan"
  | "investment"
  | "other";

type StatementFormat =
  | "auto"
  | "csv"
  | "tsv"
  | "qif"
  | "ofx"
  | "qfx"
  | "qbo"
  | "camt052"
  | "camt053"
  | "camt054"
  | "mt940"
  | "mt942"
  | "bai2";

interface BankAccountDetail {
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

interface ImportPreviewRow {
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  balance?: number | null;
  payee?: string | null;
  counterparty?: string | null;
}

interface ImportPreview {
  format: StatementFormat;
  accountIdentifier: string | null;
  currencyCode: string | null;
  statementStartDate: string | null;
  statementEndDate: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  warnings: string[];
  rowCount: number;
  duplicates: Array<{ dedupeHash: string; description: string; amount: number; date: string }>;
  transactions: ImportPreviewRow[];
}

interface StatementImport {
  id: string;
  format: string;
  fileName: string;
  importedCount: number;
  duplicateCount: number;
  warningCount?: number;
  warnings: string[];
  statementStartDate: string | null;
  statementEndDate: string | null;
  createdAt: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  status: "unreconciled" | "reconciled" | "excluded";
  payee?: string | null;
  counterparty?: string | null;
  import?: { id: string; format: string; fileName: string | null } | null;
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

const STATUS_STYLES: Record<Transaction["status"], string> = {
  unreconciled: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  excluded: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const FORMAT_LABELS: Record<StatementFormat, string> = {
  auto: "Auto Detect",
  csv: "CSV",
  tsv: "TSV",
  qif: "QIF",
  ofx: "OFX",
  qfx: "QFX",
  qbo: "QBO",
  camt052: "CAMT.052",
  camt053: "CAMT.053",
  camt054: "CAMT.054",
  mt940: "MT940",
  mt942: "MT942",
  bai2: "BAI2",
};

const TABS = [
  { value: "overview", label: "Overview", icon: Wallet },
  { value: "transactions", label: "Transactions", icon: ListFilter },
  { value: "imports", label: "Imports", icon: History },
  { value: "settings", label: "Settings", icon: Settings2 },
] as const;

const ACCOUNT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function BankAccountDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("overview");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualContent, setManualContent] = useState("");
  const [format, setFormat] = useState<StatementFormat>("auto");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEntityTitle(account?.accountName ?? undefined);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

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

  const filteredTx = useMemo(() => {
    if (statusFilter === "all") return transactions;
    return transactions.filter((tx) => tx.status === statusFilter);
  }, [transactions, statusFilter]);

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

  async function handleSaveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/v1/bank-accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          accountName: fd.get("accountName"),
          bankName: fd.get("bankName") || null,
          accountNumber: fd.get("accountNumber") || null,
          currencyCode: fd.get("currencyCode") || undefined,
          countryCode: fd.get("countryCode") || null,
          accountType: fd.get("accountType") || undefined,
          color: fd.get("color") || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setAccount(data.bankAccount);
      toast.success("Account updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update account");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!orgId) return;
    await confirm({
      title: "Delete this bank account?",
      description: "This will permanently delete the account and all its transactions. This cannot be undone.",
      confirmLabel: "Delete Account",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/bank-accounts/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Account deleted");
          router.push("/accounting/banking");
        } else {
          toast.error("Failed to delete account");
        }
      },
    });
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

  return (
    <div>
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
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-semibold tracking-tight">{account.accountName}</h1>
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
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
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
            <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${reconciledPct}%` }} />
            </div>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">{reconciledPct}%</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <nav className="-mt-2 mb-8 flex items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 text-[13px] font-medium transition-colors",
                tab === t.value
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
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
        {/* Overview tab */}
        {tab === "overview" && (
          <div className="space-y-8">
            {/* Reconciliation breakdown */}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Unreconciled", count: summary.unreconciled, color: "bg-amber-500", textColor: "text-amber-600" },
                { label: "Reconciled", count: summary.reconciled, color: "bg-emerald-500", textColor: "text-emerald-600" },
                { label: "Excluded", count: summary.excluded, color: "bg-gray-400", textColor: "text-muted-foreground" },
              ].map(({ label, count, color, textColor }) => (
                <div key={label} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    <div className={cn("size-2.5 rounded-full", color)} />
                  </div>
                  <p className={cn("mt-2 text-2xl font-bold tracking-tight font-mono tabular-nums", textColor)}>{count}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${Math.round((count / summary.total) * 100)}% of total` : "No transactions"}
                  </p>
                </div>
              ))}
            </div>

            {/* Recent transactions */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Recent Transactions</h3>
                <button
                  onClick={() => setTab("transactions")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all
                </button>
              </div>
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
                  <Clock3 className="size-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">No transactions yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Import a statement to get started.</p>
                  </div>
                  <Button size="sm" onClick={() => setImportOpen(true)} className="mt-2 bg-emerald-600 hover:bg-emerald-700">
                    <Upload className="mr-2 size-3.5" />Import Statement
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border">
                  {transactions.slice(0, 8).map((tx, i) => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      cur={cur}
                      isLast={i === Math.min(7, transactions.length - 1)}
                      onReconcile={handleReconcile}
                      onExclude={handleExclude}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Recent imports */}
            {imports.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Recent Imports</h3>
                  <button
                    onClick={() => setTab("imports")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View all
                  </button>
                </div>
                <div className="rounded-lg border">
                  {imports.slice(0, 3).map((imp, i) => (
                    <ImportRow key={imp.id} imp={imp} isLast={i === Math.min(2, imports.length - 1)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Transactions tab */}
        {tab === "transactions" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {["all", "unreconciled", "reconciled", "excluded"].map((value) => (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition-colors capitalize",
                    statusFilter === value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  {value}
                  {value !== "all" && (
                    <span className="ml-1 tabular-nums">
                      {value === "unreconciled" ? summary.unreconciled : value === "reconciled" ? summary.reconciled : summary.excluded}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {filteredTx.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
                <Clock3 className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {statusFilter === "all" ? "No transactions yet." : `No ${statusFilter} transactions.`}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border">
                {filteredTx.map((tx, i) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    cur={cur}
                    isLast={i === filteredTx.length - 1}
                    onReconcile={handleReconcile}
                    onExclude={handleExclude}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Imports tab */}
        {tab === "imports" && (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => setImportOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Upload className="mr-2 size-3.5" />Import Statement
              </Button>
            </div>

            {imports.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
                <FileStack className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No imports yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Upload a bank statement to import transactions.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border">
                {imports.map((imp, i) => (
                  <ImportRow key={imp.id} imp={imp} isLast={i === imports.length - 1} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <form onSubmit={handleSaveSettings} className="space-y-10">
            <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <p className="text-sm font-medium">General</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Account name, bank, and type.</p>
              </div>
              <div className="min-w-0 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Name</Label>
                  <Input name="accountName" required defaultValue={account.accountName} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Bank Name</Label>
                    <Input name="bankName" defaultValue={account.bankName || ""} placeholder="e.g. Revolut Business" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Type</Label>
                    <Select name="accountType" defaultValue={account.accountType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Account Number / IBAN</Label>
                  <Input name="accountNumber" defaultValue={account.accountNumber || ""} placeholder="1234 or GB29NWBK..." />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <p className="text-sm font-medium">Region</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Currency and country for this account.</p>
              </div>
              <div className="min-w-0 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Currency</Label>
                  <Input name="currencyCode" defaultValue={account.currencyCode} placeholder="USD" maxLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Country</Label>
                  <Input name="countryCode" defaultValue={account.countryCode || ""} placeholder="US" maxLength={2} />
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <p className="text-sm font-medium">Accent Color</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Color used on cards and charts.</p>
              </div>
              <div className="min-w-0">
                <input type="hidden" name="color" value={account.color} />
                <div className="flex gap-2">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccount((prev) => prev ? { ...prev, color: c } : prev)}
                      className={cn(
                        "size-6 rounded-full ring-2 ring-transparent transition-all",
                        account.color === c && "ring-offset-2 ring-gray-400"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Choose ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={saving} className="bg-emerald-600 hover:bg-emerald-700">
                Save changes
              </Button>
            </div>

            <div className="h-px bg-border" />

            <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:gap-10">
              <div className="shrink-0">
                <p className="text-sm font-medium text-red-600">Danger zone</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Irreversible actions.</p>
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
                    <p className="text-[12px] text-muted-foreground">Permanently delete this account and all imported transactions.</p>
                  </div>
                  <Button variant="destructive" size="sm" type="button" onClick={handleDelete}>Delete</Button>
                </div>
              </div>
            </div>
          </form>
        )}
        </motion.div>
      </AnimatePresence>

      {confirmDialog}

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------
function TransactionRow({
  tx,
  cur,
  isLast,
  onReconcile,
  onExclude,
}: {
  tx: Transaction;
  cur: string;
  isLast: boolean;
  onReconcile: (id: string) => void;
  onExclude: (id: string) => void;
}) {
  const isCredit = tx.amount > 0;
  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30",
        !isLast && "border-b"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        isCredit ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-red-50 dark:bg-red-950/40"
      )}>
        {isCredit
          ? <ArrowDownRight className="size-4 text-emerald-600 dark:text-emerald-400" />
          : <ArrowUpRight className="size-4 text-red-600 dark:text-red-400" />
        }
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{tx.description}</p>
          <Badge variant="outline" className={cn("text-[10px] shrink-0", STATUS_STYLES[tx.status])}>
            {tx.status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {tx.date}
          {tx.reference && <> · {tx.reference}</>}
          {tx.payee && <> · {tx.payee}</>}
        </p>
      </div>

      {/* Amount + actions */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {tx.status === "unreconciled" && (
            <>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600" onClick={() => onReconcile(tx.id)}>
                <CheckCircle className="mr-1 size-3" />Match
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onExclude(tx.id)}>
                <XCircle className="mr-1 size-3" />Exclude
              </Button>
            </>
          )}
          {tx.status === "excluded" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onExclude(tx.id)}>Restore</Button>
          )}
        </div>
        <span className={cn(
          "font-mono text-sm font-medium tabular-nums w-24 text-right",
          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}>
          {isCredit ? "+" : ""}{formatMoney(tx.amount, cur)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import row
// ---------------------------------------------------------------------------
function ImportRow({ imp, isLast }: { imp: StatementImport; isLast: boolean }) {
  return (
    <div className={cn("flex items-center justify-between px-4 py-3", !isLast && "border-b")}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted shrink-0">
          <FileStack className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{imp.fileName}</span>
            <Badge variant="outline" className="text-[10px]">{imp.format.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span>{new Date(imp.createdAt).toLocaleDateString()}</span>
            {imp.statementStartDate && imp.statementEndDate && (
              <span>{imp.statementStartDate} to {imp.statementEndDate}</span>
            )}
            {imp.duplicateCount > 0 && <span>{imp.duplicateCount} duplicates skipped</span>}
          </div>
        </div>
      </div>
      <span className="text-sm font-mono font-medium shrink-0 tabular-nums">{imp.importedCount} rows</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Sheet with dropzone
// ---------------------------------------------------------------------------
function ImportSheet({
  open,
  onOpenChange,
  selectedFile,
  setSelectedFile,
  manualContent,
  setManualContent,
  format,
  setFormat,
  preview,
  previewing,
  importing,
  onPreview,
  onImport,
  currencyCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  manualContent: string;
  setManualContent: (content: string) => void;
  format: StatementFormat;
  setFormat: (format: StatementFormat) => void;
  preview: ImportPreview | null;
  previewing: boolean;
  importing: boolean;
  onPreview: () => void;
  onImport: () => void;
  currencyCode: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canPreview = Boolean(selectedFile || manualContent.trim());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Upload className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg">Import Statement</SheetTitle>
              <SheetDescription>Upload a bank statement or paste content to import transactions.</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-6 px-6 py-5">
          {/* Dropzone */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Upload File</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all",
                dragging
                  ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/30",
                selectedFile && "border-emerald-500/50 bg-emerald-50/30 dark:bg-emerald-950/10"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.qif,.ofx,.qfx,.qbo,.xml,.txt,.bai,.bai2"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {selectedFile ? (
                <>
                  <FileText className="size-8 text-emerald-600" />
                  <p className="mt-3 text-sm font-medium">{selectedFile.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <Upload className="size-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm font-medium">Drop your statement here</p>
                  <p className="mt-1 text-xs text-muted-foreground">or click to browse. CSV, OFX, QFX, CAMT, MT940, BAI2, and more.</p>
                </>
              )}
            </div>
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Or Paste Content</p>
            <Textarea
              value={manualContent}
              onChange={(e) => setManualContent(e.target.value)}
              rows={5}
              className="font-mono text-xs"
              placeholder="Paste CSV, QFX, OFX, MT940, CAMT XML, or other statement content..."
            />
          </div>

          <div className="h-px bg-border" />

          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Format</p>
            <Select value={format} onValueChange={(v) => setFormat(v as StatementFormat)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FORMAT_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {preview && (
            <>
              <div className="h-px bg-border" />
              <div className="space-y-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Format", value: FORMAT_LABELS[preview.format] || preview.format },
                    { label: "Rows", value: String(preview.rowCount) },
                    { label: "Duplicates", value: String(preview.duplicates.length) },
                    { label: "Period", value: preview.statementStartDate && preview.statementEndDate ? `${preview.statementStartDate} to ${preview.statementEndDate}` : "-" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>

                {preview.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Warnings</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-700 dark:text-amber-400">
                      {preview.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-[90px_1fr_100px] gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Date</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Amount</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {preview.transactions.map((tx, i) => (
                      <div
                        key={`${tx.date}-${tx.description}-${i}`}
                        className={cn("grid grid-cols-[90px_1fr_100px] gap-2 px-3 py-2.5", i < preview.transactions.length - 1 && "border-b")}
                      >
                        <span className="text-xs text-muted-foreground">{tx.date}</span>
                        <p className="text-xs font-medium truncate">{tx.description}</p>
                        <span className={cn("text-right font-mono text-xs tabular-nums", tx.amount < 0 ? "text-red-600" : "text-emerald-600")}>
                          {formatMoney(tx.amount, currencyCode)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t bg-background/80 px-6 py-4 backdrop-blur-sm">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={!canPreview || previewing} onClick={onPreview}>
            {previewing ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Previewing...</> : "Preview"}
          </Button>
          <Button onClick={onImport} disabled={!canPreview || importing} className="bg-emerald-600 hover:bg-emerald-700">
            {importing ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Importing...</> : "Import"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
