"use client";

import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/money";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
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
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IncomeData | null>(null);
  const [year, setYear] = useState(CURRENT_YEAR);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    // Always request a concrete year range so the figures are "for the year",
    // not a lifetime running total.
    const from = `${year}-01-01`;
    const to =
      year === CURRENT_YEAR
        ? new Date().toISOString().slice(0, 10)
        : `${year}-12-31`;

    fetch(`/api/v1/reports/income-statement?from=${from}&to=${to}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.revenue) setData(d);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [year]);

  if (initialLoad) return <BrandLoader />;

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

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data ? (
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

            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Profit (money in minus money out)
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
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
