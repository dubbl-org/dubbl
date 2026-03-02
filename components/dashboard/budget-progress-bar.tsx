"use client";

import { cn } from "@/lib/utils";

interface BudgetProgressBarProps {
  budgeted: number;
  actual: number;
  label: string;
}

export function BudgetProgressBar({ budgeted, actual, label }: BudgetProgressBarProps) {
  const pct = budgeted === 0 ? 0 : Math.round((actual / budgeted) * 100);
  const over = actual > budgeted;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className={cn("tabular-nums font-mono text-xs", over ? "text-red-600" : "text-muted-foreground")}>
          {pct}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"
          )}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums font-mono">
        <span>Actual: ${(actual / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        <span>Budget: ${(budgeted / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}
