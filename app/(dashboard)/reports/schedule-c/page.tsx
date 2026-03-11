"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface ScheduleCLine {
  line: string;
  label: string;
  amount: number;
}

export default function ScheduleCPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-12-31`);
  const [lines, setLines] = useState<ScheduleCLine[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/v1/reports/schedule-c?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setLines(data.lines || []);
      setTotalIncome(data.totalIncome || 0);
      setTotalExpenses(data.totalExpenses || 0);
      setNetProfit(data.netProfit || 0);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule C"
        description="US Schedule C (Profit or Loss from Business) prep report"
      />

      <div className="flex items-end gap-4">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <Button onClick={generate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
          {loading ? "Generating..." : "Generate"}
        </Button>
      </div>

      {!generated ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">Select a tax year range and click Generate to prepare your Schedule C.</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-16">Line</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.line} className="border-b last:border-b-0">
                    <td className="px-4 py-2.5 font-mono font-medium">{l.line}</td>
                    <td className="px-4 py-2.5">{l.label}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">Total Income</p>
              <p className="text-lg font-semibold font-mono tabular-nums">{formatMoney(totalIncome)}</p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="text-lg font-semibold font-mono tabular-nums">{formatMoney(totalExpenses)}</p>
            </div>
            <div className={cn(
              "rounded-lg border px-4 py-3",
              netProfit >= 0 ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-red-200 bg-red-50/50 dark:bg-red-950/20"
            )}>
              <p className="text-xs text-muted-foreground">Net Profit/Loss</p>
              <p className={cn(
                "text-lg font-semibold font-mono tabular-nums",
                netProfit >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {formatMoney(netProfit)}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
