"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle,
  FileStack,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Receipt,
  Scale,
  Search,
  Split,
  Tags,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney, centsToDecimal } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AccountPicker } from "@/components/dashboard/account-picker";
import { ContactPicker } from "@/components/dashboard/contact-picker";

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
  // The ledger account this bank account is recorded under in the books. Set up
  // automatically; surfaced read-only so users can see the connection exists.
  chartAccountId?: string | null;
  chartAccount?: { id: string; name: string; code: string } | null;
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
  // Derived-status inputs (all optional so existing callers still compile):
  // accountId/accountCode/accountName describe the linked ledger account set
  // when categorized/matched; journalEntryId means bookkeeping was recorded;
  // reconciliationId means it's part of a completed statement reconciliation.
  accountId?: string | null;
  accountCode?: string | null;
  accountName?: string | null;
  journalEntryId?: string | null;
  reconciliationId?: string | null;
  transferTransactionId?: string | null;
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

// A match to an already-recorded payment, posted journal entry, or a transfer
// leg in another own account — returned by GET …/match as `existingMatches`.
export interface ExistingMatch {
  transactionId: string;
  candidate: {
    type: "existing_payment" | "existing_journal" | "transfer";
    id: string;
    journalEntryId: string | null;
    date: string;
    description: string;
    amount: number;
    reference: string | null;
    meta: Record<string, unknown>;
  };
  confidence: number;
  reasons: string[];
}

