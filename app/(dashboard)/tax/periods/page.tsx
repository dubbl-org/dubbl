"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  CalendarDays,
  FileCheck,
  Trash2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { cn } from "@/lib/utils";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { PageHeader } from "@/components/dashboard/page-header";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaxPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  filedAt: string | null;
  filedReference: string | null;
  notes: string | null;
  createdAt: string;
}

function getDaysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getFilingStatus(period: TaxPeriod): {
  label: string;
  variant: "overdue" | "due-soon" | "filed" | "open";
  daysText: string;
} {
  if (period.status === "filed") {
    return {
      label: "Filed",
      variant: "filed",
      daysText: period.filedAt
        ? `Filed ${new Date(period.filedAt).toLocaleDateString()}`
        : "Filed",
    };
  }

  const days = getDaysUntil(period.endDate);

  if (days < 0) {
    return {
      label: "Overdue",
      variant: "overdue",
      daysText: `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue`,
    };
  }

  if (days <= 14) {
    return {
      label: "Due Soon",
      variant: "due-soon",
      daysText: days === 0
        ? "Due today"
        : `${days} day${days !== 1 ? "s" : ""} left`,
    };
  }

  return {
    label: "Open",
    variant: "open",
    daysText: `${days} day${days !== 1 ? "s" : ""} left`,
  };
}

const FILING_BADGE_STYLES: Record<string, string> = {
  overdue:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  "due-soon":
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  filed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  open:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
};

/* ------------------------------------------------------------------ */
/*  Create Period Sheet                                                */
/* ------------------------------------------------------------------ */

