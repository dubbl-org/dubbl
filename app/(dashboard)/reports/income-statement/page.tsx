"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
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

export default function IncomeStatementPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IncomeData | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    fetch("/api/v1/reports/income-statement", {
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
  }, []);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Income Statement"
        description="Revenue - Expenses = Net Income"
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data ? (
        <p className="text-muted-foreground">No data available.</p>
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            {[
              { label: "Revenue", section: data.revenue },
              { label: "Expenses", section: data.expenses },
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
                            {parseFloat(a.balance).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell colSpan={2}>Total {s.label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {parseFloat(s.section.total).toFixed(2)}
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
                  Net Income
                </span>
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {parseFloat(data.netIncome).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
