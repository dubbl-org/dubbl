"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface VatBox {
  box: string;
  label: string;
  amount: number;
}

export default function VatReturnPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [boxes, setBoxes] = useState<VatBox[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generate = useCallback(async () => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/v1/reports/vat-return?${params}`, {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      setBoxes(data.boxes || []);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT Return"
        description="UK/EU VAT return calculation · Boxes 1-9"
      />

      <div className="flex items-end gap-4">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <Button onClick={generate} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
          {loading ? "Generating..." : "Generate"}
        </Button>
      </div>

      {!generated ? (
        <div className="rounded-xl border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">Select a date range and click Generate to calculate your VAT return.</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground w-16">Box</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr
                  key={b.box}
                  className={cn(
                    "border-b last:border-b-0",
                    b.box === "5" && "bg-emerald-50/50 dark:bg-emerald-950/20"
                  )}
                >
                  <td className="px-4 py-2.5 font-mono font-medium">{b.box}</td>
                  <td className={cn("px-4 py-2.5", b.box === "5" && "font-semibold")}>{b.label}</td>
                  <td className={cn(
                    "px-4 py-2.5 text-right font-mono tabular-nums",
                    b.box === "5" && "font-semibold",
                    b.box === "5" && b.amount >= 0 ? "text-red-600" : "",
                    b.box === "5" && b.amount < 0 ? "text-emerald-600" : ""
                  )}>
                    {formatMoney(Math.abs(b.amount))}
                    {b.box === "5" && (b.amount < 0 ? " refund" : " due")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
