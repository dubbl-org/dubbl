"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { BackToReports, ReportHelp, BasisToggle } from "../_components";

interface Box {
  box: string;
  label: string;
  amount: number;
}

interface VatResponse {
  boxes: Box[];
  period: { startDate: string; endDate: string };
  basis: string;
}

/**
 * Plain-language explanation for each box, plus where to look to see what's
 * behind the number. Drill-down opens the matching detail report filtered to
 * the same dates.
 */
const BOX_PLAIN: Record<string, { title: string; help: string; drill?: "tax-summary" | "ledger" }> = {
  "1": { title: "Tax you charged on sales", help: "Total tax added to the invoices you sent out.", drill: "tax-summary" },
  "2": { title: "Tax on goods bought from the EU", help: "Tax due on goods you brought in from the EU.", drill: "tax-summary" },
  "3": { title: "Total tax you owe", help: "Box 1 plus Box 2 added together." },
  "4": { title: "Tax you can claim back on purchases", help: "Total tax on the bills you paid that you can reclaim.", drill: "tax-summary" },
  "5": { title: "What to pay or get refunded", help: "Box 3 minus Box 4. Positive means you pay; negative means a refund." },
  "6": { title: "Total sales (before tax)", help: "Everything you sold in the period, not counting the tax.", drill: "tax-summary" },
  "7": { title: "Total purchases (before tax)", help: "Everything you bought in the period, not counting the tax.", drill: "tax-summary" },
  "8": { title: "Goods sold to the EU", help: "Sales of goods to EU customers, before tax." },
  "9": { title: "Goods bought from the EU", help: "Purchases of goods from EU suppliers, before tax." },
};

export default function VatReturnPage() {
  const now = new Date();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");
  const [data, setData] = useState<VatResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate, basis });
    fetch(`/api/v1/reports/vat-return?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.boxes) setData(d);
        else setData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [startDate, endDate, basis]);

  function toggle(box: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(box)) next.delete(box);
      else next.add(box);
      return next;
    });
  }

  function drillHref(kind: "tax-summary" | "ledger" | undefined): string | null {
    if (!kind) return null;
    const dr = new URLSearchParams({ startDate, endDate });
    if (kind === "tax-summary") return `/reports/tax-summary?${dr.toString()}`;
    return `/reports/general-ledger?${dr.toString()}`;
  }

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Sales tax / VAT / GST return"
        description="The figures for your tax return, box by box."
      >
        {data && (
          <a
            href={`/api/v1/reports/vat-return?${new URLSearchParams({ startDate, endDate, basis })}`}
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            View raw figures
          </a>
        )}
      </PageHeader>

      <ReportHelp>
        These are the numbers you (or your accountant) copy onto your sales tax
        return. Open any box to read what it means and jump to the transactions
        behind it.
      </ReportHelp>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onDateChange={(s, e) => { setStartDate(s); setEndDate(e); }}
        />
        <BasisToggle basis={basis} onChange={setBasis} />
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : !data ? (
        <p className="text-sm text-muted-foreground">No tax figures for this period.</p>
      ) : (
        <ContentReveal>
          <div className="space-y-2">
            {data.boxes.map((b) => {
              const plain = BOX_PLAIN[b.box];
              const isOpen = expanded.has(b.box);
              const href = drillHref(plain?.drill);
              return (
                <div key={b.box} className="rounded-lg border overflow-hidden">
                  <button
                    onClick={() => toggle(b.box)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-4 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-xs font-mono font-semibold text-muted-foreground">
                        {b.box}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {plain?.title || b.label}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-sm font-semibold shrink-0">
                      {formatMoney(b.amount)}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 px-3 py-3 sm:px-4 text-sm text-muted-foreground space-y-2">
                      <p>{plain?.help || b.label}</p>
                      <p className="text-xs">Official label: {b.label}</p>
                      {href && (
                        <Button asChild variant="outline" size="sm" className="mt-1">
                          <Link href={href}>See what&apos;s behind this number</Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
