"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { useApi } from "@/lib/query/use-api";
import { BackToReports, ReportHelp } from "../_components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AccountLine {
  code: string;
  name: string;
  balance: string;
}

interface IncomeData {
  revenue: { accounts: AccountLine[]; total: string };
  expenses: { accounts: AccountLine[]; total: string };
  netIncome: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [0, 1, 2, 3, 4].map((n) => CURRENT_YEAR - n);

export default function IncomeStatementPage() {
  const [year, setYear] = useState(CURRENT_YEAR);

  // Always request a concrete year range so the figures are "for the year",
  // not a lifetime running total.
  const from = `${year}-01-01`;
  const to =
    year === CURRENT_YEAR
      ? new Date().toISOString().slice(0, 10)
      : `${year}-12-31`;
  const { data: report, loading } = useApi<IncomeData>(`/api/v1/reports/income-statement?from=${from}&to=${to}`, { keepPrevious: true });
  const data = report?.revenue ? report : null;

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Money in vs money out (summary)"
        description="What you earned, minus what you spent, for the year you pick."
      >
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Year"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </PageHeader>

      <ReportHelp>
        A short version of the money-in-vs-money-out report: total earnings, total
        costs, and what&apos;s left as profit. Also called an income statement.
      </ReportHelp>

      {!data ? (
        <p className="text-muted-foreground">No data available.</p>
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            {[
              { label: "Money in", section: data.revenue },
              { label: "Money out", section: data.expenses },
            ].map((s) => (
              <div key={s.label} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </h3>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="w-32 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.section.accounts.map((a) => (
                        <TableRow key={a.code}>
                          <TableCell className="font-mono text-sm">{a.code}</TableCell>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatMoney(parseFloat(a.balance) * 100)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell colSpan={2}>Total {s.label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatMoney(parseFloat(s.section.total) * 100)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}

            <div className="rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/30 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-brand-900 dark:text-brand-300">
                  Profit (money in minus money out)
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-brand-700 dark:text-brand-300">
                  {formatMoney(Math.round(parseFloat(data.netIncome) * 100))}
                </span>
              </div>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