// A summary of another bank account in this org — used as a transfer target.
export interface BankAccountSummary {
  id: string;
  accountName: string;
  bankName: string | null;
  currencyCode: string;
  accountType: BankAccountType;
  balance: number;
  hasLedgerAccount: boolean;
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

// ---------------------------------------------------------------------------
// Derived transaction state — distinguishes the meaningfully different
// situations the raw `status` enum can't, using the existing fields:
//   • reconciledStatement: part of a completed statement reconciliation.
//   • categorized: has a journal entry (real bookkeeping was recorded).
//   • cleared: status='reconciled' but no journal entry — the cosmetic
//     "Mark as cleared" no-op (cleared on the bank, not categorized yet).
//   • toReview: status='unreconciled' — nothing done yet.
//   • excluded: status='excluded'.
// ---------------------------------------------------------------------------
export type DerivedTxState =
  | "reconciledStatement"
  | "categorized"
  | "cleared"
  | "toReview"
  | "excluded";

export function deriveTxState(tx: Transaction): DerivedTxState {
  if (tx.reconciliationId) return "reconciledStatement";
  if (tx.journalEntryId) return "categorized";
  if (tx.status === "excluded") return "excluded";
  if (tx.status === "reconciled") return "cleared";
  return "toReview";
}

export const DERIVED_STATE_META: Record<
  DerivedTxState,
  { label: string; className: string; title?: string }
> = {
  reconciledStatement: {
    label: "matched to statement",
    className: STATUS_STYLES.reconciled,
    title: "Checked off against a bank statement",
  },
  categorized: {
    label: "in your books",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    title: "Recorded in your books — assigned to a category",
  },
  cleared: {
    label: "cleared",
    className: STATUS_STYLES.unreconciled,
    title: "Confirmed against your bank — not yet recorded in your books",
  },
  toReview: {
    label: "to do",
    className: STATUS_STYLES.unreconciled,
    title: "Not recorded in your books yet",
  },
  excluded: {
    label: "ignored",
    className: STATUS_STYLES.excluded,
    title: "Left out of your books",
  },
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
  onCategorize,
  onMatchInvoice,
  onMatch,
  onTransfer,
  onSplit,
}: {
  tx: Transaction;
  cur: string;
  isLast: boolean;
  onReconcile: (id: string) => void;
  onExclude: (id: string) => void;
  onMatchBill: (tx: Transaction) => void;
  onCreateExpense: (tx: Transaction) => void;
  onCategorize: (tx: Transaction) => void;
  onMatchInvoice: (tx: Transaction) => void;
  // New actions — optional so existing callers keep compiling.
  onMatch?: (tx: Transaction) => void;
  onTransfer?: (tx: Transaction) => void;
  onSplit?: (tx: Transaction) => void;
}) {
  const isCredit = tx.amount > 0;
  const isOutgoing = tx.amount < 0;
  const [confirmClear, setConfirmClear] = useState(false);
  const derived = deriveTxState(tx);
  const stateMeta = DERIVED_STATE_META[derived];
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
          {derived === "categorized" && tx.accountName && (
            <span className="text-xs text-muted-foreground truncate shrink min-w-0" title={`Assigned to ${tx.accountName}`}>
              &rarr; {tx.accountName}
            </span>
          )}
          <Badge
            variant="outline"
            className={cn("text-[10px] shrink-0", stateMeta.className)}
            title={stateMeta.title}
          >
            {stateMeta.label}
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
              <DropdownMenuContent align="end" className="w-56">
                {onMatch && (
                  <DropdownMenuItem onClick={() => onMatch(tx)} title="Find a matching invoice, bill, or recorded payment and link this line to it">
                    <Link2 className="mr-2 size-3.5" />Find a match…
                  </DropdownMenuItem>
                )}
                {isOutgoing ? (
                  <>
                    <DropdownMenuItem onClick={() => onMatchBill(tx)} title="Link this payment to a bill you owe">
                      <Receipt className="mr-2 size-3.5" />Match to a bill you owe
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onCreateExpense(tx)} title="Record this as a business expense">
                      <FileText className="mr-2 size-3.5" />Record as an expense
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={() => onMatchInvoice(tx)} title="Link this payment received to an invoice you sent">
                    <Receipt className="mr-2 size-3.5" />Match to an invoice you sent
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onCategorize(tx)} title="Choose what this money was for (the category or account it belongs to)">
                  <Tags className="mr-2 size-3.5" />Assign to a category{isCredit ? " (loan, owner funds, income…)" : ""}
                </DropdownMenuItem>
                {onSplit && (
                  <DropdownMenuItem onClick={() => onSplit(tx)} title="Divide this one transaction across more than one category">
                    <Split className="mr-2 size-3.5" />Split across categories
                  </DropdownMenuItem>
                )}
                {onTransfer && (
                  <DropdownMenuItem onClick={() => onTransfer(tx)} title="Record this as money moved between your own accounts (not income or expense)">
                    <ArrowLeftRight className="mr-2 size-3.5" />Record a transfer between accounts
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setConfirmClear(true)} title="Confirms this matches your bank — moves no money and records no bookkeeping">
                  <CheckCircle className="mr-2 size-3.5" />Mark as cleared
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExclude(tx.id)} className="text-muted-foreground" title="Hide this line and leave it out of your books">
                  <XCircle className="mr-2 size-3.5" />Ignore this transaction
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {tx.status === "excluded" && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onExclude(tx.id)} title="Bring this transaction back into your books">Stop ignoring</Button>
          )}
        </div>
        <span className={cn(
          "font-mono text-sm font-medium tabular-nums w-24 text-right",
          isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}>
          {isCredit ? "+" : ""}{formatMoney(tx.amount, cur)}
        </span>
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as cleared?</DialogTitle>
            <DialogDescription>
              This records that the line has cleared your bank — nothing more.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="font-medium">{tx.description}</p>
              <p className={cn(
                "mt-1 font-mono text-xs tabular-nums",
                isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
              )}>
                {tx.date} · {isCredit ? "+" : ""}{formatMoney(tx.amount, cur)}
              </p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <p className="font-medium">It does not record what the money was for.</p>
              <p className="mt-1">
                No money is moved and nothing is added to your books. To record <em>what this was for</em>,
                use <span className="font-medium">{isOutgoing ? "Match to a bill you owe or Record as an expense" : "Find a match or Assign to a category"}</span> instead.
                You can undo this at any time.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { onReconcile(tx.id); setConfirmClear(false); }}
            >
              Mark as cleared
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      toast.success("Linked to bill and marked paid");
      onMatched();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't link to that bill");
    } finally {
      setSaving(false);
    }
  }

  const selected = bills.find((b) => b.id === selectedBill);

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Match to a bill you owe</SheetTitle>
          <SheetDescription>
            Link this payment to a bill you owe and mark that bill as paid.
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
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Likely matches</p>
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
              <CurrencyInput
                prefix="$"
                value={payAmount}
                onChange={setPayAmount}
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
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Linking...</> : "Link & mark paid"}
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
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setTitle(transaction.payee || transaction.description || "");
      setDescription("");
      setItemDesc(transaction.description || "");
      setItemAmount(centsToDecimal(Math.abs(transaction.amount)));
      setAccountId("");
    }
  }, [transaction]);

  async function handleCreate() {
    if (!orgId || !transaction) return;
    if (!title.trim()) { toast.error("Enter a title"); return; }
    if (!accountId) { toast.error("Choose a category for this expense"); return; }
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
            accountId,
          }],
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Expense recorded and added to your books");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the expense");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Record as an expense</SheetTitle>
          <SheetDescription>
            Record this payment as a business expense and add it to your books.
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

            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <CurrencyInput prefix="$" value={itemAmount} onChange={setItemAmount} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Category <span className="text-muted-foreground font-normal">(what kind of expense)</span>
              </Label>
              <AccountPicker
                value={accountId}
                onChange={setAccountId}
                typeFilter={["expense"]}
                placeholder="Choose what this was for, e.g. Bank Fees & Charges"
                allowCreate
              />
              <p className="text-[11px] text-muted-foreground">
                This is what the expense is recorded as in your books. Without it, the amount would land in
                a generic “Miscellaneous” category.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            disabled={saving || !title.trim() || !accountId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Recording...</> : "Record expense"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Tax preview — mirrors the server's split so the user sees exactly what posts
// before confirming (the amount is tax-inclusive for bank lines).
// ---------------------------------------------------------------------------
export interface TaxRateOption {
  id: string;
  name: string;
  rate: number; // basis points
  kind?: string;
  recoverablePercent?: number;
}

function splitTaxPreview(
  gross: number,
  t: TaxRateOption,
  isCredit: boolean
): { net: number; tax: number; recoverable: number; absorbed: number } | null {
  const kind = t.kind || "standard";
  if (t.rate <= 0 || kind === "exempt" || kind === "no_vat" || kind === "reverse_charge") return null;
  const tax = Math.round((gross * t.rate) / (10000 + t.rate));
  const net = gross - tax;
  if (isCredit) return { net, tax, recoverable: tax, absorbed: 0 };
  if (kind === "sales_tax_us") return { net: gross, tax, recoverable: 0, absorbed: tax };
  const recoverableBp = t.recoverablePercent ?? 10000;
  const recoverable = Math.round((tax * recoverableBp) / 10000);
  return { net, tax, recoverable, absorbed: tax - recoverable };
}

// ---------------------------------------------------------------------------
// Categorize Sheet — code a transaction to ANY ledger account: income,
// expense, a loan received/repaid, owner contribution/drawings, a transfer, etc.
// The account chosen determines the meaning; the double entry follows the sign.
// ---------------------------------------------------------------------------
export function CategorizeSheet({
  transaction,
  onClose,
  currencyCode,
  orgId,
  onCategorized,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  currencyCode: string;
  orgId: string | null;
  onCategorized: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [memo, setMemo] = useState("");
  const [taxRateId, setTaxRateId] = useState("none");
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [saving, setSaving] = useState(false);

  const isCredit = (transaction?.amount ?? 0) > 0;

  useEffect(() => {
    if (transaction) {
      setAccountId("");
      setContactId("");
      setMemo("");
      setTaxRateId("none");
    }
  }, [transaction]);

  useEffect(() => {
    if (!transaction || !orgId || taxRates.length > 0) return;
    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setTaxRates(data.taxRates); })
      .catch(() => {});
  }, [transaction, orgId, taxRates.length]);

  const selectedTax = taxRates.find((t) => t.id === taxRateId) || null;
  const taxPreview = useMemo(
    () => (selectedTax && transaction ? splitTaxPreview(Math.abs(transaction.amount), selectedTax, isCredit) : null),
    [selectedTax, transaction, isCredit]
  );

  async function handleSave() {
    if (!orgId || !transaction) return;
    if (!accountId) { toast.error("Choose a category"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/categorize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          accountId,
          contactId: contactId || null,
          memo: memo.trim() || null,
          taxRateId: taxRateId === "none" ? null : taxRateId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Assigned and added to your books");
      onCategorized();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't assign this transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Assign to a category</SheetTitle>
          <SheetDescription>
            Choose what this {isCredit ? "money in" : "money out"} was for. This adds it to your books.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className={cn("font-mono font-semibold", isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {isCredit ? "+" : ""}{formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <AccountPicker value={accountId} onChange={setAccountId} placeholder="Search every category…" allowCreate />
            <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
              {isCredit ? (
                <>
                  <p className="font-medium text-foreground">Money in — common choices:</p>
                  <p>• A sale / normal trade → an <span className="font-medium">Income</span> account</p>
                  <p>• A loan you received (incl. your own personal / director&apos;s loan) → a <span className="font-medium">Liability</span> account (e.g. Short-Term Loans)</p>
                  <p>• Your own money put into the business → an <span className="font-medium">Equity</span> account (e.g. Owner&apos;s Equity)</p>
                  <p>• Moving money in from another of your accounts → that account&apos;s <span className="font-medium">bank / asset</span> account</p>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">Money out — common choices:</p>
                  <p>• A running cost → an <span className="font-medium">Expense</span> account (e.g. Bank Fees &amp; Charges)</p>
                  <p>• Repaying a loan → the <span className="font-medium">Liability</span> account for that loan</p>
                  <p>• Taking money out for yourself → an <span className="font-medium">Equity</span> account (Owner&apos;s Drawings)</p>
                  <p>• Moving money to another of your accounts → that account&apos;s <span className="font-medium">bank / asset</span> account</p>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Tax <span className="text-muted-foreground font-normal">(the amount is treated as tax-inclusive)</span></Label>
            <Select value={taxRateId} onValueChange={setTaxRateId}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No tax</SelectItem>
                {taxRates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({(t.rate / 100).toFixed(t.rate % 100 === 0 ? 0 : 2)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {taxPreview && (
              <div className="rounded-lg border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
                <div className="flex justify-between"><span>Net</span><span className="font-mono tabular-nums">{formatMoney(taxPreview.net, currencyCode)}</span></div>
                {isCredit ? (
                  <div className="flex justify-between"><span>Tax collected (→ output VAT)</span><span className="font-mono tabular-nums">{formatMoney(taxPreview.tax, currencyCode)}</span></div>
                ) : (
                  <>
                    {taxPreview.recoverable > 0 && (
                      <div className="flex justify-between"><span>VAT reclaimable (→ input VAT)</span><span className="font-mono tabular-nums">{formatMoney(taxPreview.recoverable, currencyCode)}</span></div>
                    )}
                    {taxPreview.absorbed > 0 && (
                      <div className="flex justify-between"><span>VAT absorbed into cost</span><span className="font-mono tabular-nums">{formatMoney(taxPreview.absorbed, currencyCode)}</span></div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contact (optional)</Label>
            <ContactPicker value={contactId} onChange={setContactId} placeholder="Who was this with?" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Memo (optional)</Label>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Note for your records" />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !accountId} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Saving…</> : "Assign to category"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Match to Invoice Sheet — link an incoming transaction to an open invoice
// (records the received payment + posts DR Bank / CR Accounts Receivable).
// ---------------------------------------------------------------------------
export interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  contactName: string;
  dueDate: string;
  total: number;
  amountDue: number;
  status: string;
}

export function MatchToInvoiceSheet({
  transaction,
  onClose,
  invoices,
  suggestions,
  loading,
  currencyCode,
  orgId,
  onMatched,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  invoices: OpenInvoice[];
  suggestions: SuggestedMatch[];
  loading: boolean;
  currencyCode: string;
  orgId: string | null;
  onMatched: () => void;
}) {
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (transaction) {
      setSelectedInvoice(null);
      setPayAmount(centsToDecimal(Math.abs(transaction.amount)));
      setSearch("");
    }
  }, [transaction]);

  const suggestedIds = useMemo(
    () => new Set(suggestions.map((s) => s.candidate.id)),
    [suggestions]
  );

  const filtered = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.contactName.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  async function handleMatch() {
    if (!orgId || !transaction || !selectedInvoice) return;
    setSaving(true);
    try {
      const amount = Math.round(parseFloat(payAmount) * 100);
      if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/match-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ invoiceId: selectedInvoice, amount, date: transaction.date }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Linked to invoice and marked paid");
      onMatched();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't link to that invoice");
    } finally {
      setSaving(false);
    }
  }

  const selected = invoices.find((inv) => inv.id === selectedInvoice);

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Match to an invoice you sent</SheetTitle>
          <SheetDescription>
            Link this payment received to an invoice you sent and mark that invoice as paid.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          {suggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Likely matches</p>
              <div className="space-y-1.5">
                {suggestions.map((s) => {
                  const inv = invoices.find((i) => i.id === s.candidate.id);
                  if (!inv) return null;
                  return (
                    <button
                      key={s.candidate.id}
                      type="button"
                      onClick={() => { setSelectedInvoice(inv.id); setPayAmount(centsToDecimal(Math.min(Math.abs(transaction?.amount || 0), inv.amountDue))); }}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                        selectedInvoice === inv.id && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                          <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {s.confidence}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{inv.contactName} · Due {inv.dueDate}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.reasons.join(", ")}</p>
                      </div>
                      <span className="font-mono text-sm font-medium tabular-nums shrink-0 ml-3">
                        {formatMoney(inv.amountDue, currencyCode)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {suggestions.length > 0 ? "All Open Invoices" : "Open Invoices"}
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-xs"
              />
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No open invoices found.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {filtered.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => { setSelectedInvoice(inv.id); setPayAmount(centsToDecimal(Math.min(Math.abs(transaction?.amount || 0), inv.amountDue))); }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                      selectedInvoice === inv.id && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                      suggestedIds.has(inv.id) && selectedInvoice !== inv.id && "border-emerald-200 dark:border-emerald-900"
                    )}
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{inv.invoiceNumber}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{inv.contactName} · Due {inv.dueDate}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className="font-mono text-sm font-medium tabular-nums">{formatMoney(inv.amountDue, currencyCode)}</span>
                      <p className="text-[10px] text-muted-foreground">of {formatMoney(inv.total, currencyCode)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Amount Received</Label>
                <span className="text-[10px] text-muted-foreground">
                  Invoice due: {formatMoney(selected.amountDue, currencyCode)}
                </span>
              </div>
              <CurrencyInput prefix="$" value={payAmount} onChange={setPayAmount} />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedInvoice || saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Linking...</> : "Link & mark paid"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Find & Match Sheet — the unified "match this line to an existing record"
// surface. Surfaces ranked suggestions across:
//   • open invoices / bills (records a NEW payment + JE),
//   • already-recorded payments on this bank (links, no new JE),
//   • already-posted journal entries hitting the bank (links, no new JE),
//   • a transfer leg in another own account (links, no new JE).
// All go through POST …/match with a `matchType` discriminator.
// ---------------------------------------------------------------------------
const EXISTING_TYPE_META: Record<
  ExistingMatch["candidate"]["type"],
  { label: string; className: string }
> = {
  existing_payment: {
    label: "Payment already recorded",
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  existing_journal: {
    label: "Already in your books",
    className: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  transfer: {
    label: "Transfer",
    className: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  },
};

export function MatchSheet({
  transaction,
  onClose,
  invoices,
  bills,
  documentSuggestions,
  existingMatches,
  loading,
  currencyCode,
  orgId,
  onMatched,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  invoices: OpenInvoice[];
  bills: OpenBill[];
  documentSuggestions: SuggestedMatch[];
  existingMatches: ExistingMatch[];
  loading: boolean;
  currencyCode: string;
  orgId: string | null;
  onMatched: () => void;
}) {
  // A unified selection: either an existing record, or an open document.
  type Selection =
    | { kind: "existing"; match: ExistingMatch }
    | { kind: "invoice"; doc: OpenInvoice }
    | { kind: "bill"; doc: OpenBill };
  const [selection, setSelection] = useState<Selection | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const isCredit = (transaction?.amount ?? 0) > 0;

  useEffect(() => {
    if (transaction) {
      setSelection(null);
      setPayAmount(centsToDecimal(Math.abs(transaction.amount)));
      setSearch("");
    }
  }, [transaction]);

  const docList = isCredit ? invoices : bills;
  const filteredDocs = useMemo(() => {
    if (!search) return docList;
    const q = search.toLowerCase();
    return docList.filter((d) => {
      const num = isCredit ? (d as OpenInvoice).invoiceNumber : (d as OpenBill).billNumber;
      return num.toLowerCase().includes(q) || d.contactName.toLowerCase().includes(q);
    });
  }, [docList, search, isCredit]);

  async function handleMatch() {
    if (!orgId || !transaction || !selection) return;
    setSaving(true);
    try {
      let body: Record<string, unknown>;
      if (selection.kind === "existing") {
        const c = selection.match.candidate;
        if (c.type === "existing_payment") {
          body = { matchType: "existing_payment", paymentId: c.id };
        } else {
          // existing_journal and transfer leg both link an already-posted JE.
          body = { matchType: "existing_journal", journalEntryId: c.journalEntryId };
        }
      } else {
        const amount = Math.round(parseFloat(payAmount) * 100);
        if (!amount || amount <= 0) { toast.error("Enter a valid amount"); setSaving(false); return; }
        body = selection.kind === "invoice"
          ? { matchType: "invoice", invoiceId: selection.doc.id, amount, date: transaction.date }
          : { matchType: "bill", billId: selection.doc.id, amount, date: transaction.date };
      }
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Linked");
      onMatched();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't link this transaction");
    } finally {
      setSaving(false);
    }
  }

  const needsAmount = selection?.kind === "invoice" || selection?.kind === "bill";

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Find a match</SheetTitle>
          <SheetDescription>
            Link this {isCredit ? "money in" : "money out"} to something you&apos;ve already recorded, a
            transfer, or an open {isCredit ? "invoice" : "bill"}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className={cn("font-mono font-semibold", isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {isCredit ? "+" : ""}{formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {existingMatches.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Already in your books</p>
                  <div className="space-y-1.5">
                    {existingMatches.map((m) => {
                      const meta = EXISTING_TYPE_META[m.candidate.type];
                      const isSelected = selection?.kind === "existing" && selection.match.candidate.id === m.candidate.id && selection.match.candidate.type === m.candidate.type;
                      return (
                        <button
                          key={`${m.candidate.type}-${m.candidate.id}`}
                          type="button"
                          onClick={() => setSelection({ kind: "existing", match: m })}
                          className={cn(
                            "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                            isSelected && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={cn("text-[10px]", meta.className)}>{meta.label}</Badge>
                              <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {m.confidence}% match
                              </Badge>
                            </div>
                            <p className="text-sm font-medium truncate mt-1">{m.candidate.description}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{m.candidate.date} · {m.reasons.join(", ")}</p>
                          </div>
                          <span className="font-mono text-sm font-medium tabular-nums shrink-0 ml-3">
                            {formatMoney(m.candidate.amount, currencyCode)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Linking to something already in your books just connects this line — it doesn&apos;t record it twice.
                  </p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Open {isCredit ? "Invoices" : "Bills"}
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${isCredit ? "invoices" : "bills"}...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-8 text-xs"
                  />
                </div>
                {filteredDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No open {isCredit ? "invoices" : "bills"} found.</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {filteredDocs.map((d) => {
                      const num = isCredit ? (d as OpenInvoice).invoiceNumber : (d as OpenBill).billNumber;
                      const suggested = documentSuggestions.find((s) => s.candidate.id === d.id);
                      const isSelected = (selection?.kind === "invoice" || selection?.kind === "bill") && selection.doc.id === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setSelection(isCredit ? { kind: "invoice", doc: d as OpenInvoice } : { kind: "bill", doc: d as OpenBill });
                            setPayAmount(centsToDecimal(Math.min(Math.abs(transaction?.amount || 0), d.amountDue)));
                          }}
                          className={cn(
                            "w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                            isSelected && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
                            suggested && !isSelected && "border-emerald-200 dark:border-emerald-900"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{num}</span>
                              {suggested && (
                                <Badge variant="outline" className="text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {suggested.confidence}% match
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{d.contactName} · Due {d.dueDate}</p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <span className="font-mono text-sm font-medium tabular-nums">{formatMoney(d.amountDue, currencyCode)}</span>
                            <p className="text-[10px] text-muted-foreground">of {formatMoney(d.total, currencyCode)}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {needsAmount && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Label className="text-xs">{isCredit ? "Amount Received" : "Payment Amount"}</Label>
                  <CurrencyInput prefix="$" value={payAmount} onChange={setPayAmount} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleMatch} disabled={!selection || saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Linking…</> : "Link"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Transfer Sheet — record this line as a transfer between two of the org's
// own bank accounts. Optionally pin the matching statement line in the other
// account (otherwise a mirror line is created). Posts DR/CR bank ↔ bank.
// ---------------------------------------------------------------------------
export function TransferSheet({
  transaction,
  onClose,
  bankAccounts,
  currentBankAccountId,
  currencyCode,
  orgId,
  onTransferred,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  bankAccounts: BankAccountSummary[];
  currentBankAccountId: string;
  currencyCode: string;
  orgId: string | null;
  onTransferred: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [counterTx, setCounterTx] = useState<string | null>(null);
  const [counterCandidates, setCounterCandidates] = useState<Transaction[]>([]);
  const [loadingCounters, setLoadingCounters] = useState(false);
  const [saving, setSaving] = useState(false);

  const isCredit = (transaction?.amount ?? 0) > 0;

  const targets = useMemo(
    () => bankAccounts.filter((b) => b.id !== currentBankAccountId),
    [bankAccounts, currentBankAccountId]
  );

  useEffect(() => {
    if (transaction) {
      setTargetId("");
      setCounterTx(null);
      setCounterCandidates([]);
    }
  }, [transaction]);

  // When a target account is chosen, look for an unreconciled statement line in
  // it with the opposite sign + equal magnitude to suggest as the counter line.
  useEffect(() => {
    if (!targetId || !orgId || !transaction) { setCounterCandidates([]); setCounterTx(null); return; }
    setLoadingCounters(true);
    setCounterTx(null);
    fetch(`/api/v1/bank-accounts/${targetId}/transactions?status=unreconciled&limit=100`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        const want = -transaction.amount;
        const candidates = (data.data ?? []).filter((t: Transaction) => t.amount === want);
        setCounterCandidates(candidates);
      })
      .catch(() => setCounterCandidates([]))
      .finally(() => setLoadingCounters(false));
  }, [targetId, orgId, transaction]);

  async function handleTransfer() {
    if (!orgId || !transaction || !targetId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/match-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ targetBankAccountId: targetId, counterTransactionId: counterTx }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(counterTx ? "Transfer linked" : "Transfer recorded");
      onTransferred();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record the transfer");
    } finally {
      setSaving(false);
    }
  }

  const selectedTarget = targets.find((t) => t.id === targetId);

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Record a transfer between accounts</SheetTitle>
          <SheetDescription>
            Record this line as money moving {isCredit ? "in from" : "out to"} another of your own
            bank accounts. It&apos;s not counted as income or an expense.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className={cn("font-mono font-semibold", isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {isCredit ? "+" : ""}{formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">{isCredit ? "Transferred from" : "Transferred to"}</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose another bank account…" /></SelectTrigger>
              <SelectContent>
                {targets.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No other bank accounts.</div>
                ) : (
                  targets.map((t) => (
                    <SelectItem key={t.id} value={t.id} disabled={!t.hasLedgerAccount}>
                      {t.accountName}
                      {t.bankName ? ` · ${t.bankName}` : ""}
                      {!t.hasLedgerAccount ? " (not set up for bookkeeping yet)" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedTarget && !selectedTarget.hasLedgerAccount && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This account isn&apos;t set up for bookkeeping yet — finish setting it up in its settings first.
              </p>
            )}
          </div>

          {targetId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Matching line in that account (optional)</Label>
              {loadingCounters ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Looking for a matching line…
                </div>
              ) : counterCandidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  No matching line found. A mirror transaction will be created in the other account.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {counterCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCounterTx(counterTx === c.id ? null : c.id)}
                      className={cn(
                        "w-full flex items-center justify-between rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50",
                        counterTx === c.id && "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{c.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{c.date}</p>
                      </div>
                      <span className="font-mono text-xs font-medium tabular-nums shrink-0 ml-3">
                        {formatMoney(c.amount, currencyCode)}
                      </span>
                    </button>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    Pick the matching line to link both sides, or leave it unselected to add the other side automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleTransfer}
            disabled={!targetId || saving || (selectedTarget && !selectedTarget.hasLedgerAccount)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Recording…</> : "Record Transfer"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Split Account Sheet — code one bank line across multiple GL accounts. Each
// allocation is tax-inclusive; the sum must equal the absolute tx amount.
// ---------------------------------------------------------------------------
interface SplitAllocationDraft {
  key: string;
  accountId: string;
  amount: string; // decimal string
  taxRateId: string; // "none" or id
  memo: string;
}

let splitKeySeq = 0;
function newSplitRow(amount = ""): SplitAllocationDraft {
  return { key: `split-${splitKeySeq++}`, accountId: "", amount, taxRateId: "none", memo: "" };
}

export function SplitAccountSheet({
  transaction,
  onClose,
  currencyCode,
  orgId,
  onSplit,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  currencyCode: string;
  orgId: string | null;
  onSplit: () => void;
}) {
  const [rows, setRows] = useState<SplitAllocationDraft[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [saving, setSaving] = useState(false);

  const isCredit = (transaction?.amount ?? 0) > 0;
  const totalCents = Math.abs(transaction?.amount ?? 0);

  useEffect(() => {
    if (transaction) {
      // Seed with the whole amount on the first row + one empty row to split into.
      setRows([newSplitRow(centsToDecimal(Math.abs(transaction.amount))), newSplitRow()]);
    }
  }, [transaction]);

  useEffect(() => {
    if (!transaction || !orgId || taxRates.length > 0) return;
    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setTaxRates(data.taxRates); })
      .catch(() => {});
  }, [transaction, orgId, taxRates.length]);

  const allocatedCents = useMemo(
    () => rows.reduce((sum, r) => sum + (Math.round(parseFloat(r.amount) * 100) || 0), 0),
    [rows]
  );
  const remainingCents = totalCents - allocatedCents;
  const balanced = remainingCents === 0;

  function updateRow(key: string, patch: Partial<SplitAllocationDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }
  function addRow() {
    // Pre-fill the new row with the outstanding remainder, if any.
    setRows((prev) => [...prev, newSplitRow(remainingCents > 0 ? centsToDecimal(remainingCents) : "")]);
  }

  async function handleSave() {
    if (!orgId || !transaction) return;
    const allocations = rows
      .filter((r) => r.accountId && parseFloat(r.amount) > 0)
      .map((r) => ({
        accountId: r.accountId,
        amount: Math.round(parseFloat(r.amount) * 100),
        taxRateId: r.taxRateId === "none" ? null : r.taxRateId,
        memo: r.memo.trim() || null,
      }));
    if (allocations.length === 0) { toast.error("Add at least one part with a category and amount"); return; }
    if (allocations.reduce((s, a) => s + a.amount, 0) !== totalCents) {
      toast.error("The parts must add up to the transaction amount");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/bank-transactions/${transaction.id}/split-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ allocations }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Split across categories and added to your books");
      onSplit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't split this transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!transaction} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-4 pt-5 pb-4 sm:px-6 border-b shrink-0">
          <SheetTitle className="text-lg">Split across categories</SheetTitle>
          <SheetDescription>
            Divide this {isCredit ? "money in" : "money out"} across several categories. Each amount
            includes tax and they must add up to the full transaction.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {transaction && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground mb-1">Bank Transaction</p>
              <p className="text-sm font-medium">{transaction.description}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                <span>{transaction.date}</span>
                <span className={cn("font-mono font-semibold", isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                  {isCredit ? "+" : ""}{formatMoney(transaction.amount, currencyCode)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div key={row.key} className="rounded-lg border p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Part {i + 1}</span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      className="text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Category</Label>
                  <AccountPicker value={row.accountId} onChange={(v) => updateRow(row.key, { accountId: v })} placeholder="Choose a category…" allowCreate />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount</Label>
                    <CurrencyInput prefix="$" value={row.amount} onChange={(v) => updateRow(row.key, { amount: v })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tax</Label>
                    <Select value={row.taxRateId} onValueChange={(v) => updateRow(row.key, { taxRateId: v })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No tax</SelectItem>
                        {taxRates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({(t.rate / 100).toFixed(t.rate % 100 === 0 ? 0 : 2)}%)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Memo (optional)</Label>
                  <Input value={row.memo} onChange={(e) => updateRow(row.key, { memo: e.target.value })} placeholder="Note for this part" className="h-8 text-sm" />
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRow} className="w-full">
              <Plus className="mr-1.5 size-3.5" />Add another part
            </Button>
          </div>

          <div className={cn(
            "flex items-center justify-between rounded-lg border p-3 text-sm",
            balanced ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
          )}>
            <div>
              <p className="text-xs text-muted-foreground">Allocated</p>
              <p className="font-mono font-medium tabular-nums">{formatMoney(allocatedCents, currencyCode)} of {formatMoney(totalCents, currencyCode)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{remainingCents >= 0 ? "Remaining" : "Over by"}</p>
              <p className={cn("font-mono font-medium tabular-nums", balanced ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {formatMoney(Math.abs(remainingCents), currencyCode)}
              </p>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/80 px-4 py-3 sm:px-6 backdrop-blur-sm shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !balanced} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Saving…</> : "Save split"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Cash Coding Grid — a spreadsheet-style view to code many uncategorized lines
// at once. Each row gets an account / tax / contact + optional memo; "fill
// down" copies the first set row's account+tax+contact to every empty row.
// Posts via POST /api/v1/bulk/bank-transactions/categorize.
// ---------------------------------------------------------------------------
interface CashCodingRow {
  account: string;
  taxRateId: string; // "none" | id
  contact: string;
  memo: string;
}

export function CashCodingGrid({
  transactions,
  currencyCode,
  orgId,
  onDone,
}: {
  transactions: Transaction[];
  currencyCode: string;
  orgId: string | null;
  onDone: () => void;
}) {
  // Only lines that still need coding (no journal entry yet, not excluded).
  const codeable = useMemo(
    () => transactions.filter((t) => !t.journalEntryId && t.status !== "excluded"),
    [transactions]
  );

  const [rows, setRows] = useState<Record<string, CashCodingRow>>({});
  const [taxRates, setTaxRates] = useState<TaxRateOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgId || taxRates.length > 0) return;
    fetch("/api/v1/tax-rates", { headers: { "x-organization-id": orgId } })
      .then((r) => r.json())
      .then((data) => { if (data.taxRates) setTaxRates(data.taxRates); })
      .catch(() => {});
  }, [orgId, taxRates.length]);

  function rowFor(id: string): CashCodingRow {
    return rows[id] || { account: "", taxRateId: "none", contact: "", memo: "" };
  }
  function updateRow(id: string, patch: Partial<CashCodingRow>) {
    setRows((prev) => ({ ...prev, [id]: { ...rowFor(id), ...patch } }));
  }

  // Copy the first coded row's account/tax/contact into every row that has no
  // account chosen yet — the classic "fill down" cash-coding shortcut.
  function fillDown() {
    const firstCoded = codeable.find((t) => rowFor(t.id).account);
    if (!firstCoded) { toast.error("Choose a category on the first row first"); return; }
    const src = rowFor(firstCoded.id);
    setRows((prev) => {
      const next = { ...prev };
      for (const t of codeable) {
        const cur = next[t.id] || { account: "", taxRateId: "none", contact: "", memo: "" };
        if (!cur.account) {
          next[t.id] = { ...cur, account: src.account, taxRateId: src.taxRateId, contact: src.contact };
        }
      }
      return next;
    });
  }

  const readyIds = useMemo(
    () => codeable.filter((t) => rowFor(t.id).account).map((t) => t.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codeable, rows]
  );

  async function handleSave() {
    if (!orgId || readyIds.length === 0) return;
    setSaving(true);
    try {
      const items = readyIds.map((id) => {
        const r = rowFor(id);
        return {
          transactionId: id,
          accountId: r.account,
          contactId: r.contact || null,
          taxRateId: r.taxRateId === "none" ? null : r.taxRateId,
          memo: r.memo.trim() || null,
        };
      });
      const res = await fetch("/api/v1/bulk/bank-transactions/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to code transactions");
      const { succeeded, failed } = data.summary || { succeeded: 0, failed: 0 };
      if (failed > 0) {
        toast.warning(`Assigned ${succeeded}, ${failed} failed`);
      } else {
        toast.success(`Assigned ${succeeded} transaction${succeeded !== 1 ? "s" : ""}`);
      }
      setRows({});
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't assign these transactions");
    } finally {
      setSaving(false);
    }
  }

  if (codeable.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
        <CheckCircle className="size-8 text-emerald-500" />
        <p className="text-sm text-muted-foreground">Nothing left to do — every line has a category.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{codeable.length}</span> line{codeable.length !== 1 ? "s" : ""} to assign
          {readyIds.length > 0 && <> · <span className="text-emerald-600 dark:text-emerald-400">{readyIds.length} ready</span></>}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fillDown} title="Copy the first filled-in row's category, tax and contact to every blank row">
            <ArrowDownRight className="mr-1.5 size-3.5" />Fill down
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || readyIds.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Saving…</> : <>Assign {readyIds.length || ""}</>}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[900px] grid-cols-[150px_minmax(0,1fr)_220px_150px_180px] gap-2 border-b bg-muted/30 px-3 py-2">
          {["Transaction", "Amount", "Category", "Tax", "Contact"].map((h) => (
            <span key={h} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</span>
          ))}
        </div>
        <div className="divide-y">
          {codeable.map((tx) => {
            const r = rowFor(tx.id);
            const isCredit = tx.amount > 0;
            return (
              <div key={tx.id} className="grid min-w-[900px] grid-cols-[150px_minmax(0,1fr)_220px_150px_180px] items-center gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" title={tx.description}>{tx.description}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.date}</p>
                </div>
                <span className={cn(
                  "font-mono text-xs font-medium tabular-nums",
                  isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {isCredit ? "+" : ""}{formatMoney(tx.amount, currencyCode)}
                </span>
                <AccountPicker value={r.account} onChange={(v) => updateRow(tx.id, { account: v })} placeholder="Category…" />
                <Select value={r.taxRateId} onValueChange={(v) => updateRow(tx.id, { taxRateId: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tax</SelectItem>
                    {taxRates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({(t.rate / 100).toFixed(t.rate % 100 === 0 ? 0 : 2)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ContactPicker value={r.contact} onChange={(v) => updateRow(tx.id, { contact: v })} placeholder="Contact…" />
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Choose a category on a line to include it. Amounts include tax. Use Fill down to
        copy the first filled-in row&apos;s category, tax and contact to every blank row.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation Report — statement end balance vs GL balance with a running
// difference, the reconciled / unreconciled splits, and a write-off Adjustment
// action to clear a residual difference. Reads GET …/reconciliation; the
// Adjustment posts via POST …/reconciliation { action: "adjustment" }.
// ---------------------------------------------------------------------------
export interface ReconciliationData {
  bankAccountId: string;
  reconciliation: {
    id: string;
    startDate: string;
    endDate: string;
    startBalance: number;
    endBalance: number;
    status: string;
  } | null;
  statementEndBalance: number;
  glBalance: number | null;
  difference: number | null;
  isBalanced: boolean;
  hasLedgerAccount: boolean;
  reconciled: { count: number; total: number; transactions: Transaction[] };
  unreconciled: { count: number; total: number; transactions: Transaction[] };
}

export function ReconciliationReport({
  data,
  currencyCode,
  orgId,
  bankAccountId,
  onChanged,
}: {
  data: ReconciliationData;
  currencyCode: string;
  orgId: string | null;
  bankAccountId: string;
  onChanged: () => void;
}) {
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDesc, setAdjustDesc] = useState("");
  const [posting, setPosting] = useState(false);

  const diff = data.difference;
  const balanced = data.isBalanced;

  async function postAdjustment() {
    if (!orgId || diff == null || diff === 0) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/v1/bank-accounts/${bankAccountId}/reconciliation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          action: "adjustment",
          amount: diff,
          date: data.reconciliation?.endDate || new Date().toISOString().slice(0, 10),
          description: adjustDesc.trim() || "Reconciliation adjustment",
          reconciliationId: data.reconciliation?.id,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Difference written off");
      setAdjustOpen(false);
      setAdjustDesc("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write off the difference");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Bank statement balance</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">{formatMoney(data.statementEndBalance, currencyCode)}</p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Balance in your books</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
              {data.glBalance == null ? "—" : formatMoney(data.glBalance, currencyCode)}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Difference</p>
            <p className={cn(
              "mt-1 text-xl font-semibold font-mono tabular-nums",
              diff == null ? "text-muted-foreground" : balanced ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
            )}>
              {diff == null ? "—" : formatMoney(diff, currencyCode)}
            </p>
          </div>
        </div>
        <div className={cn(
          "flex flex-wrap items-center gap-2 border-t px-4 py-2.5",
          balanced ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-amber-50/50 dark:bg-amber-950/20"
        )}>
          {!data.hasLedgerAccount ? (
            <span className="text-xs text-muted-foreground">This bank account isn&apos;t set up for bookkeeping yet, so its balance in your books can&apos;t be worked out.</span>
          ) : balanced ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle className="size-3.5" />Your books match the statement.
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <Scale className="size-3.5" />
                {diff != null && diff > 0
                  ? "The statement shows more than your books."
                  : "Your books show more than the statement."}
              </span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)} disabled={diff == null || diff === 0} title="Add a small entry so your books match the statement exactly">
                <Scale className="mr-1.5 size-3.5" />Write off the difference
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Matched to statement</span>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {data.reconciled.count} · {formatMoney(data.reconciled.total, currencyCode)}
            </span>
          </div>
          <RecLineList transactions={data.reconciled.transactions} currencyCode={currencyCode} empty="Nothing matched to the statement yet." />
        </div>
        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not yet matched</span>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {data.unreconciled.count} · {formatMoney(data.unreconciled.total, currencyCode)}
            </span>
          </div>
          <RecLineList transactions={data.unreconciled.transactions} currencyCode={currencyCode} empty="Nothing left to match." />
        </div>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write off the difference</DialogTitle>
            <DialogDescription>
              This adds a small entry for the leftover difference so your books match the statement exactly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Adjustment amount</span>
                <span className={cn(
                  "font-mono font-semibold tabular-nums",
                  diff != null && diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                )}>
                  {diff != null ? formatMoney(diff, currencyCode) : "—"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {diff != null && diff > 0
                  ? "Recorded as a small bit of miscellaneous income."
                  : "Recorded as a small miscellaneous expense."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={adjustDesc} onChange={(e) => setAdjustDesc(e.target.value)} placeholder="e.g. Bank rounding difference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={postAdjustment} disabled={posting || diff == null || diff === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {posting ? <><Loader2 className="mr-2 size-3.5 animate-spin" />Saving…</> : "Write off the difference"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecLineList({
  transactions,
  currencyCode,
  empty,
}: {
  transactions: Transaction[];
  currencyCode: string;
  empty: string;
}) {
  if (transactions.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="max-h-72 divide-y overflow-y-auto">
      {transactions.map((tx) => {
        const isCredit = tx.amount > 0;
        return (
          <div key={tx.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{tx.description}</p>
              <p className="text-[10px] text-muted-foreground">{tx.date}{tx.accountName ? ` · ${tx.accountName}` : ""}</p>
            </div>
            <span className={cn(
              "font-mono text-xs font-medium tabular-nums shrink-0",
              isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}>
              {isCredit ? "+" : ""}{formatMoney(tx.amount, currencyCode)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
