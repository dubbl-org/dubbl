"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, BarChart3, Trash2, CheckCircle2, Play, Undo2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { formatMoney } from "@/lib/money";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useApi } from "@/lib/query/use-api";

interface ReviewDetail {
  id: string;
  name: string;
  effectiveDate: string;
  status: string;
  totalBudget: number | null;
  entries: ReviewEntry[];
}

interface ReviewEntry {
  id: string;
  employeeId: string;
  currentSalary: number;
  proposedSalary: number;
  adjustmentPercent: number | null;
  reason: string | null;
  approved: boolean | null;
  employee: { name: string; employeeNumber: string } | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  employeeNumber: string;
  /** Annual salary in cents. */
  salary: number;
  currency: string | null;
}

type ReviewStatus = "draft" | "in_progress" | "completed" | "cancelled";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const statusColors: Record<string, string> = {
  draft: "",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

async function readError(res: Response, fallback: string) {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" ? data.error : fallback;
}

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, loading, refetch } = useApi<{ review?: ReviewDetail }>(`/api/v1/payroll/compensation/reviews/${id}`);
  const review = data?.review ?? null;
  const editable = review?.status === "draft" || review?.status === "in_progress";
  const { data: employeesData } = useApi<{ data?: EmployeeOption[] }>(
    editable ? "/api/v1/payroll/employees?active=true&limit=100" : null
  );
  const { confirm, dialog: confirmDialog } = useConfirm();
  useDocumentTitle("Payroll · Review Details");

  // Add-entry form; the current salary is prefilled from the picked employee
  const [employeeId, setEmployeeId] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [proposedSalary, setProposedSalary] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;
  const headers = (json = false): Record<string, string> => ({
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(orgId ? { "x-organization-id": orgId } : {}),
  });

  const availableEmployees = useMemo(() => {
    const inReview = new Set((review?.entries ?? []).map((e) => e.employeeId));
    return (employeesData?.data ?? []).filter((e) => !inReview.has(e.id));
  }, [employeesData, review]);

  function pickEmployee(value: string) {
    setEmployeeId(value);
    const emp = availableEmployees.find((e) => e.id === value);
    setCurrentSalary(emp ? (emp.salary / 100).toFixed(2) : "");
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId || !proposedSalary) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/payroll/compensation/reviews/${id}/entries`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({
          employeeId,
          ...(currentSalary ? { currentSalary: Math.round(parseFloat(currentSalary) * 100) } : {}),
          proposedSalary: Math.round(parseFloat(proposedSalary) * 100),
          reason: reason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to add entry"));
      toast.success("Entry added");
      setEmployeeId(""); setCurrentSalary(""); setProposedSalary(""); setReason("");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveEntry(entryId: string, name: string) {
    const ok = await confirm({
      title: `Remove ${name} from this review?`,
      description: "Their salary won't change when the review is completed.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/v1/payroll/compensation/reviews/${id}/entries/${entryId}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (res.ok) {
      toast.success("Entry removed");
      await refetch();
    } else {
      toast.error(await readError(res, "Failed to remove entry"));
    }
  }

  async function changeStatus(status: ReviewStatus) {
    if (status === "completed") {
      const ok = await confirm({
        title: "Complete this review?",
        description: "Each employee's annual salary will be set to the proposed salary now. This can't be undone.",
        confirmLabel: "Complete and apply",
      });
      if (!ok) return;
    } else if (status === "cancelled") {
      const ok = await confirm({
        title: "Cancel this review?",
        description: "No salaries will change. A cancelled review can't be reopened.",
        confirmLabel: "Cancel review",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payroll/compensation/reviews/${id}`, {
        method: "PATCH",
        headers: headers(true),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await readError(res, "Failed to update review"));
      const body = (await res.json()) as { salariesUpdated?: number };
      if (status === "completed") {
        const n = body.salariesUpdated ?? 0;
        toast.success(`Review completed. ${n} ${n === 1 ? "salary" : "salaries"} updated.`);
      } else {
        toast.success(`Review moved to ${STATUS_LABELS[status].toLowerCase()}`);
      }
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update review");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <BrandLoader />;
  if (!review) {
    return (
      <ContentReveal>
        <button onClick={() => router.push("/payroll/compensation")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <p className="text-sm text-muted-foreground">Review not found</p>
      </ContentReveal>
    );
  }

  const totalCurrent = review.entries.reduce((s, e) => s + e.currentSalary, 0);
  const totalProposed = review.entries.reduce((s, e) => s + e.proposedSalary, 0);

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push("/payroll/compensation")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to compensation
      </button>

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
          <BarChart3 className="size-5 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{review.name}</h1>
            <Badge variant="outline" className={statusColors[review.status] || ""}>{STATUS_LABELS[review.status] ?? review.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Effective: {review.effectiveDate}
            {review.totalBudget != null && <> · Budget {formatMoney(review.totalBudget)}</>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {review.status === "draft" && (
            <Button size="sm" onClick={() => changeStatus("in_progress")} disabled={busy}>
              <Play className="mr-1.5 size-3.5" /> Start review
            </Button>
          )}
          {review.status === "in_progress" && (
            <>
              <Button size="sm" variant="outline" onClick={() => changeStatus("draft")} disabled={busy}>
                <Undo2 className="mr-1.5 size-3.5" /> Back to draft
              </Button>
              <Button size="sm" onClick={() => changeStatus("completed")} disabled={busy || review.entries.length === 0}>
                <CheckCircle2 className="mr-1.5 size-3.5" /> Complete review
              </Button>
            </>
          )}
          {editable && (
            <Button size="sm" variant="outline" onClick={() => changeStatus("cancelled")} disabled={busy}>
              <XCircle className="mr-1.5 size-3.5" /> Cancel review
            </Button>
          )}
        </div>
      </div>

      {review.status === "completed" && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This review is completed. The proposed salaries were applied to the employees.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current Total</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(totalCurrent)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Proposed Total</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate text-brand-600 dark:text-brand-400">{formatMoney(totalProposed)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total Increase</p>
          <p className="mt-1 text-2xl font-bold font-mono tabular-nums truncate">{formatMoney(totalProposed - totalCurrent)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Entries ({review.entries.length})</h3>
        {editable && (
          <form onSubmit={handleAddEntry} className="rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Employee</Label>
                <Select value={employeeId} onValueChange={pickEmployee}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pick an employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEmployees.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No employees left to add</div>
                    ) : (
                      availableEmployees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeNumber})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Current salary</Label>
                <CurrencyInput prefix="$" size="sm" value={currentSalary} onChange={setCurrentSalary} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Proposed salary</Label>
                <CurrencyInput prefix="$" size="sm" value={proposedSalary} onChange={setProposedSalary} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={adding || !employeeId || !proposedSalary}>
              <Plus className="mr-1.5 size-3" /> {adding ? "Adding..." : "Add Entry"}
            </Button>
          </form>
        )}
        {review.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No entries yet</p>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {review.entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{e.employee?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{e.employee?.employeeNumber}</p>
                  {e.reason && <p className="text-xs text-muted-foreground mt-0.5">{e.reason}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Current</p>
                    <p className="text-sm font-mono tabular-nums">{formatMoney(e.currentSalary)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Proposed</p>
                    <p className="text-sm font-mono tabular-nums font-medium text-brand-600 dark:text-brand-400">{formatMoney(e.proposedSalary)}</p>
                  </div>
                  {e.adjustmentPercent !== null && (
                    <Badge variant="outline" className="text-[10px]">
                      {e.adjustmentPercent >= 0 ? "+" : ""}{e.adjustmentPercent.toFixed(1)}%
                    </Badge>
                  )}
                  {e.approved === false && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Not applied</Badge>
                  )}
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemoveEntry(e.id, e.employee?.name || "this employee")}
                      aria-label="Remove entry"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {confirmDialog}
    </ContentReveal>
  );
}
