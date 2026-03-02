"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";

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
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [revenue, setRevenue] = useState<AccountRow[]>([]);
  const [expenses, setExpenses] = useState<AccountRow[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netIncome, setNetIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
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
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description="Revenue minus expenses for the selected period."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

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
        <DataTable columns={columns} data={revenue} loading={loading} emptyMessage="No revenue entries." />
        <div className="flex justify-between px-4 py-2 bg-muted/50 rounded-lg text-sm font-semibold">
          <span>Total Revenue</span>
          <span className="font-mono tabular-nums">{formatMoney(totalRevenue)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Expenses</h2>
        <DataTable columns={columns} data={expenses} loading={loading} emptyMessage="No expense entries." />
        <div className="flex justify-between px-4 py-2 bg-muted/50 rounded-lg text-sm font-semibold">
          <span>Total Expenses</span>
          <span className="font-mono tabular-nums">{formatMoney(totalExpenses)}</span>
        </div>
      </div>

      <div className="flex justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg font-semibold">
        <span>Net Income</span>
        <span className="font-mono tabular-nums">{formatMoney(netIncome)}</span>
      </div>
    </div>
  );
}
