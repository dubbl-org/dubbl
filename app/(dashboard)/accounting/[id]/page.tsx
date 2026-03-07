"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  createdBy: string | null;
  postedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  lines: Line[];
}

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidReason, setVoidReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch(`/api/v1/entries/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entry) setEntry(data.entry);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function postEntry() {
    const orgId = localStorage.getItem("activeOrgId");
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
      toast.success("Entry posted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setActionLoading(false);
    }
  }

  async function voidEntry() {
    const orgId = localStorage.getItem("activeOrgId");
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
      toast.success("Entry voided");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!entry) {
    return <p className="text-muted-foreground">Entry not found.</p>;
  }

  const totalDebit = entry.lines.reduce(
    (sum, l) => sum + parseFloat(l.debitAmount || "0"),
    0
  );
  const totalCredit = entry.lines.reduce(
    (sum, l) => sum + parseFloat(l.creditAmount || "0"),
    0
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Entry #${entry.entryNumber}`}
        description={entry.description}
      >
        {entry.status === "draft" && (
          <Button
            onClick={postEntry}
            disabled={actionLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Check className="mr-2 size-4" />
            Post
          </Button>
        )}
        {entry.status === "posted" && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <X className="mr-2 size-4" />
                Void
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Void Entry #{entry.entryNumber}</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. Please provide a reason.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Reason for voiding..."
              />
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={voidEntry}
                  disabled={!voidReason || actionLoading}
                >
                  Void Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Date</span>
          <p className="font-medium">{entry.date}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Reference</span>
          <p className="font-medium">{entry.reference || "-"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <div className="mt-1">
            <Badge
              variant="outline"
              className={
                entry.status === "posted"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : entry.status === "void"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : ""
              }
            >
              {entry.status}
            </Badge>
          </div>
        </div>
      </div>

      {entry.voidReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Void reason:</strong> {entry.voidReason}
        </div>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right w-32">Debit</TableHead>
              <TableHead className="text-right w-32">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">
                  <span className="text-xs text-muted-foreground mr-2">
                    {line.accountCode}
                  </span>
                  {line.accountName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {line.description || "-"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {parseFloat(line.debitAmount) > 0
                    ? parseFloat(line.debitAmount).toFixed(2)
                    : ""}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {parseFloat(line.creditAmount) > 0
                    ? parseFloat(line.creditAmount).toFixed(2)
                    : ""}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30 font-semibold">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {totalDebit.toFixed(2)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {totalCredit.toFixed(2)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
