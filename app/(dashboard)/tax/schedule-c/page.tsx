"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, DollarSign, Printer, Info } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ScheduleCLine {
  line: string;
  label: string;
  amount: number;
}

const INCOME_LINES = ["1", "2", "3", "4", "5", "6", "7"];
const SUMMARY_LINES = ["28", "29", "30", "31"];

export default function ScheduleCPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-12-31`);
  const [lines, setLines] = useState<ScheduleCLine[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const initialLoad = useRef(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    if (initialLoad.current) {
      setLoading(true);
    } else {
      setRefetching(true);
    }
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/schedule-c?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLines(data.lines || []);
        setTotalIncome(data.totalIncome || 0);
        setTotalExpenses(data.totalExpenses || 0);
        setNetProfit(data.netProfit || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefetching(false);
          initialLoad.current = false;
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const incomeLines = lines.filter((l) => INCOME_LINES.includes(l.line));
  const expenseLines = lines.filter((l) => !INCOME_LINES.includes(l.line) && !SUMMARY_LINES.includes(l.line));
  const summaryLines = lines.filter((l) => SUMMARY_LINES.includes(l.line));

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

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading || refetching ? (
        <BrandLoader className="h-48" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Gross Income"
              value={formatMoney(totalIncome)}
              icon={TrendingUp}
              changeType="positive"
            />
            <StatCard
              title="Total Expenses"
              value={formatMoney(totalExpenses)}
              icon={TrendingDown}
              changeType="negative"
            />
            <StatCard
              title="Net Profit/Loss"
              value={formatMoney(netProfit)}
              icon={DollarSign}
              changeType={netProfit >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="space-y-6">
            {incomeLines.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Part I · Income</h2>
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
                        <span className="text-sm">{l.label}</span>
                      </div>
                      <span className="font-mono text-sm tabular-nums font-medium">{formatMoney(l.amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200/60 dark:border-emerald-900/40 text-sm font-semibold">
                  <span>Gross Income</span>
                  <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(totalIncome)}</span>
                </div>
              </div>
            )}

            {expenseLines.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Part II · Expenses</h2>
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
                        <span className="text-sm">{l.label}</span>
                      </div>
                      <span className="font-mono text-sm tabular-nums font-medium">
                        {l.amount === 0 ? "-" : formatMoney(l.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200/60 dark:border-red-900/40 text-sm font-semibold">
                  <span>Total Expenses</span>
                  <span className="font-mono tabular-nums text-red-600 dark:text-red-400">{formatMoney(totalExpenses)}</span>
                </div>
              </div>
            )}

            {summaryLines.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Summary</h2>
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
                          isNet && (l.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
                        )}>
                          {formatMoney(l.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
