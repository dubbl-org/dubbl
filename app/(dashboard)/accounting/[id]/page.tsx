"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  X,
  Trash2,
  BookOpen,
  Calendar,
  Hash,
  FileText,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useEntityTitle } from "@/lib/hooks/use-entity-title";
import { ContentReveal } from "@/components/ui/content-reveal";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Line {
  id: string;
  accountCode: string;
  accountName: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
}

interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  reference: string | null;
  status: "draft" | "posted" | "void";
  sourceType: string | null;
  sourceId: string | null;
  createdBy: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  lines: Line[];
}

const statusConfig: Record<string, { class: string; label: string; bg: string }> = {
  draft: {
    class: "",
    label: "Draft",
    bg: "bg-gray-500",
  },
  posted: {
    class: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    label: "Posted",
    bg: "bg-emerald-500",
  },
  void: {
    class: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
    label: "Void",
    bg: "bg-red-500",
  },
};

const sourceTypeLabels: Record<string, string> = {
  manual: "Manual Entry",
  invoice: "Invoice",
  bill: "Bill",
  payment: "Payment",
  expense: "Expense",
  bank: "Bank Transaction",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  depreciation: "Depreciation",
  year_end_close: "Year-End Closing",
  opening_balance: "Opening Balance",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    + " at "
    + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidReason, setVoidReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEntityTitle(entry ? `JE-${entry.entryNumber}` : undefined);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/entries/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entry) setEntry(data.entry);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function postEntry() {
    if (!orgId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/entries/${id}/post`, {
        method: "POST",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setEntry(data.entry);
      toast.success("Entry posted to the general ledger");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setActionLoading(false);
    }
  }

  async function voidEntry() {
    if (!orgId || !voidReason) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/entries/${id}/void`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ reason: voidReason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setEntry(data.entry);
      setVoidReason("");
      toast.success("Entry voided");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void");
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteEntry() {
    if (!orgId) return;
    await confirm({
      title: "Delete this entry?",
      description: "This will permanently remove the draft journal entry. This cannot be undone.",
      confirmLabel: "Delete Entry",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/entries/${id}`, {
          method: "DELETE",
          headers: { "x-organization-id": orgId },
        });
        if (res.ok) {
          toast.success("Entry deleted");
          router.push("/accounting");
        } else {
          toast.error("Failed to delete entry");
        }
      },
    });
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild className="size-8 p-0">
          <Link href="/accounting"><ArrowLeft className="size-4" /></Link>
        </Button>
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <FileText className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Journal entry not found.</p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/accounting">Back to Transactions</Link>
          </Button>
        </div>
      </div>
    );
  }

  const sc = statusConfig[entry.status] || statusConfig.draft;

  const totalDebit = entry.lines.reduce(
    (sum, l) => sum + parseFloat(l.debitAmount || "0"),
    0
  );
  const totalCredit = entry.lines.reduce(
    (sum, l) => sum + parseFloat(l.creditAmount || "0"),
    0
  );
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005;

  return (
    <ContentReveal>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild className="size-8 p-0">
              <Link href="/accounting"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  Entry #{entry.entryNumber}
                </h1>
                <Badge variant="outline" className={sc.class}>{sc.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {entry.description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {entry.status === "draft" && (
              <>
                <Button
                  size="sm"
                  onClick={postEntry}
                  disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="mr-2 size-4" />
                  Post
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteEntry}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </Button>
              </>
            )}
            {entry.status === "posted" && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600">
                    <X className="mr-2 size-4" />
                    Void
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Void Entry #{entry.entryNumber}</DialogTitle>
                    <DialogDescription>
                      This will reverse the entry in the general ledger. Please provide a reason.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Reason for voiding this entry..."
                    rows={3}
                  />
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      onClick={voidEntry}
                      disabled={!voidReason.trim() || actionLoading}
                    >
                      {actionLoading ? "Voiding..." : "Void Entry"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Void reason alert */}
        {entry.voidReason && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4">
            <AlertTriangle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Entry voided</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{entry.voidReason}</p>
            </div>
          </div>
        )}

        {/* Entry document card */}
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* Header with meta info */}
          <div className="border-b bg-muted/30 px-4 py-4 sm:px-6 sm:py-5">
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Left: Entry info */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Hash className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Entry Number</span>
                  <span className="text-sm font-mono font-semibold">{entry.entryNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Date</span>
                  <span className="text-sm">{formatDate(entry.date)}</span>
                </div>
                {entry.reference && (
                  <div className="flex items-center gap-2">
                    <FileText className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Reference</span>
                    <span className="text-sm">{entry.reference}</span>
                  </div>
                )}
              </div>

              {/* Right: Source & timestamps */}
              <div className="sm:text-right space-y-3">
                {entry.sourceType && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <BookOpen className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Source</span>
                    <Badge variant="outline" className="text-[10px]">
                      {sourceTypeLabels[entry.sourceType] || entry.sourceType}
                    </Badge>
                  </div>
                )}
                {entry.postedAt && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <Check className="size-3.5 text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Posted</span>
                    <span className="text-sm">{formatTimestamp(entry.postedAt)}</span>
                  </div>
                )}
                {entry.voidedAt && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <X className="size-3.5 text-red-500" />
                    <span className="text-xs text-muted-foreground">Voided</span>
                    <span className="text-sm">{formatTimestamp(entry.voidedAt)}</span>
                  </div>
                )}
                {!entry.postedAt && !entry.voidedAt && entry.createdAt && (
                  <div className="flex sm:justify-end items-center gap-2">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-sm">{formatTimestamp(entry.createdAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Journal lines table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b bg-muted/20">
                  <th className="px-6 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Account
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </th>
                  <th className="px-6 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-32">
                    Debit
                  </th>
                  <th className="px-6 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-32">
                    Credit
                  </th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line, i) => {
                  const debit = parseFloat(line.debitAmount);
                  const credit = parseFloat(line.creditAmount);
                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        i < entry.lines.length - 1 ? "border-b border-dashed" : "",
                        entry.status === "void" && "opacity-50"
                      )}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-mono text-muted-foreground shrink-0">
                            {line.accountCode}
                          </span>
                          <span className="font-medium">{line.accountName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {line.description || "-"}
                      </td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums">
                        {debit > 0 ? (
                          <span className="font-medium">{formatMoney(Math.round(debit * 100))}</span>
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-mono tabular-nums">
                        {credit > 0 ? (
                          <span className="font-medium">{formatMoney(Math.round(credit * 100))}</span>
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals footer */}
          <div className="border-t bg-muted/10 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Debits</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatMoney(Math.round(totalDebit * 100))}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Credits</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatMoney(Math.round(totalCredit * 100))}
                  </span>
                </div>
                <div className="h-px bg-border my-1" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Difference</span>
                  <span className={cn(
                    "font-mono tabular-nums font-semibold",
                    isBalanced
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {isBalanced ? "$0.00" : formatMoney(Math.round(Math.abs(totalDebit - totalCredit) * 100))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Details cards row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Entry details */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Entry Details
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-[11px] text-muted-foreground">Description</p>
                <p className="text-sm mt-0.5">{entry.description}</p>
              </div>
              {entry.reference && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Reference</p>
                  <p className="text-sm mt-0.5">{entry.reference}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-muted-foreground">Date</p>
                <p className="text-sm mt-0.5">{formatDate(entry.date)}</p>
              </div>
            </div>
          </div>

          {/* Audit trail */}
          <div className="rounded-xl border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Audit Trail
            </p>
            <div className="space-y-3">
              {entry.sourceType && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Source</p>
                  <p className="text-sm mt-0.5">
                    {sourceTypeLabels[entry.sourceType] || entry.sourceType}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-muted-foreground">Created</p>
                <p className="text-sm mt-0.5">{formatTimestamp(entry.createdAt)}</p>
              </div>
              {entry.postedAt && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Posted</p>
                  <p className="text-sm mt-0.5">{formatTimestamp(entry.postedAt)}</p>
                </div>
              )}
              {entry.voidedAt && (
                <div>
                  <p className="text-[11px] text-muted-foreground">Voided</p>
                  <p className="text-sm mt-0.5">{formatTimestamp(entry.voidedAt)}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-muted-foreground">Lines</p>
                <p className="text-sm mt-0.5">
                  {entry.lines.length} journal {entry.lines.length === 1 ? "line" : "lines"} ·{" "}
                  {entry.lines.filter((l) => parseFloat(l.debitAmount) > 0).length} debits,{" "}
                  {entry.lines.filter((l) => parseFloat(l.creditAmount) > 0).length} credits
                </p>
              </div>
            </div>
          </div>
        </div>

        {confirmDialog}
      </div>
    </ContentReveal>
  );
}
