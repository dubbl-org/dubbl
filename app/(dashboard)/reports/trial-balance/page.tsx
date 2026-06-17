"use client";

import Link from "next/link";
import { Fragment, useState, useEffect } from "react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportButton } from "@/components/dashboard/export-button";
import { BackToReports, ReportHelp } from "../_components";

interface SplitBalance {
  debitBalance: string;
  creditBalance: string;
  balance: string;
}

interface AccountBalance extends SplitBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  balances?: SplitBalance[];
}

interface TrialBalanceData {
  asAt: string;
  dates?: string[];
  accounts: AccountBalance[];
}

export default function TrialBalancePage() {
  const today = new Date().toISOString().slice(0, 10);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [asAt, setAsAt] = useState(today);
  const [compareDate, setCompareDate] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [data, setData] = useState<TrialBalanceData | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ asAt });
    if (showCompare && compareDate) params.set("compareDate", compareDate);

    fetch(`/api/v1/reports/trial-balance?${params}`, {
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
    return () => { cancelled = true; };
  }, [asAt, showCompare, compareDate]);

  if (initialLoad) return <BrandLoader />;

  const accounts = data?.accounts ?? [];
  const dates = data?.dates ?? (data ? [data.asAt] : []);

  function splitsFor(a: AccountBalance): SplitBalance[] {
    return a.balances ?? [a];
  }

  // Per-date totals of the money-in and money-out columns.
  const totals = dates.map((_, i) => {
    let debit = 0;
    let credit = 0;
    for (const a of accounts) {
      const s = splitsFor(a)[i];
      if (!s) continue;
      debit += parseFloat(s.debitBalance || "0");
      credit += parseFloat(s.creditBalance || "0");
    }
    return { debit, credit };
  });

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Account balances check"
        description="Every account's balance on a chosen date."
      >
        <ExportButton
          data={accounts}
          columns={["code", "name", "type", "debitBalance", "creditBalance"]}
          filename="account-balances"
        />
      </PageHeader>

      <ReportHelp>
        A full list of every account and its balance on a chosen date. The two
        money columns should add up to the same total — that&apos;s the quick check
        that the books are in order. Accountants call this a trial balance.
      </ReportHelp>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">As of:</span>
          <DatePicker value={asAt} onChange={setAsAt} className="w-40 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showCompare ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCompare((v) => !v)}
            className={showCompare ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {showCompare ? "Comparing to an earlier date" : "Compare to an earlier date"}
          </Button>
          {showCompare && (
            <DatePicker
              value={compareDate}
              onChange={setCompareDate}
              placeholder="Earlier date"
              className="w-40 h-8 text-sm"
            />
          )}
        </div>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  {dates.map((d) => (
                    <TableHead key={d} colSpan={2} className="text-center">As of {d}</TableHead>
                  ))}
                </TableRow>
                <TableRow className="bg-muted/30">
                  <TableHead colSpan={3} />
                  {dates.map((d) => (
                    <Fragment key={d}>
                      <TableHead className="w-28 text-right text-xs">Money in side</TableHead>
                      <TableHead className="w-28 text-right text-xs">Money out side</TableHead>
                    </Fragment>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.accountId}>
                    <TableCell className="font-mono text-sm">{a.code}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/reports/general-ledger?${new URLSearchParams({ endDate: asAt }).toString()}#${a.accountId}`}
                        className="hover:text-emerald-600 hover:underline"
                      >
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{a.type}</TableCell>
                    {splitsFor(a).map((s, i) => (
                      <Fragment key={i}>
                        <TableCell className="text-right font-mono tabular-nums">
                          {parseFloat(s.debitBalance) > 0 ? parseFloat(s.debitBalance).toFixed(2) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {parseFloat(s.creditBalance) > 0 ? parseFloat(s.creditBalance).toFixed(2) : ""}
                        </TableCell>
                      </Fragment>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold">
                  <TableCell colSpan={3}>Total</TableCell>
                  {totals.map((t, i) => (
                    <Fragment key={i}>
                      <TableCell className="text-right font-mono tabular-nums">
                        {t.debit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {t.credit.toFixed(2)}
                      </TableCell>
                    </Fragment>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
