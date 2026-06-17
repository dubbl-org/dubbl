"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Layers } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { BackToReports, ReportHelp, BasisToggle } from "../_components";

interface ColumnDesc {
  key: string;
  label: string;
  dimensionValue: string | null;
}

interface AccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  amounts: number[];
  total: number;
}

interface SectionData {
  label: string;
  accounts: AccountRow[];
  totals: number[];
  total: number;
}

interface TrackingResponse {
  columns: ColumnDesc[];
  sections: SectionData[];
  netIncome?: { byColumn: number[]; total: number };
}

type Dimension = "costCenterId" | "projectId";

export default function TrackingReportPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [dimension, setDimension] = useState<Dimension>("costCenterId");
  const [data, setData] = useState<TrackingResponse | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate, basis, dimension, mode: "pnl" });
    fetch(`/api/v1/reports/tracking-category?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.columns) setData(d);
        else setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate, basis, dimension]);

  if (initialLoad) return <BrandLoader />;

  const columns = data?.columns ?? [];
  const dimQueryKey = dimension === "projectId" ? "projectId" : "costCenterId";

  /** Drill-down: open the full transaction list for this account + column. */
  function ledgerHref(accountId: string, col: ColumnDesc): string {
    const params = new URLSearchParams({ startDate, endDate });
    params.set(dimQueryKey, col.dimensionValue ?? "none");
    return `/reports/general-ledger?${params.toString()}#${accountId}`;
  }

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Profit by team or project"
        description="Money in vs money out, split into a column for each team or project."
      >
        <a
          href={`/api/v1/reports/tracking-category?${new URLSearchParams({ startDate, endDate, basis, dimension, mode: "pnl", format: "xlsx" })}`}
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Export spreadsheet
        </a>
      </PageHeader>

      <ReportHelp>
        See how each part of the business is doing. Money in and running costs are
        split into a column for every {dimension === "projectId" ? "project" : "department"},
        so you can tell which ones are pulling their weight. Click any amount to see
        the transactions behind it.
      </ReportHelp>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Split by:</span>
          <Button
            variant={dimension === "costCenterId" ? "default" : "outline"}
            size="sm"
            onClick={() => setDimension("costCenterId")}
            className={dimension === "costCenterId" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            Department
          </Button>
          <Button
            variant={dimension === "projectId" ? "default" : "outline"}
            size="sm"
            onClick={() => setDimension("projectId")}
            className={dimension === "projectId" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            Project
          </Button>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
          />
          <BasisToggle basis={basis} onChange={setBasis} />
        </div>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data || columns.length === 0 ? (
        <ContentReveal>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
              <Layers className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Nothing tagged yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              No transactions in this period are tagged to a {dimension === "projectId" ? "project" : "department"}. Tag transactions to see them split out here.
            </p>
          </div>
        </ContentReveal>
      ) : (
        <ContentReveal>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Account</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c.key} className="text-right">{c.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sections.map((section) => (
                  <RenderSection
                    key={section.label}
                    section={section}
                    columns={columns}
                    ledgerHref={ledgerHref}
                  />
                ))}
                {data.netIncome && (
                  <TableRow className="bg-emerald-50 dark:bg-emerald-950/30 font-bold">
                    <TableCell>Profit (money in minus costs)</TableCell>
                    {data.netIncome.byColumn.map((amt, i) => (
                      <TableCell key={i} className="text-right font-mono tabular-nums">
                        {formatMoney(amt)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(data.netIncome.total)}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}

function RenderSection({
  section,
  columns,
  ledgerHref,
}: {
  section: SectionData;
  columns: ColumnDesc[];
  ledgerHref: (accountId: string, col: ColumnDesc) => string;
}) {
  return (
    <>
      <TableRow className="bg-muted/30">
        <TableCell colSpan={columns.length + 2} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {section.label}
        </TableCell>
      </TableRow>
      {section.accounts.map((a) => (
        <TableRow key={a.accountId}>
          <TableCell>
            <span className="font-mono text-xs text-muted-foreground mr-2">{a.accountCode}</span>
            {a.accountName}
          </TableCell>
          {columns.map((c, i) => (
            <TableCell key={c.key} className="text-right font-mono tabular-nums">
              {a.amounts[i] !== 0 ? (
                <Link href={ledgerHref(a.accountId, c)} className="hover:text-emerald-600 hover:underline">
                  {formatMoney(a.amounts[i])}
                </Link>
              ) : (
                <span className="text-muted-foreground/50">{formatMoney(0)}</span>
              )}
            </TableCell>
          ))}
          <TableCell className="text-right font-mono tabular-nums">{formatMoney(a.total)}</TableCell>
        </TableRow>
      ))}
      <TableRow className="font-semibold">
        <TableCell>Total {section.label.toLowerCase()}</TableCell>
        {section.totals.map((t, i) => (
          <TableCell key={i} className="text-right font-mono tabular-nums">{formatMoney(t)}</TableCell>
        ))}
        <TableCell className="text-right font-mono tabular-nums">{formatMoney(section.total)}</TableCell>
      </TableRow>
    </>
  );
}
