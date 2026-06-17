"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { ExportButton } from "@/components/dashboard/export-button";
import { BackToReports, ReportHelp, BasisToggle } from "../_components";

interface AccountRow {
  accountId: string;
  accountName: string;
  accountCode: string;
  balance: number;
}

const columns: Column<AccountRow>[] = [
  { key: "code", header: "Code", className: "w-24", render: (r) => <span className="font-mono text-sm">{r.accountCode}</span> },
  { key: "name", header: "Account", render: (r) => <span className="text-sm font-medium">{r.accountName}</span> },
  { key: "balance", header: "Amount", className: "w-32 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.balance)}</span> },
];

export default function ProfitAndLossPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [revenue, setRevenue] = useState<AccountRow[]>([]);
  const [expenses, setExpenses] = useState<AccountRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netIncome, setNetIncome] = useState(0);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate, basis });
    fetch(`/api/v1/reports/profit-and-loss?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setRevenue(data.revenue || []);
        setExpenses(data.expenses || []);
        setTotalRevenue(data.totalRevenue || 0);
        setTotalExpenses(data.totalExpenses || 0);
        setNetIncome(data.netIncome || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate, basis]);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Money in vs money out"
        description="What you earned minus what you spent over the period."
      >
        <a
          href={`/api/v1/reports/profit-and-loss?${new URLSearchParams({ startDate, endDate, basis, format: "pdf" })}`}
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Download PDF
        </a>
        <ExportButton
          data={[...revenue.map((r) => ({ ...r, section: "Money in" })), ...expenses.map((e) => ({ ...e, section: "Money out" }))]}
          columns={["section", "accountCode", "accountName", "balance"]}
          filename="profit-and-loss"
        />
      </PageHeader>

      <ReportHelp>
        This shows whether you made or lost money over a stretch of time:
        everything that came in, minus everything that went out. Also called a
        profit &amp; loss statement.
      </ReportHelp>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <BasisToggle basis={basis} onChange={setBasis} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/reports/pnl-comparison">Compare two periods side by side</a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/reports/tracking">Split by team or project</a>
        </Button>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard title="Money in" value={formatMoney(totalRevenue)} icon={TrendingUp} changeType="positive" />
              <StatCard title="Money out" value={formatMoney(totalExpenses)} icon={TrendingDown} changeType="negative" />
              <StatCard
                title="Profit (in minus out)"
                value={formatMoney(netIncome)}
                icon={DollarSign}
                changeType={netIncome >= 0 ? "positive" : "negative"}
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Money in</h2>
              <DataTable columns={columns} data={revenue} loading={false} emptyMessage="No income in this period." />
              <div className="flex justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                <span>Total money in</span>
                <span className="font-mono tabular-nums">{formatMoney(totalRevenue)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Money out</h2>
              <DataTable columns={columns} data={expenses} loading={false} emptyMessage="No costs in this period." />
              <div className="flex justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                <span>Total money out</span>
                <span className="font-mono tabular-nums">{formatMoney(totalExpenses)}</span>
              </div>
            </div>

            <div className="flex justify-between px-3 py-2 sm:px-4 sm:py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg font-semibold text-sm sm:text-base">
              <span>Profit (money in minus money out)</span>
              <span className="font-mono tabular-nums">{formatMoney(netIncome)}</span>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
