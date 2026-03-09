"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import {
  FileText,
  Plus,
  Search,
  ArrowUpDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

interface PayrollRun {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedAt: string | null;
}

type StatusFilter = "all" | "draft" | "completed" | "void";
type SortKey = "date" | "gross" | "net";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "gross", label: "Gross" },
  { value: "net", label: "Net" },
];

const statusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  void: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

export default function PayrollRunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Search, filter, sort
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const pendingSearch = search !== debouncedSearch;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // New run dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [payPeriodStart, setPayPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().split("T")[0];
  });

  const fetchRuns = useCallback(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    const isRefetch = !loading;
    if (isRefetch) setRefetching(true);

    fetch("/api/v1/payroll/runs", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        setRuns(data.data || []);
      })
      .finally(() => {
        setLoading(false);
        setRefetching(false);
        setFetchKey((k) => k + 1);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Re-animate on filter/sort/search changes
  useEffect(() => {
    if (!loading) setFetchKey((k) => k + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, sortBy, sortOrder, debouncedSearch]);

  // Client-side filtering + sorting
  const filtered = runs
    .filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const startMatch = r.payPeriodStart.includes(q);
        const endMatch = r.payPeriodEnd.includes(q);
        const statusMatch = r.status.toLowerCase().includes(q);
        if (!startMatch && !endMatch && !statusMatch) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const dir = sortOrder === "asc" ? 1 : -1;
      switch (sortBy) {
        case "gross":
          return dir * (a.totalGross - b.totalGross);
        case "net":
          return dir * (a.totalNet - b.totalNet);
        case "date":
        default:
          return dir * a.payPeriodStart.localeCompare(b.payPeriodStart);
      }
    });

  function toggleSortOrder() {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }

  async function handleCreateRun() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setCreating(true);

    try {
      const res = await fetch("/api/v1/payroll/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ payPeriodStart, payPeriodEnd }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create payroll run");
      }

      const data = await res.json();
      toast.success("Payroll run created");
      setDialogOpen(false);
      router.push(`/payroll/runs/${data.run.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create payroll run"
      );
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (runs.length === 0) {
    return (
      <ContentReveal className="space-y-6">
        <PageHeader
          title="Payroll Runs"
          description="Create and manage pay runs."
        />

        {/* Visual empty state */}
        <div className="relative overflow-hidden rounded-2xl border border-dashed border-emerald-200 dark:border-emerald-900/50">
          <div className="relative flex flex-col items-center py-16 px-6">
            {/* Timeline illustration */}
            <div className="relative mb-8 w-full max-w-sm">
              <div className="absolute top-1/2 left-4 right-4 h-px bg-muted-foreground/15 -translate-y-1/2" />
              <div className="flex items-center justify-between relative">
                {[
                  { icon: FileText, label: "Create", delay: 0.15, active: true },
                  { icon: ArrowUpDown, label: "Process", delay: 0.25, active: false },
                  { icon: Search, label: "Review", delay: 0.35, active: false },
                ].map((step, i) => (
                  <motion.div
                    key={step.label}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: step.delay, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className={cn(
                      "flex size-12 items-center justify-center rounded-xl",
                      step.active
                        ? "bg-emerald-100 dark:bg-emerald-950/60 ring-4 ring-emerald-100/50 dark:ring-emerald-900/30"
                        : "bg-muted/60 ring-2 ring-muted/40"
                    )}>
                      <step.icon className={cn(
                        "size-5",
                        step.active
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground/40"
                      )} />
                    </div>
                    <span className={cn(
                      "text-xs font-medium",
                      step.active ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground/40"
                    )}>
                      {step.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="text-lg font-semibold"
            >
              Run your first payroll
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.45 }}
              className="mt-2 max-w-sm text-sm text-muted-foreground text-center leading-relaxed"
            >
              Create a pay run with a period range, review the calculated amounts for each employee, then process it to finalize payments.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.55 }}
              className="mt-6"
            >
              <Button
                size="lg"
                onClick={() => setDialogOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
              >
                <Plus className="mr-2 size-4" />
                New Payroll Run
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Ghost run rows with fake data */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.65 }}
          className="rounded-xl border border-dashed border-muted-foreground/15 divide-y divide-dashed divide-muted-foreground/10"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5" style={{ opacity: 1 - i * 0.25 }}>
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-muted/40" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-40 rounded bg-muted/40" />
                  <div className="h-4 w-16 rounded-full bg-muted/25" />
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4">
                <div className="space-y-1 text-right">
                  <div className="h-2.5 w-8 rounded bg-muted/25 ml-auto" />
                  <div className="h-3.5 w-16 rounded bg-muted/30" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-2.5 w-8 rounded bg-muted/25 ml-auto" />
                  <div className="h-3.5 w-16 rounded bg-muted/30" />
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        <NewRunDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          payPeriodStart={payPeriodStart}
          setPayPeriodStart={setPayPeriodStart}
          payPeriodEnd={payPeriodEnd}
          setPayPeriodEnd={setPayPeriodEnd}
          onSubmit={handleCreateRun}
          loading={creating}
        />
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <PageHeader
        title="Payroll Runs"
        description="Create and manage pay runs."
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="void">Void</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-3" />
            New Payroll Run
          </Button>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by date or status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
              <ArrowUpDown className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={toggleSortOrder}>
            <ArrowUpDown className={cn("size-3.5 transition-transform", sortOrder === "asc" && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Runs list */}
      {refetching || pendingSearch ? (
        <div className="flex items-center justify-center py-20">
          <div className="brand-loader" aria-label="Loading">
            <div className="brand-loader-circle brand-loader-circle-1" />
            <div className="brand-loader-circle brand-loader-circle-2" />
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <ContentReveal key={fetchKey}>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No runs found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Try a different search term" : "No runs match this filter"}
            </p>
          </div>
        </ContentReveal>
      ) : (
        <MotionConfig reducedMotion="never">
          <motion.div
            key={fetchKey}
            initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "opacity, transform, filter" }}
          >
            <div className="rounded-xl border bg-card divide-y">
              {filtered.map((run) => (
                <button
                  key={run.id}
                  onClick={() => router.push(`/payroll/runs/${run.id}`)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {run.payPeriodStart} to {run.payPeriodEnd}
                      </p>
                      <Badge variant="outline" className={cn("mt-0.5 text-[11px]", statusColors[run.status] || "")}>
                        {run.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">Gross</p>
                      <p className="text-sm font-mono tabular-nums">{formatMoney(run.totalGross)}</p>
                    </div>
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">Deductions</p>
                      <p className="text-sm font-mono tabular-nums text-red-600 dark:text-red-400">{formatMoney(run.totalDeductions)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Net</p>
                      <p className="text-sm font-mono tabular-nums font-medium">{formatMoney(run.totalNet)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </MotionConfig>
      )}

      <NewRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payPeriodStart={payPeriodStart}
        setPayPeriodStart={setPayPeriodStart}
        payPeriodEnd={payPeriodEnd}
        setPayPeriodEnd={setPayPeriodEnd}
        onSubmit={handleCreateRun}
        loading={creating}
      />
    </ContentReveal>
  );
}

function NewRunDialog({
  open,
  onOpenChange,
  payPeriodStart,
  setPayPeriodStart,
  payPeriodEnd,
  setPayPeriodEnd,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payPeriodStart: string;
  setPayPeriodStart: (v: string) => void;
  payPeriodEnd: string;
  setPayPeriodEnd: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Pay Period Start</Label>
            <Input
              type="date"
              value={payPeriodStart}
              onChange={(e) => setPayPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Pay Period End</Label>
            <Input
              type="date"
              value={payPeriodEnd}
              onChange={(e) => setPayPeriodEnd(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!payPeriodStart || !payPeriodEnd || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Create Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
