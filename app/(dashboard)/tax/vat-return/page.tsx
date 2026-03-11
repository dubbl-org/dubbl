"use client";

import { useState, useEffect } from "react";
import { ArrowUpRight, ArrowDownLeft, Printer } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { ExportButton } from "@/components/dashboard/export-button";
import { PageHeader } from "@/components/dashboard/page-header";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const outputVat = boxes.find((b) => b.box === "1")?.amount || 0;
  const inputVat = boxes.find((b) => b.box === "4")?.amount || 0;
  const netVat = boxes.find((b) => b.box === "5")?.amount || 0;
  const maxVat = Math.max(Math.abs(outputVat), Math.abs(inputVat), 1);
  const outputPct = (Math.abs(outputVat) / maxVat) * 100;
  const inputPct = (Math.abs(inputVat) / maxVat) * 100;

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
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal className="space-y-6">
          {/* Output vs Input comparison */}
          <div className="rounded-lg border bg-card p-5">
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              Output vs Input VAT
            </h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="size-3.5 text-blue-500" />
                    <span className="text-muted-foreground">Output VAT (Sales)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">
                    {formatMoney(outputVat)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${outputPct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="size-3.5 text-orange-500" />
                    <span className="text-muted-foreground">Input VAT (Purchases)</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums font-medium">
                    {formatMoney(inputVat)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${inputPct}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-medium">
                  {netVat >= 0 ? "Net VAT Due" : "Net VAT Refund"}
                </span>
                <span className={cn(
                  "font-mono text-sm tabular-nums font-semibold",
                  netVat >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                )}>
                  {formatMoney(Math.abs(netVat))}
                </span>
              </div>
            </div>
          </div>

          {/* Net result hero */}
          <div className={cn(
            "rounded-xl border-2 p-5",
            netVat >= 0
              ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
              : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  Box 5 · {netVat >= 0 ? "Amount Due to HMRC" : "Refund Due to You"}
                </p>
                <p className={cn(
                  "mt-1 text-2xl font-bold font-mono tabular-nums",
                  netVat >= 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                )}>
                  {formatMoney(Math.abs(netVat))}
                </p>
              </div>
              <div className={cn(
                "flex size-12 items-center justify-center rounded-xl",
                netVat >= 0
                  ? "bg-red-100 dark:bg-red-900/40"
                  : "bg-emerald-100 dark:bg-emerald-900/40"
              )}>
                {netVat >= 0 ? (
                  <ArrowUpRight className="size-5 text-red-600 dark:text-red-400" />
                ) : (
                  <ArrowDownLeft className="size-5 text-emerald-600 dark:text-emerald-400" />
                )}
              </div>
            </div>
          </div>

          {/* Box breakdown */}
          <div>
            <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
              All Boxes
            </h3>
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ContentReveal>
      )}
    </div>
  );
}
