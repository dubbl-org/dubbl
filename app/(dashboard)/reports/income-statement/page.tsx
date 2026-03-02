"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [data, setData] = useState<IncomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/reports/income-statement", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.revenue) setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Income Statement" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Income Statement" />
        <p className="text-muted-foreground">No data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income Statement"
        description="Revenue - Expenses = Net Income"
      />

      {[
        { label: "Revenue", section: data.revenue },
        { label: "Expenses", section: data.expenses },
      ].map((s) => (
        <div key={s.label} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {s.label}
          </h3>
          <div className="rounded-lg border">
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

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-emerald-900">
            Net Income
          </span>
          <span className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {parseFloat(data.netIncome).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
