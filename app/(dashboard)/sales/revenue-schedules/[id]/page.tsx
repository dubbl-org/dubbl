"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Ban, TrendingUp, Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
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
  entries: RevenueEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
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
  const [rs, setRs] = useState<RevenueScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [recognizing, setRecognizing] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useDocumentTitle("Sales · Revenue Schedule");

  function refetch() {
    if (!orgId) return;
    fetch(`/api/v1/revenue-schedules/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setRs(data.schedule);
      });
  }

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/revenue-schedules/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setRs(data.schedule);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleRecognize() {
    if (!orgId) return;
    setRecognizing(true);
    try {
      const res = await fetch(`/api/v1/revenue-schedules/${id}/recognize`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        toast.success("Counted the next period as income");
        refetch();
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
      description: "This stops any further income from being counted on this schedule. Periods already counted stay as they are. You can't undo this.",
      confirmLabel: "Cancel schedule",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/revenue-schedules/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Schedule cancelled");
          refetch();
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

  return (
    <div className="space-y-6">
      <PageHeader title="Revenue schedule" description={`${rs.startDate} – ${rs.endDate} · ${methodLabels[rs.method] || rs.method}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sales/revenue-schedules"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {rs.status === "active" && nextEntry && (
          <Button
            size="sm"
            onClick={handleRecognize}
            loading={recognizing}
            className="bg-emerald-600 hover:bg-emerald-700"
            title="Count the next period's amount as income now"
          >
            <TrendingUp className="mr-2 size-4" />Count next period
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
          <p className="text-xl font-bold font-mono">{formatMoney(rs.totalAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Counted so far</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(rs.recognizedAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Left to count</p>
          <p className="text-xl font-bold font-mono text-amber-600">{formatMoney(remaining)}</p>
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
            <span className="text-right text-sm font-mono font-medium">{formatMoney(entry.amount)}</span>
            <span className="text-right text-sm">
              {entry.recognized ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
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
