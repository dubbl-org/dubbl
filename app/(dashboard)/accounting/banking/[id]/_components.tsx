"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle,
  FileStack,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Receipt,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BankAccountType =
  | "checking"
  | "savings"
  | "credit_card"
  | "cash"
  | "loan"
  | "investment"
  | "other";

export type StatementFormat =
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

export interface BankAccountDetail {
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

export interface ImportPreviewRow {
  date: string;
  description: string;
  amount: number;
  reference: string | null;
  balance?: number | null;
  payee?: string | null;
  counterparty?: string | null;
}

export interface ImportPreview {
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

export interface StatementImport {
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

export interface Transaction {
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

export interface OpenBill {
  id: string;
  billNumber: string;
  contactName: string;
  dueDate: string;
  total: number;
  amountDue: number;
  status: string;
}

export interface SuggestedMatch {
  transactionId: string;
  candidate: { type: string; id: string; description: string; amount: number; date: string };
  confidence: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
  cash: "Cash",
  loan: "Loan",
  investment: "Investment",
  other: "Other",
};

export const STATUS_STYLES: Record<Transaction["status"], string> = {
  unreconciled: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  reconciled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  excluded: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

export const FORMAT_LABELS: Record<StatementFormat, string> = {
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

export const ACCOUNT_COLORS = [
  "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

// ---------------------------------------------------------------------------
// Transaction Row
// ---------------------------------------------------------------------------
export function TransactionRow({
  tx,
  cur,
  isLast,
  onReconcile,
  onExclude,
  onMatchBill,
  onCreateExpense,
}: {
  tx: Transaction;
  cur: string;
  isLast: boolean;
  onReconcile: (id: string) => void;
  onExclude: (id: string) => void;
  onMatchBill: (tx: Transaction) => void;
  onCreateExpense: (tx: Transaction) => void;
}) {
  const isCredit = tx.amount > 0;
  const isOutgoing = tx.amount < 0;
  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/30",
        !isLast && "border-b"
      )}
    >
      <div className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        isCredit ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-red-50 dark:bg-red-950/40"
      )}>
        {isCredit
          ? <ArrowDownRight className="size-4 text-emerald-600 dark:text-emerald-400" />
          : <ArrowUpRight className="size-4 text-red-600 dark:text-red-400" />
        }
      </div>

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

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {tx.status === "unreconciled" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {isOutgoing && (
                  <>
                    <DropdownMenuItem onClick={() => onMatchBill(tx)}>
                      <Link2 className="mr-2 size-3.5" />Match to Bill
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateExpense(tx)}>
                      <Receipt className="mr-2 size-3.5" />Create Expense
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => onReconcile(tx.id)}>
                  <CheckCircle className="mr-2 size-3.5" />Reconcile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExclude(tx.id)} className="text-muted-foreground">
                  <XCircle className="mr-2 size-3.5" />Exclude
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
// Import Row
// ---------------------------------------------------------------------------
export function ImportRow({ imp, isLast }: { imp: StatementImport; isLast: boolean }) {
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
// Import Sheet
// ---------------------------------------------------------------------------
export function ImportSheet({
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
        <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
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

        <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Upload File</p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setSelectedFile(f); }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 sm:px-6 sm:py-10 text-center transition-all",
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

                <div className="rounded-lg border overflow-hidden overflow-x-auto">
                  <div className="grid min-w-[320px] grid-cols-[90px_1fr_100px] gap-2 border-b bg-muted/30 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Date</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Description</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-right">Amount</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {preview.transactions.map((tx, i) => (
                      <div
                        key={`${tx.date}-${tx.description}-${i}`}
                        className={cn("grid min-w-[320px] grid-cols-[90px_1fr_100px] gap-2 px-3 py-2.5", i < preview.transactions.length - 1 && "border-b")}
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

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 sm:gap-3 border-t bg-background/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-sm">
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

// ---------------------------------------------------------------------------
// Match to Bill Sheet
// ---------------------------------------------------------------------------
export function MatchToBillSheet({
  transaction,
  onClose,
  bills,
  suggestions,
  loading,
  currencyCode,
  orgId,
  onMatched,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  bills: OpenBill[];
  suggestions: SuggestedMatch[];
  loading: boolean;
  currencyCode: string;
  orgId: string | null;
  onMatched: () => void;
}) {
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [billSearch, setBillSearch] = useState("");

  useEffect(() => {
    if (transaction) {
      setSelectedBill(null);
      setPayAmount(centsToDecimal(Math.abs(transaction.amount)));
      setBillSearch("");
    }
  }, [transaction]);

  const suggestedBillIds = useMemo(
    () => new Set(suggestions.map((s) => s.candidate.id)),
    [suggestions]
  );

  const filteredBills = useMemo(() => {
    if (!billSearch) return bills;
    const q = billSearch.toLowerCase();
    return bills.filter(
      (b) =>
        b.billNumber.toLowerCase().includes(q) ||
        b.contactName.toLowerCase().includes(q)
    );
  }, [bills, billSearch]);

  async function handleMatch() {
    if (!orgId || !transaction || !selectedBill) return;
    setSaving(true);
    try {
      const amount = Math.round(parseFloat(payAmount) * 100);
      if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          billId: selectedBill,
          amount,
          date: transaction.date,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Transaction matched to bill");
      onMatched();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to match");
    } finally {
      setSaving(false);
    }
  }

  const selected = bills.find((b) => b.id === selectedBill);

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Match to Bill</SheetTitle>
          <SheetDescription>
            Link this bank transaction to an open bill to record payment.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                  {formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Suggested Matches</p>
              <div className="space-y-1.5">
                {suggestions.map((s) => {
                  const b = bills.find((bill) => bill.id === s.candidate.id);
                  if (!b) return null;
                  return (
                    <button
                      key={s.candidate.id}
                      type="button"
                      onClick={() => { setSelectedBill(b.id); setPayAmount(centsToDecimal(Math.min(Math.abs(transaction?.amount || 0), b.amountDue))); }}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                        selectedBill === b.id && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{b.billNumber}</span>
                          <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {s.confidence}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{b.contactName} · Due {b.dueDate}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.reasons.join(", ")}</p>
                      </div>
                      <span className="font-mono text-sm font-medium tabular-nums shrink-0 ml-3">
                        {formatMoney(b.amountDue, currencyCode)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {suggestions.length > 0 ? "All Open Bills" : "Open Bills"}
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search bills..."
                value={billSearch}
                onChange={(e) => setBillSearch(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredBills.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No open bills found.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filteredBills.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { setSelectedBill(b.id); setPayAmount(centsToDecimal(Math.min(Math.abs(transaction?.amount || 0), b.amountDue))); }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                      selectedBill === b.id && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                      suggestedBillIds.has(b.id) && selectedBill !== b.id && "border-emerald-200 dark:border-emerald-900"
                    )}
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{b.billNumber}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{b.contactName} · Due {b.dueDate}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="font-mono text-sm font-medium tabular-nums">{formatMoney(b.amountDue, currencyCode)}</span>
                      <p className="text-[10px] text-muted-foreground">of {formatMoney(b.total, currencyCode)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Payment Amount</Label>
                <span className="text-[10px] text-muted-foreground">
                  Bill due: {formatMoney(selected.amountDue, currencyCode)}
                </span>
              </div>
              <Input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="font-mono"
              />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedBill || saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Matching...</> : "Match & Reconcile"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Create Expense Sheet
// ---------------------------------------------------------------------------
export function CreateExpenseSheet({
  transaction,
  onClose,
  currencyCode,
  orgId,
  onCreated,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  currencyCode: string;
  orgId: string | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.payee || transaction.description || "");
      setDescription("");
      setItemDesc(transaction.description || "");
      setItemAmount(centsToDecimal(Math.abs(transaction.amount)));
      setCategory("");
    }
  }, [transaction]);

  async function handleCreate() {
    if (!orgId || !transaction) return;
    if (!title.trim()) { toast.error("Enter a title"); return; }
    setSaving(true);
    try {
      const amount = parseFloat(itemAmount);
      if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/create-expense`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          currencyCode,
          items: [{
            date: transaction.date,
            description: itemDesc.trim() || title.trim(),
            amount,
            category: category.trim() || null,
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Expense created and transaction reconciled");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Create Expense</SheetTitle>
          <SheetDescription>
            Create an expense claim from this bank transaction.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className="font-mono font-semibold text-red-600 dark:text-red-400">
                  {formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office Supplies" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notes about this expense" />
            </div>

            <div className="h-px bg-border" />

            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expense Item</p>

            <div className="space-y-1.5">
              <Label className="text-xs">Item Description</Label>
              <Input value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} placeholder="What was purchased" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount</Label>
                <Input type="number" step="0.01" value={itemAmount} onChange={(e) => setItemAmount(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category (optional)</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Travel" />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !title.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Creating...</> : "Create Expense"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
