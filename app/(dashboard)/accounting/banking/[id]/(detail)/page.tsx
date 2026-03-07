"use client";

import { Clock3, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { useBankAccountContext } from "./layout";
import { TransactionRow, ImportRow } from "../_components";

export default function BankAccountOverviewPage() {
  const {
    account,
    transactions,
    imports,
    summary,
    handleReconcile,
    handleExclude,
    handleOpenMatch,
    handleOpenExpense,
    openImport,
  } = useBankAccountContext();

  const cur = account.currencyCode;

  return (
    <div className="space-y-8">
      {/* Reconciliation breakdown */}
      <div>
        <div className="flex items-center gap-6 text-[13px]">
          {[
            { label: "Unreconciled", count: summary.unreconciled, dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
            { label: "Reconciled", count: summary.reconciled, dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
            { label: "Excluded", count: summary.excluded, dot: "bg-gray-400", text: "text-muted-foreground" },
          ].map(({ label, count, dot, text }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", dot)} />
              <span className="text-muted-foreground">{label}</span>
              <span className={cn("font-mono font-semibold tabular-nums", text)}>{count}</span>
            </div>
          ))}
        </div>
        {summary.total > 0 && (
          <div className="mt-3 h-2.5 w-full rounded-full overflow-hidden flex bg-gray-200 dark:bg-muted">
            {summary.reconciled > 0 && (
              <div className="h-full bg-emerald-500" style={{ width: `${(summary.reconciled / summary.total) * 100}%` }} />
            )}
            {summary.unreconciled > 0 && (
              <div className="h-full bg-amber-500" style={{ width: `${(summary.unreconciled / summary.total) * 100}%` }} />
            )}
            {summary.excluded > 0 && (
              <div className="h-full bg-gray-400" style={{ width: `${(summary.excluded / summary.total) * 100}%` }} />
            )}
          </div>
        )}
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Recent Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-12 text-center">
            <Clock3 className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No transactions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Import a statement to get started.</p>
            </div>
            <Button size="sm" onClick={openImport} className="mt-2 bg-emerald-600 hover:bg-emerald-700">
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
                onMatchBill={handleOpenMatch}
                onCreateExpense={handleOpenExpense}
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
          </div>
          <div className="rounded-lg border">
            {imports.slice(0, 3).map((imp, i) => (
              <ImportRow key={imp.id} imp={imp} isLast={i === Math.min(2, imports.length - 1)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
