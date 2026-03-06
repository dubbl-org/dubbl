"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock3,
  FileStack,
  Link2Off,
  RefreshCcw,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

const STATUS_STYLES: Record<Transaction["status"], string> = {
  unreconciled: "border-amber-200 bg-amber-50 text-amber-700",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  excluded: "border-slate-200 bg-slate-50 text-slate-700",
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

export default function BankAccountDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [account, setAccount] = useState<BankAccountDetail | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<StatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualContent, setManualContent] = useState("");
  const [format, setFormat] = useState<StatementFormat>("auto");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch(`/api/v1/bank-accounts/${id}`, { headers }).then((res) => res.json()),
      fetch(
        `/api/v1/bank-accounts/${id}/transactions${
          statusFilter !== "all" ? `?status=${statusFilter}` : ""
        }`,
        { headers }
      ).then((res) => res.json()),
      fetch(`/api/v1/bank-accounts/${id}/imports`, { headers }).then((res) => res.json()),
    ])
      .then(([accountData, txData, importData]) => {
        setAccount(accountData.bankAccount || null);
        setTransactions(txData.data || []);
        setImports(importData.imports || []);
      })
      .finally(() => setLoading(false));
  }, [id, orgId, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    const unreconciled = transactions.filter((tx) => tx.status === "unreconciled").length;
    const importedCredits = transactions
      .filter((tx) => tx.amount > 0 && tx.status !== "excluded")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const importedDebits = transactions
      .filter((tx) => tx.amount < 0 && tx.status !== "excluded")
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return {
      unreconciled,
      importedCredits,
      importedDebits,
    };
  }, [transactions]);

  async function readStatementContent(): Promise<{ content: string; fileName: string | null }> {
    if (selectedFile) {
      return {
        content: await selectedFile.text(),
        fileName: selectedFile.name,
      };
    }
    return {
      content: manualContent,
      fileName: null,
    };
  }

  async function handlePreview() {
    if (!orgId) return;
    setPreviewing(true);

    try {
      const { content, fileName } = await readStatementContent();
      const res = await fetch(`/api/v1/bank-accounts/${id}/transactions/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          mode: "preview",
          content,
          fileName,
          format: format === "auto" ? null : format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data.preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to preview statement");
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
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          mode: "commit",
          content,
          fileName,
          format: format === "auto" ? null : format,
        }),
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
      toast.error(err instanceof Error ? err.message : "Failed to import statement");
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
      toast.error(err instanceof Error ? err.message : "Failed to reconcile");
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
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  return (
    <BlurReveal className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/accounting/banking")}>
          <ArrowLeft className="size-4" />
        </Button>
        <PageHeader
          title={account?.accountName || "Bank Account"}
          description={
            account
              ? [
                  account.bankName,
                  account.countryCode,
                  account.accountNumber ? `••••${account.accountNumber.slice(-4)}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")
              : "Loading account..."
          }
        >
          <Button variant="outline" onClick={() => router.push(`/accounting/banking/${id}/reconcile`)}>
            <RefreshCcw className="mr-2 size-4" />
            Reconcile
          </Button>
          <Button onClick={() => setImportOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
            <Upload className="mr-2 size-4" />
            Import Statement
          </Button>
        </PageHeader>
      </div>

      <section
        className="overflow-hidden rounded-[28px] border bg-card p-6 shadow-sm"
        style={{
          backgroundImage: account
            ? `radial-gradient(circle at top left, ${account.color}22, transparent 32%)`
            : undefined,
        }}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {account && (
                <Badge
                  variant="outline"
                  className="border-transparent text-white"
                  style={{ backgroundColor: account.color }}
                >
                  {account.accountType.replace("_", " ")}
                </Badge>
              )}
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                <Link2Off className="mr-1 size-3.5" />
                No bank connected
              </Badge>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                Salt Edge coming soon
              </Badge>
            </div>
            <div className="max-w-2xl">
              <h2 className="font-serif text-2xl tracking-tight">
                Import statements directly into this account and keep every transaction scoped.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                This account accepts global structured statement formats and retains provenance for
                every imported line, including import batch, source format, and duplicate checks.
              </p>
            </div>
          </div>
          <div className="rounded-[22px] border bg-background/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Current Balance
            </p>
            <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">
              {formatMoney(account?.balance || 0, account?.currencyCode || "USD")}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Money In"
          value={formatMoney(summary.importedCredits, account?.currencyCode || "USD")}
          icon={CheckCircle}
          changeType="positive"
        />
        <StatCard
          title="Money Out"
          value={formatMoney(summary.importedDebits, account?.currencyCode || "USD")}
          icon={XCircle}
          changeType="negative"
        />
        <StatCard
          title="Unreconciled"
          value={String(summary.unreconciled)}
          icon={AlertTriangle}
        />
        <StatCard
          title="Import Batches"
          value={String(imports.length)}
          icon={FileStack}
          change={imports[0] ? new Date(imports[0].createdAt).toLocaleDateString() : "No imports yet"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded-[26px] border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Transactions
              </p>
              <h3 className="mt-1 text-lg font-semibold">Account activity</h3>
            </div>
            <div className="flex gap-2">
              {["all", "unreconciled", "reconciled", "excluded"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {transactions.length === 0 && !loading ? (
            <div className="rounded-[22px] border border-dashed px-6 py-12 text-center">
              <Clock3 className="mx-auto size-8 text-muted-foreground" />
              <h4 className="mt-4 text-base font-semibold">No transactions yet</h4>
              <p className="mt-2 text-sm text-muted-foreground">
                Import a statement file to create the first activity for this bank account.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="rounded-[20px] border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_STYLES[transaction.status]}>
                          {transaction.status}
                        </Badge>
                        {transaction.import && (
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            {transaction.import.format.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <p className="text-base font-medium">{transaction.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {[transaction.reference, transaction.payee, transaction.counterparty]
                            .filter(Boolean)
                            .join(" • ") || "Imported statement line"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-3 lg:items-end">
                      <div className="text-left lg:text-right">
                        <p
                          className={`font-mono text-lg font-semibold tabular-nums ${
                            transaction.amount < 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {formatMoney(transaction.amount, account?.currencyCode || "USD")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {transaction.date}
                          {transaction.balance != null && (
                            <> • balance {formatMoney(transaction.balance, account?.currencyCode || "USD")}</>
                          )}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {transaction.status === "unreconciled" && (
                          <>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => handleReconcile(transaction.id)}
                            >
                              <CheckCircle className="mr-1 size-3.5" />
                              Reconcile
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleExclude(transaction.id)}>
                              <XCircle className="mr-1 size-3.5" />
                              Exclude
                            </Button>
                          </>
                        )}
                        {transaction.status === "excluded" && (
                          <Button size="sm" variant="outline" onClick={() => handleExclude(transaction.id)}>
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-[26px] border bg-card p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Import Timeline
            </p>
            <h3 className="mt-1 text-lg font-semibold">Recent batches</h3>
            <div className="mt-4 space-y-3">
              {imports.length === 0 ? (
                <p className="text-sm text-muted-foreground">No statements imported for this account yet.</p>
              ) : (
                imports.map((statementImport) => (
                  <div key={statementImport.id} className="rounded-[18px] border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{statementImport.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {statementImport.format.toUpperCase()} • {new Date(statementImport.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {statementImport.importedCount} imported
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {statementImport.duplicateCount > 0 && <span>{statementImport.duplicateCount} duplicates skipped</span>}
                      {statementImport.statementStartDate && statementImport.statementEndDate && (
                        <span>
                          {statementImport.statementStartDate} to {statementImport.statementEndDate}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[26px] border bg-card p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Supported Inputs
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              CSV, TSV, QIF, OFX/QFX/QBO, CAMT.052/.053/.054, MT940/MT942, and BAI2.
              Import a file or paste raw statement content, preview it, then commit it to this
              account.
            </p>
          </div>
        </section>
      </div>

      <ImportStatementDialog
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
        currencyCode={account?.currencyCode || "USD"}
      />
    </BlurReveal>
  );
}

function ImportStatementDialog({
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
  const canPreview = Boolean(selectedFile || manualContent.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import Statement</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as StatementFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Upload statement file</Label>
              <Input
                type="file"
                accept=".csv,.tsv,.qif,.ofx,.qfx,.qbo,.xml,.txt,.bai,.bai2"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">{selectedFile.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Or paste statement content</Label>
              <Textarea
                value={manualContent}
                onChange={(event) => setManualContent(event.target.value)}
                rows={10}
                className="font-mono text-xs"
                placeholder="Paste CSV, QFX, OFX, MT940, CAMT XML, or other supported statement content."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[22px] border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileStack className="size-4" />
                Preview
              </div>
              {!preview ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Preview the statement to inspect format detection, date range, duplicates, and
                  the first 100 normalized transactions before importing.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PreviewMetric label="Detected format" value={FORMAT_LABELS[preview.format] || preview.format} />
                    <PreviewMetric label="Rows" value={String(preview.rowCount)} />
                    <PreviewMetric label="Duplicates" value={String(preview.duplicates.length)} />
                    <PreviewMetric
                      label="Statement period"
                      value={
                        preview.statementStartDate && preview.statementEndDate
                          ? `${preview.statementStartDate} → ${preview.statementEndDate}`
                          : "Not provided"
                      }
                    />
                  </div>

                  {preview.warnings.length > 0 && (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-3">
                      <p className="text-sm font-medium text-amber-800">Warnings</p>
                      <ul className="mt-2 space-y-1 text-xs text-amber-700">
                        {preview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-[18px] border">
                    <div className="grid grid-cols-[100px_1fr_120px] gap-3 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      <span>Date</span>
                      <span>Description</span>
                      <span className="text-right">Amount</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {preview.transactions.map((transaction, index) => (
                        <div
                          key={`${transaction.date}-${transaction.description}-${index}`}
                          className="grid grid-cols-[100px_1fr_120px] gap-3 border-b px-3 py-3 text-sm last:border-b-0"
                        >
                          <span>{transaction.date}</span>
                          <div>
                            <p className="font-medium">{transaction.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {[transaction.reference, transaction.payee, transaction.counterparty]
                                .filter(Boolean)
                                .join(" • ")}
                            </p>
                          </div>
                          <span
                            className={`text-right font-mono tabular-nums ${
                              transaction.amount < 0 ? "text-red-600" : "text-emerald-600"
                            }`}
                          >
                            {formatMoney(transaction.amount, currencyCode)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!canPreview || previewing} onClick={onPreview}>
            {previewing ? "Previewing..." : "Preview"}
          </Button>
          <Button
            onClick={onImport}
            disabled={!canPreview || importing}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {importing ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border bg-background p-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </div>
  );
}
