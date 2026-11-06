"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Ban, TrendingUp, Check, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi, useApiCache } from "@/lib/query/use-api";
import Link from "next/link";

interface RevenueEntry {
  id: string;
  periodDate: string;
  amount: number;
  recognized: boolean;
  journalEntryId: string | null;
}

interface RevenueScheduleDetail {
  id: string;
  totalAmount: number;
  recognizedAmount: number;
  startDate: string;
  endDate: string;
  method: string;
  status: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  contactName: string | null;
  currencyCode: string | null;
  entries: RevenueEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "in progress",
  completed: "finished",
  cancelled: "cancelled",
};

// Plain-language method labels (end users aren't accountants).
const methodLabels: Record<string, string> = {
  straight_line: "evenly over time",
  milestone: "by milestone",
  on_completion: "when finished",
};

export default function RevenueScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const url = `/api/v1/revenue-schedules/${id}`;
  const { data, loading } = useApi<{ schedule?: RevenueScheduleDetail }>(url);
  const cache = useApiCache();
  const rs = data?.schedule ?? null;
  const [recognizing, setRecognizing] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Sales · Revenue Schedule");

  async function handleRecognize() {
    if (!orgId) return;
    setRecognizing(true);
    try {
      const res = await fetch(`/api/v1/revenue-schedules/${id}/recognize`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        cache.invalidate(url);
        toast.success("Counted the next period as income");
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't count the next period");
      }
    } finally {
      setRecognizing(false);
    }
  }

  async function handleCancel() {
    if (!orgId) return;
    await confirm({
      title: "Cancel this schedule?",
      description: "This stops the schedule. Income not counted yet goes back into your income today, and periods already counted stay as they are. You can't undo this.",
      confirmLabel: "Cancel schedule",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/revenue-schedules/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          cache.invalidate(url);
          toast.success("Schedule cancelled");
        } else {
          const data = await res.json();
          toast.error(typeof data.error === "string" ? data.error : "Couldn't cancel this schedule");
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!rs) return <div className="space-y-6"><PageHeader title="Revenue schedule not found" /></div>;

  const sortedEntries = [...rs.entries].sort((a, b) => a.periodDate.localeCompare(b.periodDate));
  const nextEntry = sortedEntries.find((e) => !e.recognized);
  const remaining = rs.totalAmount - rs.recognizedAmount;
  const money = (cents: number) => formatMoney(cents, rs.currencyCode ?? undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title={rs.invoiceNumber ? `Revenue schedule · ${rs.invoiceNumber}` : "Revenue schedule"}
        description={`${rs.contactName ? `${rs.contactName} · ` : ""}${rs.startDate} – ${rs.endDate} · ${methodLabels[rs.method] || rs.method}`}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/revenue-schedules"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {rs.invoiceId && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sales/${rs.invoiceId}`}><FileText className="mr-2 size-4" />View invoice</Link>
          </Button>
        )}
        {rs.status === "active" && nextEntry && (
          <Button
            size="sm"
            onClick={handleRecognize}
            loading={recognizing}
            className="bg-brand-600 hover:bg-brand-700"
            title="Count the next period's amount as income now"
          >
            <TrendingUp className="mr-2 size-4" />{rs.method === "milestone" ? "Count next milestone" : "Count next period"}
          </Button>
        )}
        {rs.status === "active" && (
          <Button variant="outline" size="sm" onClick={handleCancel} className="text-red-600" title="Stop counting any further income on this schedule">
            <Ban className="mr-2 size-4" />Cancel schedule
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[rs.status] || ""}>
          {statusLabels[rs.status] || rs.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Spread {methodLabels[rs.method] || rs.method}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{money(rs.totalAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Counted so far</p>
          <p className="text-xl font-bold font-mono text-brand-600">{money(rs.recognizedAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Left to count</p>
          <p className="text-xl font-bold font-mono text-amber-600">{money(rs.status === "cancelled" ? 0 : remaining)}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[400px] grid-cols-[1fr_140px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Period</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Counted</span>
        </div>
        {sortedEntries.map((entry) => (
          <div key={entry.id} className="grid min-w-[400px] grid-cols-[1fr_140px_120px] gap-2 border-b px-4 py-2 last:border-b-0 items-center">
            <span className="text-sm">{entry.periodDate}</span>
            <span className="text-right text-sm font-mono font-medium">{money(entry.amount)}</span>
            <span className="text-right text-sm">
              {entry.recognized ? (
                <Badge variant="outline" className="border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
                  <Check className="mr-1 size-3" />counted
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">not yet</span>
              )}
            </span>
          </div>
        ))}
        {sortedEntries.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No periods on this schedule.
          </div>
        )}
      </div>

      {confirmDialog}
    </div>
  );
}
