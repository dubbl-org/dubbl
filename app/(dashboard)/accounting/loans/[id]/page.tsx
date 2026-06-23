"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Wallet, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import Link from "next/link";

interface LoanDetail {
  id: string;
  name: string;
  principalAmount: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  monthlyPayment: number;
  status: string;
}

interface ScheduleEntry {
  id: string;
  periodNumber: number;
  date: string | null;
  principalAmount: number;
  interestAmount: number;
  totalPayment: number;
  remainingBalance: number;
  posted: boolean;
}

const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paid_off: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  defaulted: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

// Plain-language status labels (end users aren't accountants).
const statusLabels: Record<string, string> = {
  active: "active",
  paid_off: "paid off",
  defaulted: "defaulted",
};

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [ln, setLn] = useState<LoanDetail | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(ln?.name);

  function load() {
    if (!orgId) return;
    fetch(`/api/v1/loans/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.loan) setLn(data.loan);
        if (data.schedule) setSchedule(data.schedule);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, orgId]);

  const nextEntry = schedule.find((e) => !e.posted);

  async function handlePostPayment() {
    if (!orgId || !nextEntry) return;
    await confirm({
      title: "Record this month's payment?",
      description: `This logs payment #${nextEntry.periodNumber} of ${formatMoney(nextEntry.totalPayment)} — ${formatMoney(nextEntry.principalAmount)} off the loan and ${formatMoney(nextEntry.interestAmount)} in interest.`,
      confirmLabel: "Record payment",
      onConfirm: async () => {
        setPosting(true);
        try {
          const res = await fetch(`/api/v1/loans/${id}/post-payment`, {
            method: "POST",
            headers: { "x-organization-id": orgId },
          });
          if (res.ok) {
            toast.success("Payment recorded");
            load();
          } else {
            const data = await res.json();
            toast.error(typeof data.error === "string" ? data.error : "Couldn't record the payment");
          }
        } finally {
          setPosting(false);
        }
      },
    });
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!ln) return <div className="space-y-6"><PageHeader title="Loan not found" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader title={ln.name} description="Loan">
        <Button variant="outline" size="sm" asChild>
          <Link href="/accounting/loans"><ArrowLeft className="mr-2 size-4" />Back</Link>
        </Button>
        {ln.status === "active" && nextEntry && (
          <Button
            size="sm"
            onClick={handlePostPayment}
            loading={posting}
            className="bg-emerald-600 hover:bg-emerald-700"
            title="Log the next scheduled monthly payment"
          >
            <Wallet className="mr-2 size-4" />Record this month&apos;s payment
          </Button>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge variant="outline" className={statusColors[ln.status] || ""}>
          {statusLabels[ln.status] || ln.status}
        </Badge>
        <span className="text-xs sm:text-sm text-muted-foreground">
          Started {ln.startDate}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Amount borrowed</p>
          <p className="text-xl font-bold font-mono">{formatMoney(ln.principalAmount)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Interest rate</p>
          <p className="text-xl font-bold font-mono">{(ln.interestRate / 100).toFixed(2)}%</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Length</p>
          <p className="text-xl font-bold font-mono">{ln.termMonths} months</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Monthly payment</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(ln.monthlyPayment)}</p>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-[60px_110px_1fr_1fr_1fr_1fr_90px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>#</span>
          <span>Date</span>
          <span className="text-right">Off the loan</span>
          <span className="text-right">Interest</span>
          <span className="text-right">Payment</span>
          <span className="text-right">Still owed</span>
          <span className="text-right">Recorded</span>
        </div>
        {schedule.map((entry) => (
          <div
            key={entry.id}
            className={`grid min-w-[640px] grid-cols-[60px_110px_1fr_1fr_1fr_1fr_90px] gap-2 border-b px-4 py-2 last:border-b-0 ${
              !entry.posted && entry.id === nextEntry?.id ? "bg-emerald-50/30 dark:bg-emerald-950/10" : ""
            }`}
          >
            <span className="text-sm font-mono">{entry.periodNumber}</span>
            <span className="text-sm">{entry.date || "-"}</span>
            <span className="text-right text-sm font-mono">{formatMoney(entry.principalAmount)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(entry.interestAmount)}</span>
            <span className="text-right text-sm font-mono font-medium">{formatMoney(entry.totalPayment)}</span>
            <span className="text-right text-sm font-mono">{formatMoney(entry.remainingBalance)}</span>
            <span className="text-right text-sm">
              {entry.posted ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3.5" />
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </span>
          </div>
        ))}
        {schedule.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No payment schedule for this loan.
          </div>
        )}
      </div>

      {confirmDialog}
    </div>
  );
}
