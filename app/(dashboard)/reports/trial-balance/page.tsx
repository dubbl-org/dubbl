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

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debitBalance: string;
  creditBalance: string;
}

export default function TrialBalancePage() {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/reports/trial-balance", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) setAccounts(data.accounts);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalDebit = accounts.reduce((s, a) => s + parseFloat(a.debitBalance || "0"), 0);
  const totalCredit = accounts.reduce((s, a) => s + parseFloat(a.creditBalance || "0"), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trial Balance"
        description="Summary of all account balances."
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-24">Type</TableHead>
                <TableHead className="w-32 text-right">Debit</TableHead>
                <TableHead className="w-32 text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.accountId}>
                  <TableCell className="font-mono text-sm">{a.code}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground capitalize">{a.type}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {parseFloat(a.debitBalance) > 0 ? parseFloat(a.debitBalance).toFixed(2) : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {parseFloat(a.creditBalance) > 0 ? parseFloat(a.creditBalance).toFixed(2) : ""}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-bold">
                <TableCell colSpan={3}>Total</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {totalDebit.toFixed(2)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {totalCredit.toFixed(2)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
