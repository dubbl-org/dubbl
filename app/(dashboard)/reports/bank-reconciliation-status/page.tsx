"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
import { formatMoney } from "@/lib/money";
import { BackToReports, ReportHelp } from "../_components";

interface AgingBucket {
  count: number;
  total: number;
}

interface AccountStatus {
  id: string;
  accountName: string;
  balance: number;
  balanceDiscrepancy: number;
  unreconciled: {
    total: number;
    count: number;
    aging: {
      week: AgingBucket;
      month: AgingBucket;
      twoMonths: AgingBucket;
      older: AgingBucket;
    };
  };
  lastImport: { date: string; fileName: string } | null;
  lastReconciliation: { endDate: string; status: string } | null;
  gaps: {
    hasGap: boolean;
    gapStart: string | null;
    gapEnd: string | null;
    gapDays: number | null;
  };
}

interface StatusData {
  accounts: AccountStatus[];
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().slice(0, 10);
}

export default function BankReconciliationStatusPage() {
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StatusData | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    fetch(`/api/v1/reports/bank-reconciliation-status`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.accounts) setData(d);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (initialLoad) return <BrandLoader />;

  const accounts = data?.accounts ?? [];

  const totals = accounts.reduce(
    (acc, a) => {
      acc.unreconciledCount += a.unreconciled.count;
      acc.unreconciledTotal += a.unreconciled.total;
      return acc;
    },
    { unreconciledCount: 0, unreconciledTotal: 0 }
  );

  const exportRows = accounts.map((a) => ({
    accountName: a.accountName,
    balance: (a.balance / 100).toFixed(2),
    toReviewCount: a.unreconciled.count,
    toReviewTotal: (a.unreconciled.total / 100).toFixed(2),
    olderThan60Days: a.unreconciled.aging.older.count,
    lastReviewed: fmtDate(a.lastReconciliation?.endDate),
    lastImport: fmtDate(a.lastImport?.date),
  }));

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Bank tidy-up status"
        description="Which accounts are fully checked off, and what's still waiting to be reviewed."
      >
        <ExportButton
          data={exportRows}
          columns={[
            "accountName",
            "balance",
            "toReviewCount",
            "toReviewTotal",
            "olderThan60Days",
            "lastReviewed",
            "lastImport",
          ]}
          filename="bank-tidy-up-status"
        />
      </PageHeader>

      <ReportHelp>
        For each bank account, this shows how many transactions you&apos;ve already
        confirmed and how many are still waiting for you to review. Anything still
        waiting — especially older items — is worth checking so your books match
        your real bank balance. Accountants call this bank reconciliation.
      </ReportHelp>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : accounts.length === 0 ? (
        <ContentReveal>
          <div className="rounded-lg border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            No bank accounts yet. Add a bank account to start tracking what&apos;s
            been reviewed.
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal className="space-y-4">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Bank balance</TableHead>
                  <TableHead className="text-right">Still to review</TableHead>
                  <TableHead className="text-right">Value waiting</TableHead>
                  <TableHead className="text-right">Older than 60 days</TableHead>
                  <TableHead>Last reviewed</TableHead>
                  <TableHead>Last import</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => {
                  const isClear = a.unreconciled.count === 0;
                  const olderCount = a.unreconciled.aging.older.count;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/accounting/banking/${a.id}`}
                          className="hover:text-emerald-600 hover:underline"
                        >
                          {a.accountName}
                        </Link>
                        {a.gaps.hasGap && (
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="size-3" />
                            Possible missing statement ({a.gaps.gapDays} day gap)
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(a.balance)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {a.unreconciled.count}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {a.unreconciled.total > 0
                          ? formatMoney(a.unreconciled.total)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {olderCount > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {olderCount}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(a.lastReconciliation?.endDate)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmtDate(a.lastImport?.date)}
                      </TableCell>
                      <TableCell>
                        {isClear ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="size-3" /> All caught up
                          </span>
                        ) : (
                          <Link
                            href={`/accounting/banking/${a.id}/reconcile`}
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            {a.unreconciled.count} to review
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono tabular-nums">
                    {totals.unreconciledCount}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {totals.unreconciledTotal > 0
                      ? formatMoney(totals.unreconciledTotal)
                      : "—"}
                  </TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            &quot;Still to review&quot; is the number of bank lines you haven&apos;t
            confirmed yet. Items older than 60 days are worth a closer look — they
            may be duplicates or things that never got matched.
          </p>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
