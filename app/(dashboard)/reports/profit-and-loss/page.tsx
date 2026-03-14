"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { ExportButton } from "@/components/dashboard/export-button";

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
    const params = new URLSearchParams({ startDate, endDate });
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
  }, [startDate, endDate]);

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Profit & Loss"
        description="Revenue minus expenses for the selected period."
      >
        <ExportButton
          data={[...revenue.map((r) => ({ ...r, section: "Revenue" })), ...expenses.map((e) => ({ ...e, section: "Expense" }))]}
          columns={["section", "accountCode", "accountName", "balance"]}
          filename="profit-and-loss"
        />
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard title="Revenue" value={formatMoney(totalRevenue)} icon={TrendingUp} changeType="positive" />
              <StatCard title="Expenses" value={formatMoney(totalExpenses)} icon={TrendingDown} changeType="negative" />
              <StatCard
                title="Net Income"
                value={formatMoney(netIncome)}
                icon={DollarSign}
                changeType={netIncome >= 0 ? "positive" : "negative"}
              />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Revenue</h2>
              <DataTable columns={columns} data={revenue} loading={false} emptyMessage="No revenue entries." />
              <div className="flex justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                <span>Total Revenue</span>
                <span className="font-mono tabular-nums">{formatMoney(totalRevenue)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Expenses</h2>
              <DataTable columns={columns} data={expenses} loading={false} emptyMessage="No expense entries." />
              <div className="flex justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                <span>Total Expenses</span>
                <span className="font-mono tabular-nums">{formatMoney(totalExpenses)}</span>
              </div>
            </div>

            <div className="flex justify-between px-3 py-2 sm:px-4 sm:py-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg font-semibold text-sm sm:text-base">
              <span>Net Income</span>
              <span className="font-mono tabular-nums">{formatMoney(netIncome)}</span>
            </div>
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
