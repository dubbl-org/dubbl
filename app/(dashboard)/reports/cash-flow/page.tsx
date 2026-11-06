"use client";

import { useState } from "react";
import { ArrowDownUp, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { BackToReports, ReportHelp } from "../_components";
import { useApi } from "@/lib/query/use-api";

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
  const { data, loading } = useApi<{ operating?: CashFlowRow[]; investing?: CashFlowRow[]; financing?: CashFlowRow[]; totalOperating?: number; totalInvesting?: number; totalFinancing?: number; netCashFlow?: number }>(
    `/api/v1/reports/cash-flow?${new URLSearchParams({ startDate, endDate })}`,
    { keepPrevious: true }
  );
  const operating = data?.operating || [];
  const investing = data?.investing || [];
  const financing = data?.financing || [];
  const totalOperating = data?.totalOperating || 0;
  const totalInvesting = data?.totalInvesting || 0;
  const totalFinancing = data?.totalFinancing || 0;
  const netCashFlow = data?.netCashFlow || 0;

  const sections = [
    {
      title: "From day-to-day trading",
      help: "Cash from running the business — sales you collected, minus costs you paid.",
      data: operating,
      total: totalOperating,
      icon: ArrowDownUp,
    },
    {
      title: "From buying & selling things",
      help: "Cash spent on or received from equipment, property, and other longer-term items.",
      data: investing,
      total: totalInvesting,
      icon: TrendingDown,
    },
    {
      title: "From funding",
      help: "Cash from loans and owners putting money in, minus repayments and money taken out.",
      data: financing,
      total: totalFinancing,
      icon: TrendingUp,
    },
  ];

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Where your cash went"
        description="How actual cash moved in and out over the period."
      />

      <ReportHelp>
        Profit isn&apos;t the same as cash in the bank. This report follows the actual
        money: how much came in and went out, split into day-to-day trading,
        buying or selling things, and funding. The bottom line is how much your
        cash changed over the period.
      </ReportHelp>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      <ContentReveal>
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {sections.map((s) => (
              <StatCard
                key={s.title}
                title={s.title}
                value={formatMoney(s.total)}
                icon={s.icon}
                changeType={s.total >= 0 ? "positive" : "negative"}
              />
            ))}
            <StatCard
              title="Change in cash"
              value={formatMoney(netCashFlow)}
              icon={DollarSign}
              changeType={netCashFlow >= 0 ? "positive" : "negative"}
            />
          </div>

          {sections.map((s) => (
            <div key={s.title} className="space-y-2">
              <div>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="text-[13px] text-muted-foreground">{s.help}</p>
              </div>
              <DataTable columns={columns} data={s.data} loading={false} emptyMessage={`No cash movement ${s.title.toLowerCase()}.`} />
              <div className="flex justify-between px-3 py-2 sm:px-4 bg-muted/50 rounded-lg text-sm font-semibold">
                <span>Total {s.title.toLowerCase()}</span>
                <span className="font-mono tabular-nums">{formatMoney(s.total)}</span>
              </div>
            </div>
          ))}

          <div className="flex justify-between px-3 py-2 sm:px-4 sm:py-3 bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-lg font-semibold text-sm sm:text-base">
            <span>Total change in cash this period</span>
            <span className="font-mono tabular-nums">{formatMoney(netCashFlow)}</span>
          </div>
        </div>
      </ContentReveal>
    </ContentReveal>
  );
}
