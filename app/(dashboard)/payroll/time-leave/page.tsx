"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import {
  Clock,
  CalendarDays,
  Plus,
  Search,
  ClipboardCheck,
  CheckCircle2,
  Timer,
  ArrowUpDown,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Section } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Timesheet {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
  employee: { name: string; employeeNumber: string } | null;
}

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  hours: number;
  status: string;
  reason: string | null;
  employee: { name: string } | null;
  policy: { name: string; leaveType: string } | null;
}

interface Employee {
  id: string;
  name: string;
}

interface Policy {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Status colours                                                     */
/* ------------------------------------------------------------------ */

const tsStatusColors: Record<string, string> = {
  draft: "",
  submitted:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const leaveStatusColors: Record<string, string> = {
  pending:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

/* ------------------------------------------------------------------ */
/*  Sort + filter types                                                */
/* ------------------------------------------------------------------ */

type TsFilter = "all" | "draft" | "submitted" | "approved" | "rejected";
type LeaveFilter = "all" | "pending" | "approved" | "rejected";
type TsSortKey = "employee" | "period" | "hours" | "status";
type LeaveSortKey = "employee" | "date" | "hours" | "status";

const TS_SORT_OPTIONS: { value: TsSortKey; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "period", label: "Period" },
  { value: "hours", label: "Hours" },
  { value: "status", label: "Status" },
];

const LEAVE_SORT_OPTIONS: { value: LeaveSortKey; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "date", label: "Date" },
  { value: "hours", label: "Hours" },
  { value: "status", label: "Status" },
];

/* ------------------------------------------------------------------ */
/*  Motion helpers                                                     */
/* ------------------------------------------------------------------ */

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TimeLeavePage() {
  const router = useRouter();

  /* ---- data ---- */
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- timesheet filters ---- */
  const [tsFilter, setTsFilter] = useState<TsFilter>("all");
  const [tsSearch, setTsSearch] = useState("");
  const debouncedTsSearch = useDebounce(tsSearch);
  const pendingTsSearch = tsSearch !== debouncedTsSearch;
  const [tsSortBy, setTsSortBy] = useState<TsSortKey>("period");
  const [tsSortOrder, setTsSortOrder] = useState<"asc" | "desc">("desc");
  const [tsFetchKey, setTsFetchKey] = useState(0);

  /* ---- leave filters ---- */
  const [leaveFilter, setLeaveFilter] = useState<LeaveFilter>("all");
  const [leaveSearch, setLeaveSearch] = useState("");
  const debouncedLeaveSearch = useDebounce(leaveSearch);
  const pendingLeaveSearch = leaveSearch !== debouncedLeaveSearch;
  const [leaveSortBy, setLeaveSortBy] = useState<LeaveSortKey>("date");
  const [leaveSortOrder, setLeaveSortOrder] = useState<"asc" | "desc">("desc");
  const [leaveFetchKey, setLeaveFetchKey] = useState(0);

  /* ---- drawers ---- */
  const [tsDrawerOpen, setTsDrawerOpen] = useState(false);
  const [leaveDrawerOpen, setLeaveDrawerOpen] = useState(false);
  const [savingTs, setSavingTs] = useState(false);
  const [savingLeave, setSavingLeave] = useState(false);

  const [newTs, setNewTs] = useState({
    employeeId: "",
    periodStart: "",
    periodEnd: "",
  });
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    policyId: "",
    startDate: "",
    endDate: "",
    hours: "",
    reason: "",
  });

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  /* ---- fetch ---- */
  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/timesheets", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/leave/requests", { headers }).then((r) =>
        r.json(),
      ),
      fetch("/api/v1/payroll/employees", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/leave/policies", { headers }).then((r) =>
        r.json(),
      ),
    ])
      .then(([tsData, leaveData, empData, polData]) => {
        if (tsData.data) setTimesheets(tsData.data);
        if (leaveData.data) setLeaveRequests(leaveData.data);
        if (empData.data)
          setEmployees(
            empData.data.map((e: any) => ({ id: e.id, name: e.name })),
          );
        if (polData.data)
          setPolicies(
            polData.data.map((p: any) => ({ id: p.id, name: p.name })),
          );
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* Re-animate on filter changes */
  useEffect(() => {
    if (!loading) setTsFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tsFilter, tsSortBy, tsSortOrder, debouncedTsSearch]);

  useEffect(() => {
    if (!loading) setLeaveFetchKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveFilter, leaveSortBy, leaveSortOrder, debouncedLeaveSearch]);

  /* ---- derived stats ---- */
  const activeTimesheets = timesheets.filter(
    (t) => t.status === "draft" || t.status === "submitted",
  ).length;

  const pendingApprovals =
    timesheets.filter((t) => t.status === "submitted").length +
    leaveRequests.filter((r) => r.status === "pending").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const approvedThisMonth =
    timesheets.filter(
      (t) => t.status === "approved" && t.periodEnd >= monthStart,
    ).length +
    leaveRequests.filter(
      (r) => r.status === "approved" && r.endDate >= monthStart,
    ).length;

  const leaveHoursUsed = leaveRequests
    .filter((r) => r.status === "approved")
    .reduce((sum, r) => sum + r.hours, 0);

  /* ---- filtered + sorted lists ---- */
  const filteredTs = timesheets
    .filter((ts) => {
      if (tsFilter !== "all" && ts.status !== tsFilter) return false;
      if (debouncedTsSearch) {
        const q = debouncedTsSearch.toLowerCase();
        return (
          ts.employee?.name.toLowerCase().includes(q) ||
          ts.periodStart.includes(q) ||
          ts.periodEnd.includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dir = tsSortOrder === "asc" ? 1 : -1;
      switch (tsSortBy) {
        case "employee":
          return dir * (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "");
        case "hours":
          return dir * (a.totalHours - b.totalHours);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "period":
        default:
          return dir * a.periodStart.localeCompare(b.periodStart);
      }
    });

  const filteredLeave = leaveRequests
    .filter((r) => {
      if (leaveFilter !== "all" && r.status !== leaveFilter) return false;
      if (debouncedLeaveSearch) {
        const q = debouncedLeaveSearch.toLowerCase();
        return (
          r.employee?.name.toLowerCase().includes(q) ||
          r.policy?.name.toLowerCase().includes(q) ||
          r.startDate.includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dir = leaveSortOrder === "asc" ? 1 : -1;
      switch (leaveSortBy) {
        case "employee":
          return dir * (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "");
        case "hours":
          return dir * (a.hours - b.hours);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "date":
        default:
          return dir * a.startDate.localeCompare(b.startDate);
      }
    });

  /* ---- actions ---- */
  async function handleCreateTs(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !newTs.employeeId) return;
    setSavingTs(true);
    try {
      const res = await fetch("/api/v1/payroll/timesheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify(newTs),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Timesheet created");
        setTsDrawerOpen(false);
        setNewTs({ employeeId: "", periodStart: "", periodEnd: "" });
        router.push(`/payroll/timesheets/${data.timesheet.id}`);
      }
    } catch {
      toast.error("Failed to create timesheet");
    } finally {
      setSavingTs(false);
    }
  }

  async function handleCreateLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !leaveForm.employeeId || !leaveForm.policyId) return;
    setSavingLeave(true);
    try {
      const res = await fetch("/api/v1/payroll/leave/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          ...leaveForm,
          hours: parseFloat(leaveForm.hours || "0"),
        }),
      });
      if (res.ok) {
        toast.success("Leave request created");
        setLeaveDrawerOpen(false);
        setLeaveForm({
          employeeId: "",
          policyId: "",
          startDate: "",
          endDate: "",
          hours: "",
          reason: "",
        });
        fetchData();
      }
    } catch {
      toast.error("Failed to create leave request");
    } finally {
      setSavingLeave(false);
    }
  }

  async function handleApprove(id: string) {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/leave/requests/${id}/approve`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Request approved");
      fetchData();
    }
  }

  async function handleReject(id: string) {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/leave/requests/${id}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-organization-id": orgId,
      },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast.success("Request rejected");
      fetchData();
    }
  }

  /* ---- loading ---- */
  if (loading) return <BrandLoader />;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <ContentReveal className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Time & Leave"
        description="Track hours and manage leave requests."
      >
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setTsDrawerOpen(true)}
        >
          <Plus className="size-3" />
          New Timesheet
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setLeaveDrawerOpen(true)}
        >
          <Plus className="size-3" />
          New Request
        </Button>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Clock,
            label: "Active Timesheets",
            value: activeTimesheets,
          },
          {
            icon: ClipboardCheck,
            label: "Pending Approvals",
            value: pendingApprovals,
          },
          {
            icon: CheckCircle2,
            label: "Approved This Month",
            value: approvedThisMonth,
          },
          {
            icon: Timer,
            label: "Leave Hours Used",
            value: `${leaveHoursUsed}h`,
            highlight: true,
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            {...anim(i * 0.05)}
            className="rounded-xl border bg-card p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <card.icon className="size-4" />
              <span className="text-[11px] font-medium uppercase tracking-wide">
                {card.label}
              </span>
            </div>
            <p
              className={cn(
                "mt-2 text-2xl font-bold font-mono tabular-nums truncate",
                card.highlight &&
                  "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ============================================================ */}
      {/*  Two-column grid: Timesheets + Leave side by side             */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* ---- Timesheets Column ---- */}
        <motion.div {...anim(0.2)} className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Timesheets</h3>
            <span className="text-xs text-muted-foreground">{filteredTs.length} entries</span>
          </div>

          {/* Filters */}
          <div className="space-y-2 mb-3">
            <Tabs
              value={tsFilter}
              onValueChange={(v) => setTsFilter(v as TsFilter)}
            >
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
                <TabsTrigger value="draft" className="text-xs h-7">Draft</TabsTrigger>
                <TabsTrigger value="submitted" className="text-xs h-7">Submitted</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs h-7">Approved</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs h-7">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employee..."
                  value={tsSearch}
                  onChange={(e) => setTsSearch(e.target.value)}
                  className="pl-8 pr-7 h-7 text-xs"
                />
                {tsSearch && (
                  <button
                    onClick={() => setTsSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <Select value={tsSortBy} onValueChange={(v) => setTsSortBy(v as TsSortKey)}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <ArrowUpDown className="size-2.5 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TS_SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setTsSortOrder((p) => (p === "asc" ? "desc" : "asc"))}
              >
                <ArrowUpDown className={cn("size-3 transition-transform", tsSortOrder === "asc" && "rotate-180")} />
              </Button>
            </div>
          </div>

          {/* List */}
          {pendingTsSearch ? (
            <div className="flex items-center justify-center py-12">
              <div className="brand-loader" aria-label="Loading">
                <div className="brand-loader-circle brand-loader-circle-1" />
                <div className="brand-loader-circle brand-loader-circle-2" />
              </div>
            </div>
          ) : filteredTs.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                <Clock className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No timesheets found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {tsSearch ? "Try a different search" : "Create a timesheet to start tracking hours"}
              </p>
            </div>
          ) : (
            <MotionConfig reducedMotion="never">
              <motion.div
                key={tsFetchKey}
                initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: "opacity, transform, filter" }}
                className="rounded-xl border bg-card divide-y max-h-[480px] overflow-y-auto"
              >
                {filteredTs.map((ts) => (
                  <button
                    key={ts.id}
                    onClick={() =>
                      router.push(`/payroll/timesheets/${ts.id}`)
                    }
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Clock className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {ts.employee?.name || "-"}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {ts.periodStart} to {ts.periodEnd}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono tabular-nums">
                        {ts.totalHours}h
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          tsStatusColors[ts.status] || "",
                        )}
                      >
                        {ts.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </motion.div>
            </MotionConfig>
          )}
        </motion.div>

        {/* ---- Leave Requests Column ---- */}
        <motion.div {...anim(0.25)} className="flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Leave Requests</h3>
            <span className="text-xs text-muted-foreground">{filteredLeave.length} requests</span>
          </div>

          {/* Filters */}
          <div className="space-y-2 mb-3">
            <Tabs
              value={leaveFilter}
              onValueChange={(v) => setLeaveFilter(v as LeaveFilter)}
            >
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="all" className="text-xs h-7">All</TabsTrigger>
                <TabsTrigger value="pending" className="text-xs h-7">Pending</TabsTrigger>
                <TabsTrigger value="approved" className="text-xs h-7">Approved</TabsTrigger>
                <TabsTrigger value="rejected" className="text-xs h-7">Rejected</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employee or policy..."
                  value={leaveSearch}
                  onChange={(e) => setLeaveSearch(e.target.value)}
                  className="pl-8 pr-7 h-7 text-xs"
                />
                {leaveSearch && (
                  <button
                    onClick={() => setLeaveSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              <Select value={leaveSortBy} onValueChange={(v) => setLeaveSortBy(v as LeaveSortKey)}>
                <SelectTrigger className="h-7 w-[110px] text-xs">
                  <ArrowUpDown className="size-2.5 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setLeaveSortOrder((p) => (p === "asc" ? "desc" : "asc"))}
              >
                <ArrowUpDown className={cn("size-3 transition-transform", leaveSortOrder === "asc" && "rotate-180")} />
              </Button>
            </div>
          </div>

          {/* List */}
          {pendingLeaveSearch ? (
            <div className="flex items-center justify-center py-12">
              <div className="brand-loader" aria-label="Loading">
                <div className="brand-loader-circle brand-loader-circle-1" />
                <div className="brand-loader-circle brand-loader-circle-2" />
              </div>
            </div>
          ) : filteredLeave.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed">
              <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                <CalendarDays className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No leave requests found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {leaveSearch ? "Try a different search" : "Submit a leave request to get started"}
              </p>
            </div>
          ) : (
            <MotionConfig reducedMotion="never">
              <motion.div
                key={leaveFetchKey}
                initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
                style={{ willChange: "opacity, transform, filter" }}
                className="rounded-xl border bg-card divide-y max-h-[480px] overflow-y-auto"
              >
                {filteredLeave.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.employee?.name || "-"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.policy?.name || "-"} · {r.startDate} to{" "}
                        {r.endDate} · {r.hours}h
                      </p>
                      {r.reason && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                          {r.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          leaveStatusColors[r.status] || "",
                        )}
                      >
                        {r.status}
                      </Badge>
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleApprove(r.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 text-red-600"
                            onClick={() => handleReject(r.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </motion.div>
            </MotionConfig>
          )}
        </motion.div>
      </div>

      {/* ============================================================ */}
      {/*  New Timesheet Drawer                                         */}
      {/* ============================================================ */}
      <Sheet open={tsDrawerOpen} onOpenChange={setTsDrawerOpen}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <Clock className="size-5" />
              </div>
              <div>
                <SheetTitle>New Timesheet</SheetTitle>
                <SheetDescription>
                  Create a timesheet to track employee hours.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={handleCreateTs} className="flex flex-col flex-1">
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Employee</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={newTs.employeeId}
                  onChange={(e) =>
                    setNewTs({ ...newTs, employeeId: e.target.value })
                  }
                >
                  <option value="">Select employee...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={newTs.periodStart}
                  onChange={(e) =>
                    setNewTs({ ...newTs, periodStart: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={newTs.periodEnd}
                  onChange={(e) =>
                    setNewTs({ ...newTs, periodEnd: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTsDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingTs}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {savingTs ? "Creating..." : "Create Timesheet"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* ============================================================ */}
      {/*  New Leave Request Drawer                                     */}
      {/* ============================================================ */}
      <Sheet open={leaveDrawerOpen} onOpenChange={setLeaveDrawerOpen}>
        <SheetContent className="sm:max-w-lg w-full p-0 flex flex-col">
          <SheetHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CalendarDays className="size-5" />
              </div>
              <div>
                <SheetTitle>New Leave Request</SheetTitle>
                <SheetDescription>
                  Submit a leave request for an employee.
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          <form onSubmit={handleCreateLeave} className="flex flex-col flex-1">
            <div className="flex-1 overflow-y-auto space-y-6 px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-2">
                <Label>Employee</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={leaveForm.employeeId}
                  onChange={(e) =>
                    setLeaveForm({
                      ...leaveForm,
                      employeeId: e.target.value,
                    })
                  }
                >
                  <option value="">Select employee...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Policy</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={leaveForm.policyId}
                  onChange={(e) =>
                    setLeaveForm({
                      ...leaveForm,
                      policyId: e.target.value,
                    })
                  }
                >
                  <option value="">Select policy...</option>
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={leaveForm.startDate}
                  onChange={(e) =>
                    setLeaveForm({
                      ...leaveForm,
                      startDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={leaveForm.endDate}
                  onChange={(e) =>
                    setLeaveForm({
                      ...leaveForm,
                      endDate: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={leaveForm.hours}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, hours: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input
                  value={leaveForm.reason}
                  onChange={(e) =>
                    setLeaveForm({ ...leaveForm, reason: e.target.value })
                  }
                  placeholder="Optional reason..."
                />
              </div>
            </div>
            <div className="border-t px-4 py-3 sm:px-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLeaveDrawerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingLeave}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {savingLeave ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </ContentReveal>
  );
}
