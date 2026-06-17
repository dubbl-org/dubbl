"use client";

import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Back-to-reports link, shared by every report page. */
export function BackToReports() {
  return (
    <Link
      href="/reports"
      className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-3.5" /> Back to reports
    </Link>
  );
}

/**
 * A one-sentence, plain-language explanation of what a report shows. Sits just
 * under the page header so a non-accountant knows what they're looking at.
 */
export function ReportHelp({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-[13px] text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/70" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * Cash-vs-accrual basis toggle, relabelled in plain language. "Accrual" means
 * count income/costs when invoiced/billed; "cash" means count them only when
 * money actually moves. Helper tooltips spell that out for non-accountants.
 */
export function BasisToggle({
  basis,
  onChange,
}: {
  basis: "accrual" | "cash";
  onChange: (b: "accrual" | "cash") => void;
}) {
  const options: {
    value: "accrual" | "cash";
    label: string;
    help: string;
  }[] = [
    {
      value: "accrual",
      label: "When invoiced or billed",
      help: "Counts a sale or cost on the date you raised the invoice or got the bill — even if it hasn't been paid yet. (Accrual basis.)",
    },
    {
      value: "cash",
      label: "When money moves",
      help: "Counts a sale or cost only when the money is actually paid in or out. (Cash basis.)",
    },
  ];
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted-foreground">Count income and costs:</span>
        <div className="flex items-center gap-1.5">
          {options.map((o) => (
            <Tooltip key={o.value}>
              <TooltipTrigger asChild>
                <Button
                  variant={basis === o.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => onChange(o.value)}
                  className={basis === o.value ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  {o.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{o.help}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
