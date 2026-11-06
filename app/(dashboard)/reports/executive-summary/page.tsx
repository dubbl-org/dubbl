"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { BackToReports, ReportHelp, BasisToggle } from "../_components";
import { useApi } from "@/lib/query/use-api";
import { DownloadLink } from "@/components/dashboard/download-link";

interface Kpi {
  key: string;
  label: string;
  current: number;
  prior: number;
  delta: number;
  deltaPercent: number | null;
}

/** Plain-language relabelling of the API's accounting terms. */
const FRIENDLY_LABELS: Record<string, string> = {
  revenue: "Money in (sales)",
  grossProfit: "Profit after direct costs",
  expenses: "Running costs",
  netIncome: "Profit after everything",
  cash: "Cash in the bank",
  accountsReceivable: "Owed to you by customers",
  accountsPayable: "You owe to suppliers",
};

export default function ExecutiveSummaryPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const { data, loading } = useApi<{ kpis?: Kpi[]; priorPeriod?: { startDate: string; endDate: string } | null }>(
    `/api/v1/reports/executive-summary?${new URLSearchParams({ startDate, endDate, basis })}`,
    { keepPrevious: true }
  );
  const kpis = data?.kpis || [];
  const priorPeriod = data?.priorPeriod || null;

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Quick health check"
        description="The key numbers this period, next to last period."
      >
        <DownloadLink
          href={`/api/v1/reports/executive-summary?${new URLSearchParams({ startDate, endDate, basis, format: "pdf" })}`}
          filename="executive-summary.pdf"
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Download PDF
        </DownloadLink>
      </PageHeader>

      <ReportHelp>
        A one-page snapshot of how the business is doing. Each number is shown
        next to the same number from the period right before, so you can quickly
        see what went up or down.
      </ReportHelp>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <BasisToggle basis={basis} onChange={setBasis} />
      </div>

      <ContentReveal>
        {priorPeriod && (
          <p className="mb-3 text-[13px] text-muted-foreground">
            Comparing against the period right before: {priorPeriod.startDate} to {priorPeriod.endDate}.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => {
            const up = k.delta > 0;
            const down = k.delta < 0;
            const Icon = up ? TrendingUp : down ? TrendingDown : Minus;
            return (
              <div key={k.key} className="rounded-xl border bg-card/80 p-4 sm:p-5">
                <p className="text-xs font-medium text-muted-foreground">
                  {FRIENDLY_LABELS[k.key] || k.label}
                </p>
                <p className="mt-1.5 text-xl sm:text-2xl font-bold font-mono tabular-nums">
                  {formatMoney(k.current)}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs">
                  <Icon className={cn("size-3.5", up && "text-brand-600", down && "text-red-600", !up && !down && "text-muted-foreground")} />
                  <span className={cn("font-medium", up && "text-brand-600", down && "text-red-600", !up && !down && "text-muted-foreground")}>
                    {k.delta >= 0 ? "+" : "-"}{formatMoney(Math.abs(k.delta))}
                    {k.deltaPercent !== null && ` (${k.deltaPercent >= 0 ? "+" : ""}${k.deltaPercent}%)`}
                  </span>
                  <span className="text-muted-foreground">vs last period</span>
                </div>
              </div>
            );
          })}
        </div>
      </ContentReveal>
    </ContentReveal>
  );
}
