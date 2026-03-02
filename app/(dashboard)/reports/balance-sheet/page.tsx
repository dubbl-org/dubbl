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

interface Section {
  type: string;
  accounts: { code: string; name: string; balance: string }[];
  total: string;
}

export default function BalanceSheetPage() {
  const [data, setData] = useState<{ assets: Section; liabilities: Section; equity: Section } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/reports/balance-sheet", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.assets) setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Balance Sheet" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const sections = data
    ? [
        { label: "Assets", data: data.assets },
        { label: "Liabilities", data: data.liabilities },
        { label: "Equity", data: data.equity },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Balance Sheet"
        description="Assets = Liabilities + Equity"
      />
      {sections.map((section) => (
        <div key={section.label} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {section.label}
          </h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-32 text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.data.accounts.map((a) => (
                  <TableRow key={a.code}>
                    <TableCell className="font-mono text-sm">{a.code}</TableCell>
                    <TableCell>{a.name}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {parseFloat(a.balance).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={2}>Total {section.label}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {parseFloat(section.data.total).toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
