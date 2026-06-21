"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Ban, CalendarClock, Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import Link from "next/link";

interface AccrualEntry {
  id: string;
  periodDate: string;
  amount: number;
  posted: boolean;
  journalEntryId: string | null;
  sortOrder: number;
}

interface AccrualScheduleDetail {
  id: string;
  description: string;
  totalAmount: number;
  startDate: string;
  endDate: string;
  periods: number;
  status: string;
  entries: AccrualEntry[];
}

const statusColors: Record<string, string> = {
  active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "running",
  completed: "finished",
  cancelled: "cancelled",
};

export default function AccrualDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [acc, setAcc] = useState<AccrualScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(acc?.description);

  const refetch = useCallback(() => {
    if (!orgId) return;
    fetch(`/api/v1/accrual-schedules/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setAcc(data.schedule);
      });
  }, [id, orgId]);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/accrual-schedules/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.schedule) setAcc(data.schedule);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handlePostNext() {
    if (!orgId) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/v1/accrual-schedules/${id}/post`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        toast.success("This month's share has been recorded");
        refetch();
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't record this month");
      }
    } finally {
      setPosting(false);
    }
  }

  async function handleCancel() {
    if (!orgId) return;
    await confirm({
      title: "Cancel this accrual?",
      description: "This stops any remaining months from being recorded. Months already recorded stay as they are. You can't undo this.",
      confirmLabel: "Cancel accrual",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/accrual-schedules/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Accrual cancelled");
          refetch();
        } else {
          const data = await res.json();
          toast.error(typeof data.error === "string" ? data.error : "Couldn't cancel this accrual");
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!acc) return <div className="space-y-6"><PageHeader title="Accrual not found" /></div>;

  const entries = [...acc.entries].sort((a, b) => a.sortOrder - b.sortOrder);
  const postedCount = entries.filter((e) => e.posted).length;
  const hasUnposted = entries.some((e) => !e.posted);

  return (
    <div className="space-y-6">
      <PageHeader title={acc.description} description={`${formatMoney(acc.totalAmount)} over ${acc.periods} month${acc.periods !== 1 ? "s" : ""}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounting/accruals"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {acc.status === "active" && hasUnposted && (
          <Button
            size="sm"
            onClick={handlePostNext}
            loading={posting}
            className="bg-emerald-600 hover:bg-emerald-700"
            title="Record the next month's share in your books"
          >
            <CalendarClock className="mr-2 size-4" />Record next month
          </Button>
        )}
        {acc.status !== "cancelled" && (
          <Button variant="outline" size="sm" onClick={handleCancel} className="text-red-600" title="Stop any remaining months from being recorded">
            <Ban className="mr-2 size-4" />Cancel accrual
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[acc.status] || ""}>
          {statusLabels[acc.status] || acc.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {acc.startDate} to {acc.endDate}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold font-mono">{formatMoney(acc.totalAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Months</p>
          <p className="text-xl font-bold font-mono">{acc.periods}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Recorded so far</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{postedCount} of {acc.periods}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[420px] grid-cols-[1fr_140px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Month</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Recorded</span>
        </div>
        {entries.map((entry) => (
          <div key={entry.id} className="grid min-w-[420px] grid-cols-[1fr_140px_120px] gap-2 border-b px-4 py-2.5 last:border-b-0 items-center">
            <span className="text-sm">{entry.periodDate}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(entry.amount)}</span>
            <span className="text-right">
              {entry.posted ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="size-3.5" />Recorded
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Not yet</span>
              )}
            </span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right">
          <span className="text-sm font-bold">Total: {formatMoney(acc.totalAmount)}</span>
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
