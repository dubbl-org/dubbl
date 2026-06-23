"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Pause, Play, Zap, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface RecurringJournalLine {
  id: string;
  description: string;
  accountId: string | null;
  debitAmount: number;
  creditAmount: number;
}

interface RecurringJournalDetail {
  id: string;
  name: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastRunDate: string | null;
  occurrencesGenerated: number;
  maxOccurrences: number | null;
  reference: string | null;
  notes: string | null;
  currencyCode: string;
  lines: RecurringJournalLine[];
}

const statusColors: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "posting automatically",
  paused: "paused",
  completed: "finished",
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

export default function RecurringJournalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [rj, setRj] = useState<RecurringJournalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [posting, setPosting] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(rj?.name);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/recurring-journals/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.template) setRj(data.template);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  // Pause / resume the schedule.
  async function handleToggle() {
    if (!orgId) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/v1/recurring-journals/${id}/pause`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        const data = await res.json();
        setRj((prev) => (prev ? { ...prev, ...data.template } : prev));
        toast.success(
          data.template?.status === "paused"
            ? "Schedule paused — it won't post until you resume it"
            : "Schedule resumed — it will post automatically again"
        );
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't change the schedule");
      }
    } finally {
      setToggling(false);
    }
  }

  // Post any entries that are due right now (catches up if behind).
  async function handlePostNow() {
    if (!orgId) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/v1/recurring-journals/run`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        const data = await res.json();
        const posted = data.posted ?? 0;
        toast.success(
          posted > 0
            ? `Posted ${posted} entr${posted === 1 ? "y" : "ies"} that were due`
            : "Nothing was due to post right now"
        );
        // Refresh this template to reflect new counts/next date.
        fetch(`/api/v1/recurring-journals/${id}`, { headers: { "x-organization-id": orgId } })
          .then((r) => r.json())
          .then((d) => { if (d.template) setRj(d.template); });
      } else {
        const data = await res.json();
        toast.error(typeof data.error === "string" ? data.error : "Couldn't post the entries");
      }
    } finally {
      setPosting(false);
    }
  }

  // Delete the schedule (already-posted journal entries are untouched).
  async function handleDelete() {
    if (!orgId) return;
    await confirm({
      title: "Delete this recurring journal?",
      description: "This stops it from posting any more entries. Entries it already posted stay in your books.",
      confirmLabel: "Delete schedule",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/recurring-journals/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Recurring journal deleted");
          router.push("/accounting/recurring-journals");
        } else {
          toast.error("Couldn't delete this recurring journal");
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!rj) return <div className="space-y-6"><PageHeader title="Recurring journal not found" /></div>;

  const totalDebit = rj.lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = rj.lines.reduce((s, l) => s + l.creditAmount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={rj.name} description="Manual journal entry that posts on a schedule">
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounting/recurring-journals"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {rj.status !== "completed" && (
          <Button
            size="sm"
            onClick={handlePostNow}
            loading={posting}
            className="bg-emerald-600 hover:bg-emerald-700"
            title="Post any entries that are due right now"
          >
            <Zap className="mr-2 size-4" />Post entries due now
          </Button>
        )}
        {rj.status === "active" && (
          <Button variant="outline" size="sm" onClick={handleToggle} loading={toggling} title="Stop posting until you resume it">
            <Pause className="mr-2 size-4" />Pause
          </Button>
        )}
        {rj.status === "paused" && (
          <Button variant="outline" size="sm" onClick={handleToggle} loading={toggling} title="Start posting automatically again">
            <Play className="mr-2 size-4" />Resume
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600" title="Stop this schedule from posting any more entries">
          <Trash2 className="mr-2 size-4" />Delete
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[rj.status] || ""}>
          {statusLabels[rj.status] || rj.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          {frequencyLabels[rj.frequency] || rj.frequency}
        </span>
        {rj.reference && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            Ref: {rj.reference}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Next entry</p>
          <p className="text-sm font-medium mt-1">{rj.nextRunDate || "-"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Last posted</p>
          <p className="text-sm font-medium mt-1">{rj.lastRunDate || "Never"}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Posted so far</p>
          <p className="text-sm font-medium font-mono mt-1">
            {rj.occurrencesGenerated} / {rj.maxOccurrences ?? "∞"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Each entry</p>
          <p className="text-sm font-bold font-mono mt-1">{formatMoney(totalDebit, rj.currencyCode)}</p>
        </div>
      </div>

      {/* Journal legs */}
      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[500px] grid-cols-[1fr_140px_120px_120px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span>Account</span>
          <span className="text-right">Money in</span>
          <span className="text-right">Money out</span>
        </div>
        {rj.lines.map((line) => (
          <div key={line.id} className="grid min-w-[500px] grid-cols-[1fr_140px_120px_120px] gap-2 border-b px-4 py-2 last:border-b-0">
            <p className="text-sm">{line.description}</p>
            <span className="text-sm font-mono text-muted-foreground truncate">{line.accountId || "-"}</span>
            <span className="text-right text-sm font-mono">{line.debitAmount > 0 ? formatMoney(line.debitAmount, rj.currencyCode) : "-"}</span>
            <span className="text-right text-sm font-mono">{line.creditAmount > 0 ? formatMoney(line.creditAmount, rj.currencyCode) : "-"}</span>
          </div>
        ))}
        <div className="border-t bg-muted/30 px-4 py-2 text-right flex flex-wrap justify-end gap-x-4 gap-y-1">
          <span className="text-sm font-medium">Total in: {formatMoney(totalDebit, rj.currencyCode)}</span>
          <span className="text-sm font-medium">Total out: {formatMoney(totalCredit, rj.currencyCode)}</span>
        </div>
      </div>

      {rj.notes && (
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
          <p className="text-sm">{rj.notes}</p>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