function CreatePeriodSheet({
  open,
  setOpen,
  onCreated,
  orgId,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  onCreated: () => void;
  orgId: string | null;
}) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState("quarterly");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/v1/tax-periods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name,
          startDate,
          endDate,
          type,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tax period created");
      setOpen(false);
      setName("");
      setStartDate("");
      setEndDate("");
      setNotes("");
      onCreated();
    } catch {
      toast.error("Failed to create tax period");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="mr-1.5 size-3.5" />
          New Tax Period
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New Tax Period</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 2026"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Creating..." : "Create"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  File Sheet                                                         */
/* ------------------------------------------------------------------ */

function FileSheet({
  period,
  onClose,
  onFiled,
  orgId,
}: {
  period: TaxPeriod | null;
  onClose: () => void;
  onFiled: () => void;
  orgId: string | null;
}) {
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleFile(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !period) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/tax-periods/${period.id}/file`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ filedReference: reference || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tax period marked as filed");
      onClose();
      setReference("");
      onFiled();
    } catch {
      toast.error("Failed to file tax period");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={!!period}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>File Tax Period</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleFile} className="space-y-4 px-4">
          <p className="text-sm text-muted-foreground">
            Mark &quot;{period?.name}&quot; as filed. This action cannot be
            undone.
          </p>
          <div className="space-y-2">
            <Label>Filing Reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. confirmation number"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Filing..." : "Mark as Filed"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({
  createOpen,
  setCreateOpen,
  fetchPeriods,
  orgId,
}: {
  createOpen: boolean;
  setCreateOpen: (v: boolean) => void;
  fetchPeriods: () => void;
  orgId: string | null;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none w-full space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border px-4 py-3"
            >
              <div className="size-9 rounded-lg bg-muted" />
              <div className="space-y-1.5">
                <div className="h-2 w-16 rounded bg-muted/60" />
                <div className="h-4 w-8 rounded bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="flex h-10 items-center gap-4 border-b bg-muted/30 px-4">
            <div className="h-2 w-14 rounded bg-muted-foreground/20" />
            <div className="h-2 w-20 rounded bg-muted-foreground/20" />
            <div className="hidden h-2 w-12 rounded bg-muted-foreground/20 sm:block" />
            <div className="hidden h-2 w-12 rounded bg-muted-foreground/20 sm:block" />
            <div className="hidden h-2 w-16 rounded bg-muted-foreground/20 sm:block" />
            <div className="ml-auto h-2 w-14 rounded bg-muted-foreground/20" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex h-11 items-center gap-4 border-b px-4 last:border-0"
            >
              <div
                className={`h-2.5 rounded bg-muted ${i % 2 === 0 ? "w-20" : "w-16"}`}
              />
              <div
                className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-32" : "w-28"}`}
              />
              <div className="hidden h-2.5 w-16 rounded bg-muted/40 sm:block" />
              <div className="hidden h-5 w-12 shrink-0 rounded-full border bg-muted/30 px-2.5 py-0.5 sm:block" />
              <div className="hidden h-2.5 w-20 rounded bg-muted/40 sm:block" />
              <div className="ml-auto h-2.5 w-10 rounded bg-muted/30" />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-background" />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-950/50">
          <CalendarDays className="size-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">
          No tax periods yet
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          Create tax periods to track your filing deadlines and mark them as
          filed when submitted to the tax authority.
        </p>
        <div className="mt-6">
          <CreatePeriodSheet
            open={createOpen}
            setOpen={setCreateOpen}
            onCreated={fetchPeriods}
            orgId={orgId}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TaxPeriodsPage() {
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filing, setFiling] = useState<TaxPeriod | null>(null);
  useDocumentTitle("Tax · Periods");

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  const fetchPeriods = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/tax-periods", {
        headers: { "x-organization-id": orgId },
      });
      const data = await res.json();
      if (data.taxPeriods) setPeriods(data.taxPeriods);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchPeriods();
  }, [orgId]);

  async function handleDelete(id: string) {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/tax-periods/${id}`, {
        method: "DELETE",
        headers: { "x-organization-id": orgId },
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Tax period deleted");
      fetchPeriods();
    } catch {
      toast.error("Failed to delete tax period");
    }
  }

  const openCount = periods.filter((p) => p.status === "open").length;
  const filedCount = periods.filter((p) => p.status === "filed").length;
  const progressPercent =
    periods.length > 0 ? Math.round((filedCount / periods.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Periods"
        description="Track filing deadlines, manage tax periods, and stay on top of submissions."
      >
        {!loading && periods.length > 0 && (
          <CreatePeriodSheet
            open={createOpen}
            setOpen={setCreateOpen}
            onCreated={fetchPeriods}
            orgId={orgId}
          />
        )}
      </PageHeader>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : periods.length === 0 ? (
        <ContentReveal>
          <EmptyState
            createOpen={createOpen}
            setCreateOpen={setCreateOpen}
            fetchPeriods={fetchPeriods}
            orgId={orgId}
          />
        </ContentReveal>
      ) : (
        <ContentReveal className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {/* Total */}
            <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <CalendarDays className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Periods</p>
                <p className="text-lg font-semibold tabular-nums">
                  {periods.length}
                </p>
              </div>
            </div>

            {/* Open */}
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/40 dark:bg-blue-950/20">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                <Clock className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                  {openCount}
                </p>
              </div>
            </div>

            {/* Filed */}
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-950/20">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Filed</p>
                <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {filedCount}
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="flex flex-col justify-center gap-2 rounded-xl border bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Filing Progress</p>
                <p className="text-xs font-medium tabular-nums">
                  {progressPercent}%
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {filedCount} of {periods.length} periods filed
              </p>
            </div>
          </div>

          {/* Section header */}
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
            All Periods
          </p>

          {/* Table */}
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Period
                  </th>
                  <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="hidden px-4 py-2.5 text-left text-xs font-medium text-muted-foreground sm:table-cell">
                    Due / Filed
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const filing_status = getFilingStatus(p);

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b last:border-b-0 transition-colors",
                        filing_status.variant === "overdue" &&
                          "bg-red-50/30 dark:bg-red-950/10"
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <span className="whitespace-nowrap">
                          {new Date(p.startDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {" · "}
                        <span className="whitespace-nowrap">
                          {new Date(p.endDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 capitalize text-muted-foreground sm:table-cell">
                        {p.type}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] gap-1",
                            FILING_BADGE_STYLES[filing_status.variant]
                          )}
                        >
                          {filing_status.variant === "overdue" && (
                            <AlertTriangle className="size-3" />
                          )}
                          {filing_status.label}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <span
                          className={cn(
                            "text-xs",
                            filing_status.variant === "overdue"
                              ? "font-medium text-red-600 dark:text-red-400"
                              : filing_status.variant === "due-soon"
                                ? "font-medium text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          )}
                        >
                          {filing_status.daysText}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.status === "open" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setFiling(p)}
                            >
                              <FileCheck className="mr-1 size-3" />
                              File
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(p.id)}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <FileSheet
            period={filing}
            onClose={() => setFiling(null)}
            onFiled={fetchPeriods}
            orgId={orgId}
          />
        </ContentReveal>
      )}
    </div>
  );
}
