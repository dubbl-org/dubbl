"use client";

import { useState, useMemo } from "react";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { Clock3, LayoutList, Search, Table2, X } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useBankAccountContext } from "../layout";
import { TransactionRow, CashCodingGrid } from "../../_components";

export default function BankTransactionsPage() {
  const {
    account,
    transactions,
    summary,
    refetch,
    handleReconcile,
    handleExclude,
    handleOpenMatch,
    handleOpenExpense,
    handleOpenCategorize,
    handleOpenMatchInvoice,
    handleOpenMatchUnified,
    handleOpenTransfer,
    handleOpenSplit,
  } = useBankAccountContext();

  const cur = account.currencyCode;
  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Accounting \u00B7 Bank Transactions");

  const [viewMode, setViewMode] = useState<"list" | "cash-coding">("list");
  const [statusFilter, setStatusFilter] = useState("all");
  const [txSearch, setTxSearch] = useState("");
  const debouncedTxSearch = useDebounce(txSearch);
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");
  const [txSort, setTxSort] = useState("date:desc");

  const txSearchPending = txSearch !== debouncedTxSearch;

  const filteredTx = useMemo(() => {
    let result = transactions;
    if (statusFilter !== "all") result = result.filter((tx) => tx.status === statusFilter);
    if (debouncedTxSearch) {
      const q = debouncedTxSearch.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.description.toLowerCase().includes(q) ||
          tx.reference?.toLowerCase().includes(q) ||
          tx.payee?.toLowerCase().includes(q)
      );
    }
    if (txDateFrom) result = result.filter((tx) => tx.date >= txDateFrom);
    if (txDateTo) result = result.filter((tx) => tx.date <= txDateTo);
    const [sortKey, sortDir] = txSort.split(":");
    result = [...result].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "date") return mul * a.date.localeCompare(b.date);
      if (sortKey === "amount") return mul * (Math.abs(a.amount) - Math.abs(b.amount));
      return 0;
    });
    return result;
  }, [transactions, statusFilter, debouncedTxSearch, txDateFrom, txDateTo, txSort]);

  return (
    <div className="space-y-4">
      {/* View toggle: list vs cash-coding grid */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border p-0.5">
          {[
            { value: "list" as const, label: "List", icon: LayoutList },
            { value: "cash-coding" as const, label: "Assign in bulk", icon: Table2 },
          ].map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewMode(value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                viewMode === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "cash-coding" ? (
        <CashCodingGrid
          transactions={transactions}
          currencyCode={cur}
          orgId={orgId}
          onDone={refetch}
        />
      ) : (
      <div className="space-y-4">
      {/* Status tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unreconciled" title="Transactions you haven't dealt with yet">
              To do
              {summary.unreconciled > 0 && <span className="ml-1 tabular-nums text-amber-600">{summary.unreconciled}</span>}
            </TabsTrigger>
            <TabsTrigger value="reconciled" title="Transactions you've already dealt with">Done</TabsTrigger>
            <TabsTrigger value="excluded" title="Transactions left out of your books">Ignored</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={txSearch}
            onChange={(e) => setTxSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Date range + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">From</span>
          <DatePicker
            value={txDateFrom}
            onChange={(v) => setTxDateFrom(v)}
            placeholder="Start date"
            className="h-8 w-40 text-xs"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground shrink-0">To</span>
          <DatePicker
            value={txDateTo}
            onChange={(v) => setTxDateTo(v)}
            placeholder="End date"
            className="h-8 w-40 text-xs"
          />
        </div>
        <Select value={txSort} onValueChange={setTxSort}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Sort by..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date:desc">Newest first</SelectItem>
            <SelectItem value="date:asc">Oldest first</SelectItem>
            <SelectItem value="amount:desc">Highest amount</SelectItem>
            <SelectItem value="amount:asc">Lowest amount</SelectItem>
          </SelectContent>
        </Select>
        {(txDateFrom || txDateTo || txSearch) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={() => { setTxDateFrom(""); setTxDateTo(""); setTxSearch(""); }}
          >
            <X className="mr-1 size-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Results summary */}
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{filteredTx.length}</span> transactions
        {statusFilter !== "all" && (
          <>
            <span className="text-border">·</span>
            <span>
              {statusFilter === "unreconciled" ? "To do" : statusFilter === "reconciled" ? "Done" : "Ignored"}
            </span>
          </>
        )}
      </div>

      {txSearchPending ? (
        <BrandLoader className="h-auto py-16" />
      ) : filteredTx.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <Clock3 className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "all" && !txSearch ? "No transactions yet." : "No transactions match your filters."}
          </p>
        </div>
      ) : (
        <motion.div
          key={`${statusFilter}-${debouncedTxSearch}-${txDateFrom}-${txDateTo}-${txSort}`}
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-lg border"
        >
          {filteredTx.map((tx, i) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              cur={cur}
              isLast={i === filteredTx.length - 1}
              onReconcile={handleReconcile}
              onExclude={handleExclude}
              onMatchBill={handleOpenMatch}
              onCreateExpense={handleOpenExpense}
              onCategorize={handleOpenCategorize}
              onMatchInvoice={handleOpenMatchInvoice}
              onMatch={handleOpenMatchUnified}
              onTransfer={handleOpenTransfer}
              onSplit={handleOpenSplit}
            />
          ))}
        </motion.div>
      )}
      </div>
      )}
    </div>
  );
}
