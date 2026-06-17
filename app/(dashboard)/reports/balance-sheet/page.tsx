"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BackToReports, ReportHelp } from "../_components";

interface SectionAccount {
  accountId: string;
  code: string;
  name: string;
  balance: string;
  balances?: string[];
}

interface SectionData {
  type: string;
  accounts: SectionAccount[];
  total: string;
  totals?: string[];
}

interface BalanceSheetData {
  asAt: string;
  dates?: string[];
  compareDates?: string[];
  assets: SectionData;
  liabilities: SectionData;
  equity: SectionData;
}

const SECTION_LABELS: Record<string, string> = {
  Assets: "What you own",
  Liabilities: "What you owe",
  Equity: "What's left over (yours)",
};

export default function BalanceSheetPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [asAt, setAsAt] = useState(today);
  const [compareDate, setCompareDate] = useState<string>("");
  const [showCompare, setShowCompare] = useState(false);
  const [data, setData] = useState<BalanceSheetData | null>(null);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const params = new URLSearchParams({ asAt });
    if (showCompare && compareDate) params.set("compareDate", compareDate);

    fetch(`/api/v1/reports/balance-sheet?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.assets) setData(d);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoad(false);
        }
      });
    return () => { cancelled = true; };
  }, [asAt, showCompare, compareDate]);

  if (initialLoad) return <BrandLoader />;

  const dates = data?.dates ?? (data ? [data.asAt] : []);
  const sections: { label: string; data: SectionData }[] = data
    ? [
        { label: "Assets", data: data.assets },
        { label: "Liabilities", data: data.liabilities },
        { label: "Equity", data: data.equity },
      ]
    : [];

  function balancesFor(a: SectionAccount): string[] {
    return a.balances ?? [a.balance];
  }
  function totalsFor(s: SectionData): string[] {
    return s.totals ?? [s.total];
  }

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="What you own and owe"
        description="A snapshot of everything the business owns and owes on a chosen date."
      >
        <a
          href={`/api/v1/reports/balance-sheet?${(() => { const p = new URLSearchParams({ asAt, format: "pdf" }); if (showCompare && compareDate) p.set("compareDate", compareDate); return p; })()}`}
          className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Download PDF
        </a>
      </PageHeader>

      <ReportHelp>
        Like a photo of your finances on one day: what the business owns, what it
        owes, and what would be left for the owners if you settled up. The two
        sides always balance. Also called a balance sheet.
      </ReportHelp>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">As of:</span>
          <DatePicker value={asAt} onChange={setAsAt} className="w-40 h-8 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showCompare ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCompare((v) => !v)}
            className={showCompare ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {showCompare ? "Comparing to an earlier date" : "Compare to an earlier date"}
          </Button>
          {showCompare && (
            <DatePicker
              value={compareDate}
              onChange={setCompareDate}
              placeholder="Earlier date"
              className="w-40 h-8 text-sm"
            />
          )}
        </div>
      </div>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : (
        <ContentReveal>
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section.label} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTION_LABELS[section.label] || section.label}
                </h3>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Account</TableHead>
                        {dates.map((d) => (
                          <TableHead key={d} className="w-36 text-right">As of {d}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.data.accounts.map((a) => (
                        <TableRow key={a.accountId}>
                          <TableCell className="font-mono text-sm">{a.code}</TableCell>
                          <TableCell>
                            <Link
                              href={`/reports/general-ledger?${new URLSearchParams({ endDate: asAt }).toString()}#${a.accountId}`}
                              className="hover:text-emerald-600 hover:underline"
                            >
                              {a.name}
                            </Link>
                          </TableCell>
                          {balancesFor(a).map((bal, i) => (
                            <TableCell key={i} className="text-right font-mono tabular-nums">
                              {parseFloat(bal).toFixed(2)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-bold">
                        <TableCell colSpan={2}>Total {(SECTION_LABELS[section.label] || section.label).toLowerCase()}</TableCell>
                        {totalsFor(section.data).map((t, i) => (
                          <TableCell key={i} className="text-right font-mono tabular-nums">
                            {parseFloat(t).toFixed(2)}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </ContentReveal>
      )}
    </ContentReveal>
  );
}
