"use client";

import { useState, useEffect } from "react";
import { Globe, ArrowUpRight, ArrowDownLeft, Receipt, Printer } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface VatBox {
  box: string;
  label: string;
  amount: number;
}

const CALCULATED_BOXES = ["3", "5"];
const KEY_BOX = "5";

export default function VatReturnPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [boxes, setBoxes] = useState<VatBox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    fetch(`/api/v1/reports/vat-return?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setBoxes(data.boxes || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const outputVat = boxes.find((b) => b.box === "1")?.amount || 0;
  const inputVat = boxes.find((b) => b.box === "4")?.amount || 0;
  const netVat = boxes.find((b) => b.box === "5")?.amount || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT Return"
        description="UK/EU VAT return calculation with HMRC boxes 1-9."
      >
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
          <Printer className="size-3.5" />
          Print
        </Button>
        <ExportButton
          data={boxes.map((b) => ({ box: b.box, description: b.label, amount: b.amount }))}
          columns={["box", "description", "amount"]}
          filename="vat-return"
        />
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" asChild>
          <Link href="/tax/periods">
            <ArrowUpRight className="size-3.5" />
            Tax Periods
          </Link>
        </Button>
      </PageHeader>

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
          </div>
          <div className="rounded-lg border overflow-hidden">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <Skeleton key={i} className="h-14 rounded-none border-b last:border-b-0" />
            ))}
          </div>
        </div>
      ) : boxes.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No VAT data"
          description="No VAT activity found for this period. VAT boxes are calculated from your invoices and bills with VAT-type tax rates applied."
        >
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
              <Link href="/tax">Manage Tax Rates</Link>
            </Button>
            <Button size="sm" className="h-8 text-xs" asChild>
              <Link href="/sales">Go to Sales</Link>
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              title="Output VAT (Sales)"
              value={formatMoney(outputVat)}
              icon={ArrowUpRight}
              changeType="neutral"
            />
            <StatCard
              title="Input VAT (Purchases)"
              value={formatMoney(inputVat)}
              icon={ArrowDownLeft}
              changeType="neutral"
            />
            <StatCard
              title={netVat >= 0 ? "Net VAT Due" : "Net VAT Refund"}
              value={formatMoney(Math.abs(netVat))}
              icon={Receipt}
              changeType={netVat >= 0 ? "negative" : "positive"}
            />
          </div>

          <div className="rounded-lg border overflow-hidden">
            {boxes.map((b, i) => {
              const isKey = b.box === KEY_BOX;
              const isCalc = CALCULATED_BOXES.includes(b.box);
              return (
                <div
                  key={b.box}
                  className={cn(
                    "flex items-center justify-between px-4 py-3.5",
                    i < boxes.length - 1 && "border-b",
                    isKey && "bg-emerald-50/60 dark:bg-emerald-950/20",
                    isCalc && !isKey && "bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex size-8 items-center justify-center rounded-md text-xs font-bold font-mono",
                      isKey
                        ? "bg-emerald-600 text-white dark:bg-emerald-500"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {b.box}
                    </div>
                    <div>
                      <p className={cn("text-sm", isKey && "font-semibold")}>{b.label}</p>
                      {isCalc && (
                        <Badge variant="outline" className="text-[9px] mt-0.5">Calculated</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      "font-mono text-sm tabular-nums",
                      isKey && "text-base font-bold",
                      isKey && netVat >= 0 && "text-red-600 dark:text-red-400",
                      isKey && netVat < 0 && "text-emerald-600 dark:text-emerald-400",
                      !isKey && "font-medium"
                    )}>
                      {formatMoney(Math.abs(b.amount))}
                    </p>
                    {isKey && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {netVat < 0 ? "Refund due to you" : "Amount due to HMRC"}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
