"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ReceiptViewer } from "@/components/dashboard/receipt-viewer";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string | null;
  receiptFileKey: string | null;
  receiptFileName: string | null;
  account?: { code: string; name: string } | null;
};

type Claim = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  currencyCode: string;
  totalAmount: number;
  rejectionReason: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  submittedByUser: { name: string | null; email: string } | null;
  approvedByUser: { name: string | null; email: string } | null;
  items: Item[];
};

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  userName: string;
  changes: Record<string, unknown> | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
  founder_funded: "Founder funded",
  void: "Void",
};

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Edited",
  delete: "Deleted",
  approve: "Approved",
  reject: "Rejected",
  submit: "Submitted",
  matched_existing_expense: "Matched to a bank line",
  unmatched_existing_expense: "Match undone",
};

const money = (cents: number, cur: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency: cur }).format(cents / 100);

/**
 * The claim behind a reconciled line, without leaving the statement: reconciling
 * is a run of similar decisions and a navigation loses the place in it.
 */
export function ExpenseDrawer({
  claimId,
  orgId,
  onClose,
}: {
  claimId: string | null;
  orgId: string | null;
  onClose: () => void;
}) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!claimId || !orgId) return;
    let live = true;
    setLoading(true);
    setClaim(null);
    setHistory([]);
    const headers = { "x-organization-id": orgId };
    Promise.all([
      fetch(`/api/v1/expenses/${claimId}`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/v1/audit-log?entityType=expense&entityId=${claimId}&limit=20`, { headers })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([claimData, auditData]) => {
        if (!live) return;
        setClaim(claimData?.expenseClaim ?? null);
        setHistory((auditData?.data ?? []) as AuditEntry[]);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [claimId, orgId]);

  return (
    <Sheet open={Boolean(claimId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{claim?.title ?? "Expense claim"}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <p className="flex items-center gap-2 px-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading the claim…
          </p>
        ) : !claim ? (
          <p className="px-4 text-xs text-muted-foreground">This claim could not be loaded.</p>
        ) : (
          <div className="space-y-5 px-4 pb-8">
            {/* What it is */}
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[claim.status] ?? claim.status}
                  {claim.submittedByUser &&
                    ` · ${claim.submittedByUser.name || claim.submittedByUser.email}`}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Raised {new Date(claim.createdAt).toLocaleDateString()}
                  {claim.approvedAt && ` · Approved ${new Date(claim.approvedAt).toLocaleDateString()}`}
                  {claim.paidAt && ` · Paid ${new Date(claim.paidAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {money(claim.totalAmount, claim.currencyCode)}
              </span>
            </div>

            {claim.description && (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {claim.description}
              </p>
            )}
            {claim.rejectionReason && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                {claim.rejectionReason}
              </p>
            )}

            {/* What it was for, with the receipts */}
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {claim.items.length} item{claim.items.length === 1 ? "" : "s"}
              </p>
              <div className="divide-y rounded-lg border">
                {claim.items.map((item) => (
                  <div key={item.id} className="px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-xs font-medium">{item.description}</span>
                      <span className="shrink-0 text-xs tabular-nums">
                        {money(item.amount, claim.currencyCode)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {item.date}
                      {item.account && ` · ${item.account.code} ${item.account.name}`}
                      {!item.account && item.category && ` · ${item.category}`}
                    </p>
                    {item.receiptFileKey && item.receiptFileName && (
                      <div className="mt-1">
                        <ReceiptViewer fileKey={item.receiptFileKey} fileName={item.receiptFileName} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* What happened to it */}
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                History
              </p>
              {history.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex gap-2.5 text-[11px]">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <div className="min-w-0">
                        <p className="text-foreground">
                          {ACTION_LABEL[entry.action] ?? entry.action}
                          {entry.userName && (
                            <span className="text-muted-foreground"> · {entry.userName}</span>
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Button asChild variant="outline" size="sm" className="w-full justify-between">
              <Link href={`/purchases/expenses/${claim.id}`}>
                Open the full claim <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
