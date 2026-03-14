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
import { ExportButton } from "@/components/dashboard/export-button";

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  debitBalance: string;
  creditBalance: string;
}

export default function TrialBalancePage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    fetch("/api/v1/reports/trial-balance", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.accounts) setAccounts(data.accounts);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const totalDebit = accounts.reduce((s, a) => s + parseFloat(a.debitBalance || "0"), 0);
  const totalCredit = accounts.reduce((s, a) => s + parseFloat(a.creditBalance || "0"), 0);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Trial Balance"
        description="Summary of all account balances."
      >
        <ExportButton
          data={accounts}
          columns={["code", "name", "type", "debitBalance", "creditBalance"]}
          filename="trial-balance"
        />
      </PageHeader>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <div>
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
        </div>
      )}
    </ContentReveal>
  );
}
