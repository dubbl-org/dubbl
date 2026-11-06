"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Printer, Info } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";
import { BasisToggle } from "../../reports/_components";

interface ScheduleCLine {
  line: string;
  label: string;
  amount: number;
  /** Accounts mapped to the line (empty for computed lines). */
  accounts?: { code: string; name: string; amount: number }[];
}

const INCOME_LINES = ["1", "2", "3", "4", "5", "6", "7"];
const SUMMARY_LINES = ["28", "29", "30", "31"];

export default function ScheduleCPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-12-31`);
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const { data, loading } = useApi<{ lines?: ScheduleCLine[]; totalIncome?: number; totalExpenses?: number; netProfit?: number; currency?: string }>(
    `/api/v1/reports/schedule-c?${new URLSearchParams({ startDate, endDate, basis })}`,
    { keepPrevious: true }
  );
  const lines = data?.lines || [];
  const totalIncome = data?.totalIncome || 0;
  const totalExpenses = data?.totalExpenses || 0;
  const netProfit = data?.netProfit || 0;
  const currency = data?.currency || "USD";
  const money = (cents: number) => formatMoney(cents, currency);
  useDocumentTitle("Tax · Schedule C");

  const incomeLines = lines.filter((l) => INCOME_LINES.includes(l.line));
  const expenseLines = lines.filter((l) => !INCOME_LINES.includes(l.line) && !SUMMARY_LINES.includes(l.line));
  const summaryLines = lines.filter((l) => SUMMARY_LINES.includes(l.line));

  const maxIncExp = Math.max(totalIncome, totalExpenses, 1);
  const incomePct = (totalIncome / maxIncExp) * 100;
  const expensesPct = (totalExpenses / maxIncExp) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule C Worksheet"
        description="IRS Schedule C (Form 1040) tax preparation worksheet."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={lines.map((l) => ({
            line: l.line,
            description: l.label,
            amount: l.amount,
          }))}
          columns={["line", "description", "amount"]}
          moneyColumns={["amount"]}
          filename={`schedule-c-${startDate.slice(0, 4)}`}
        />
      </PageHeader>

      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
        <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Tax prep worksheet</span> · This report maps your accounting data to IRS Schedule C lines.
          Export and provide to your tax preparer or import into tax preparation software. This is not a filing tool.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <BasisToggle basis={basis} onChange={setBasis} />
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal className="space-y-6">
          {/* Income vs Expenses comparison */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Income vs Expenses
            </h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-3.5 text-brand-500" />
                    <span className="text-muted-foreground">Gross Income</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium text-brand-600 dark:text-brand-400">
                    {money(totalIncome)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${incomePct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="size-3.5 text-red-500" />
                    <span className="text-muted-foreground">Total Expenses</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium text-red-600 dark:text-red-400">
                    {money(totalExpenses)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all"
                    style={{ width: `${expensesPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Net Profit/Loss</span>
                </div>
                <span className={cn(
                  "font-mono text-sm tabular-nums font-semibold",
                  netProfit >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"
                )}>
                  {money(netProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Net result hero */}
          <div className={cn(
            "rounded-xl border-2 p-5",
            netProfit >= 0
              ? "border-brand-200 bg-brand-50/60 dark:border-brand-900 dark:bg-brand-950/20"
              : "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Line 31 · Net {netProfit >= 0 ? "Profit" : "Loss"}
                </p>
                <p className={cn(
                  "mt-1 text-2xl font-bold font-mono tabular-nums",
                  netProfit >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"
                )}>
                  {money(Math.abs(netProfit))}
                </p>
              </div>
              <div className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                netProfit >= 0
                  ? "bg-brand-100 dark:bg-brand-900/40"
                  : "bg-red-100 dark:bg-red-900/40"
              )}>
                <DollarSign className={cn(
                  "size-5",
                  netProfit >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400"
                )} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Income section */}
            {incomeLines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Part I · Income</h3>
                  <Badge variant="outline" className="text-[10px]">Lines 1-7</Badge>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  {incomeLines.map((l, i) => (
                    <div
                      key={l.line}
                      className={cn(
                        "flex items-center justify-between px-4 py-3",
                        i < incomeLines.length - 1 && "border-b"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-[11px] font-mono font-bold text-muted-foreground">{l.line}</span>
                        <span className="text-sm">
                          {l.label}
                          {l.accounts && l.accounts.length > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {l.accounts.map((a) => `${a.code} ${a.name}`).join(", ")}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-mono text-sm tabular-nums font-medium">{money(l.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 mt-2 bg-brand-50 dark:bg-brand-950/30 rounded-lg border border-brand-200 dark:border-brand-900/40 text-sm font-semibold">
                  <span>Gross Income</span>
                  <span className="font-mono tabular-nums text-brand-600 dark:text-brand-400">{money(totalIncome)}</span>
                </div>
              </div>
            )}

            {/* Expenses section */}
            {expenseLines.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Part II · Expenses</h3>
                  <Badge variant="outline" className="text-[10px]">Lines 8-27</Badge>
                </div>
                <div className="rounded-lg border overflow-hidden">
                  {expenseLines.map((l, i) => (
                    <div
                      key={l.line}
                      className={cn(
                        "flex items-center justify-between px-4 py-3",
                        i < expenseLines.length - 1 && "border-b",
                        l.amount === 0 && "opacity-40"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-[11px] font-mono font-bold text-muted-foreground">{l.line}</span>
                        <span className="text-sm">
                          {l.label}
                          {l.accounts && l.accounts.length > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {l.accounts.map((a) => `${a.code} ${a.name}`).join(", ")}
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {l.amount === 0 ? "-" : money(l.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 mt-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/40 text-sm font-semibold">
                  <span>Total Expenses</span>
                  <span className="font-mono tabular-nums text-red-600 dark:text-red-400">{money(totalExpenses)}</span>
                </div>
              </div>
            )}

            {/* Summary section */}
            {summaryLines.length > 0 && (
              <div>
                <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">Summary</h3>
                <div className="rounded-lg border overflow-hidden">
                  {summaryLines.map((l, i) => {
                    const isNet = l.line === "31";
                    return (
                      <div
                        key={l.line}
                        className={cn(
                          "flex items-center justify-between px-4 py-3",
                          i < summaryLines.length - 1 && "border-b",
                          isNet && "bg-muted/40"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "flex size-7 items-center justify-center rounded-md text-[11px] font-mono font-bold",
                            isNet ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                          )}>{l.line}</span>
                          <span className={cn("text-sm", isNet && "font-semibold")}>{l.label}</span>
                        </div>
                        <span className={cn(
                          "font-mono text-sm tabular-nums font-medium",
                          isNet && "text-base font-bold",
                          isNet && (l.amount >= 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400")
                        )}>
                          {money(l.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ContentReveal>
      )}
    </div>
  );
}
