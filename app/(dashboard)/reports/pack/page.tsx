"use client";

import { useState } from "react";
import { Package2, FileSpreadsheet, Check } from "lucide-react";
import { ContentReveal } from "@/components/ui/content-reveal";
import { PageHeader } from "@/components/dashboard/page-header";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Button } from "@/components/ui/button";
import { BackToReports, ReportHelp, BasisToggle } from "../_components";

/** What's inside the bundle, described in plain language. */
const INCLUDED = [
  { name: "Money in vs money out", desc: "What you earned minus what you spent." },
  { name: "What you own and owe", desc: "Everything the business owns and owes on the end date." },
  { name: "Account balances check", desc: "Every account's balance, with the two sides that should match." },
  { name: "Where your cash went", desc: "A summary of how your cash changed over the period." },
];

export default function ReportPackPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [basis, setBasis] = useState<"accrual" | "cash">("accrual");

  const downloadUrl = `/api/v1/reports/pack?${new URLSearchParams({
    startDate,
    endDate,
    basis,
    format: "xlsx",
  })}`;

  return (
    <ContentReveal className="space-y-6">
      <BackToReports />

      <PageHeader
        title="Download a report bundle"
        description="The main reports for a period, all in one spreadsheet."
      />

      <ReportHelp>
        Get your most-asked-for reports in a single spreadsheet to hand to your
        accountant, your bank, or to keep for tax time. Pick the dates and how to
        count income and costs, then download.
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
        <div className="rounded-xl border bg-card/80 p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
              <Package2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">What&apos;s in the bundle</h3>
              <p className="text-xs text-muted-foreground">
                {startDate} to {endDate}
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item.name} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <Button asChild className="mt-5 bg-emerald-600 hover:bg-emerald-700">
            <a href={downloadUrl}>
              <FileSpreadsheet className="mr-1.5 size-4" />
              Download the bundle (spreadsheet)
            </a>
          </Button>
        </div>
      </ContentReveal>
    </ContentReveal>
  );
}
