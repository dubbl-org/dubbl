"use client";

import { useState, useEffect } from "react";
import { ArrowDownUp, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";

interface CashFlowRow {
  accountName: string;
  accountCode: string;
  amount: number;
}

const columns: Column<CashFlowRow>[] = [
  { key: "code", header: "Code", className: "w-24", render: (r) => <span className="font-mono text-sm">{r.accountCode}</span> },
  { key: "name", header: "Account", render: (r) => <span className="text-sm font-medium">{r.accountName}</span> },
  { key: "amount", header: "Amount", className: "w-32 text-right", render: (r) => <span className="font-mono text-sm tabular-nums">{formatMoney(r.amount)}</span> },
];

export default function CashFlowPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [operating, setOperating] = useState<CashFlowRow[]>([]);
  const [investing, setInvesting] = useState<CashFlowRow[]>([]);
  const [financing, setFinancing] = useState<CashFlowRow[]>([]);
  const [totalOperating, setTotalOperating] = useState(0);
  const [totalInvesting, setTotalInvesting] = useState(0);
  const [totalFinancing, setTotalFinancing] = useState(0);
  const [netCashFlow, setNetCashFlow] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/cash-flow?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setOperating(data.operating || []);
        setInvesting(data.investing || []);
        setFinancing(data.financing || []);
        setTotalOperating(data.totalOperating || 0);
        setTotalInvesting(data.totalInvesting || 0);
        setTotalFinancing(data.totalFinancing || 0);
        setNetCashFlow(data.netCashFlow || 0);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const sections = [
    { title: "Operating Activities", data: operating, total: totalOperating, icon: ArrowDownUp },
    { title: "Investing Activities", data: investing, total: totalInvesting, icon: TrendingDown },
    { title: "Financing Activities", data: financing, total: totalFinancing, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Statement"
        description="Cash inflows and outflows by activity type."
      />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <div className="grid gap-4 sm:grid-cols-4">
        {sections.map((s) => (
          <StatCard
            key={s.title}
            title={s.title.replace(" Activities", "")}
            value={formatMoney(s.total)}
            icon={s.icon}
            changeType={s.total >= 0 ? "positive" : "negative"}
          />
        ))}
        <StatCard
          title="Net Cash Flow"
          value={formatMoney(netCashFlow)}
          icon={DollarSign}
          changeType={netCashFlow >= 0 ? "positive" : "negative"}
        />
      </div>

      {sections.map((s) => (
        <div key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          <DataTable columns={columns} data={s.data} loading={loading} emptyMessage={`No ${s.title.toLowerCase()}.`} />
          <div className="flex justify-between px-4 py-2 bg-muted/50 rounded-lg text-sm font-semibold">
            <span>Total {s.title}</span>
            <span className="font-mono tabular-nums">{formatMoney(s.total)}</span>
          </div>
        </div>
      ))}

      <div className="flex justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg font-semibold">
        <span>Net Cash Flow</span>
        <span className="font-mono tabular-nums">{formatMoney(netCashFlow)}</span>
      </div>
    </div>
  );
}
