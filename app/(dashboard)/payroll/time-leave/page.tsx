"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  Clock,
  CalendarDays,
  Plus,
  Search,
  ClipboardCheck,
  CheckCircle2,
  Timer,
  X,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTopbarAction } from "@/components/dashboard/topbar";
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
import { useConfirm } from "@/lib/hooks/use-confirm";
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
/*  Motion helpers                                                     */
/* ------------------------------------------------------------------ */

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 50;

type View = "timesheets" | "leave";
type TsFilter = "all" | "draft" | "submitted" | "approved" | "rejected";
type LeaveFilter = "all" | "pending" | "approved" | "rejected";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TimeLeavePage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const orgId =
    typeof window !== "undefined"
      ? localStorage.getItem("activeOrgId")
      : null;

  /* ---- view ---- */
  const [view, setView] = useState<View>("timesheets");
  const swipeDirRef = useRef(1);

  /* ---- timesheet state ---- */
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [tsPage, setTsPage] = useState(1);
  const [tsTotalCount, setTsTotalCount] = useState(0);
  const [tsLoadingMore, setTsLoadingMore] = useState(false);
  const [tsRefetching, setTsRefetching] = useState(false);
  const [tsInitialLoad, setTsInitialLoad] = useState(true);
  const [tsFetchKey, setTsFetchKey] = useState(0);
  const [tsFilter, setTsFilter] = useState<TsFilter>("all");
  const [tsSortBy, setTsSortBy] = useState("period");
  const [tsSortOrder, setTsSortOrder] = useState<"asc" | "desc">("desc");
  const [tsSearch, setTsSearch] = useState("");
  const debouncedTsSearch = useDebounce(tsSearch);
  const pendingTsSearch = tsSearch !== debouncedTsSearch;
  const [tsSearchKey, setTsSearchKey] = useState(0);
  const tsSentinelRef = useRef<HTMLDivElement>(null);
  const tsHasMore = timesheets.length < tsTotalCount;

  /* ---- leave state ---- */
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leavePage, setLeavePage] = useState(1);
  const [leaveTotalCount, setLeaveTotalCount] = useState(0);
  const [leaveLoadingMore, setLeaveLoadingMore] = useState(false);
  const [leaveRefetching, setLeaveRefetching] = useState(false);
  const [leaveInitialLoad, setLeaveInitialLoad] = useState(true);
  const [leaveFetchKey, setLeaveFetchKey] = useState(0);
  const [leaveFilter, setLeaveFilter] = useState<LeaveFilter>("all");
  const [leaveSortBy, setLeaveSortBy] = useState("date");
  const [leaveSortOrder, setLeaveSortOrder] = useState<"asc" | "desc">("desc");
  const [leaveSearch, setLeaveSearch] = useState("");
  const debouncedLeaveSearch = useDebounce(leaveSearch);
  const pendingLeaveSearch = leaveSearch !== debouncedLeaveSearch;
  const [leaveSearchKey, setLeaveSearchKey] = useState(0);
  const leaveSentinelRef = useRef<HTMLDivElement>(null);
  const leaveHasMore = leaveRequests.length < leaveTotalCount;

  /* ---- shared data ---- */
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);

  /* ---- header action ---- */
  useTopbarAction(
    useMemo(
      (): ReactNode =>
        view === "timesheets" ? (
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setTsDrawerOpen(true)}
          >
            <Plus className="size-3" /> New Timesheet
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setLeaveDrawerOpen(true)}
          >
            <Plus className="size-3" /> New Request
          </Button>
        ),
      [view]
    )
  );

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

  /* ---------------------------------------------------------------- */
  /*  Build params                                                     */
  /* ---------------------------------------------------------------- */

  const buildTsParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (tsFilter !== "all") params.set("status", tsFilter);
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      return params;
    },
    [tsFilter],
  );

  const buildLeaveParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (leaveFilter !== "all") params.set("status", leaveFilter);
      params.set("page", String(p));
      params.set("limit", String(PAGE_SIZE));
      return params;
    },
    [leaveFilter],
  );

  /* ---------------------------------------------------------------- */
  /*  Fetch first page - timesheets                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setTsRefetching(true);
    setTsPage(1);

    fetch(`/api/v1/payroll/timesheets?${buildTsParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTimesheets(data.data || []);
        setTsTotalCount(data.pagination?.total || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setTsInitialLoad(false);
          setTsRefetching(false);
          setTsFetchKey((k) => k + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, buildTsParams]);

  /* ---------------------------------------------------------------- */
  /*  Fetch first page - leave                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLeaveRefetching(true);
    setLeavePage(1);

    fetch(`/api/v1/payroll/leave/requests?${buildLeaveParams(1)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLeaveRequests(data.data || []);
        setLeaveTotalCount(data.pagination?.total || 0);
      })
      .finally(() => {
        if (!cancelled) {
          setLeaveInitialLoad(false);
          setLeaveRefetching(false);
          setLeaveFetchKey((k) => k + 1);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, buildLeaveParams]);

  /* ---------------------------------------------------------------- */
  /*  Fetch employees + policies (independent of filters)              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    fetch("/api/v1/payroll/employees", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.data)
          setEmployees(
            data.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })),
          );
      });

    fetch("/api/v1/payroll/leave/policies", { headers })
      .then((r) => r.json())
      .then((data) => {
        if (data.data)
          setPolicies(
            data.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
          );
      });
  }, [orgId]);

  /* ---------------------------------------------------------------- */
  /*  Load more - timesheets                                           */
  /* ---------------------------------------------------------------- */

  const loadMoreTs = useCallback(() => {
    if (!orgId || tsLoadingMore) return;
    const nextPage = tsPage + 1;
    setTsLoadingMore(true);

    fetch(`/api/v1/payroll/timesheets?${buildTsParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setTimesheets((prev) => [...prev, ...data.data]);
          setTsPage(nextPage);
        }
      })
      .finally(() => setTsLoadingMore(false));
  }, [orgId, tsPage, buildTsParams, tsLoadingMore]);

  /* ---------------------------------------------------------------- */
  /*  Load more - leave                                                */
  /* ---------------------------------------------------------------- */

  const loadMoreLeave = useCallback(() => {
    if (!orgId || leaveLoadingMore) return;
    const nextPage = leavePage + 1;
    setLeaveLoadingMore(true);

    fetch(`/api/v1/payroll/leave/requests?${buildLeaveParams(nextPage)}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setLeaveRequests((prev) => [...prev, ...data.data]);
          setLeavePage(nextPage);
        }
      })
      .finally(() => setLeaveLoadingMore(false));
  }, [orgId, leavePage, buildLeaveParams, leaveLoadingMore]);

  /* ---------------------------------------------------------------- */
  /*  IntersectionObserver - timesheets                                */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const el = tsSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !tsRefetching) loadMoreTs();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreTs, tsRefetching]);

  /* ---------------------------------------------------------------- */
  /*  IntersectionObserver - leave                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const el = leaveSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !leaveRefetching) loadMoreLeave();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreLeave, leaveRefetching]);

  /* ---------------------------------------------------------------- */
  /*  Search key bumps                                                 */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    setTsSearchKey((k) => k + 1);
  }, [debouncedTsSearch]);

  useEffect(() => {
    setLeaveSearchKey((k) => k + 1);
  }, [debouncedLeaveSearch]);

  /* ---------------------------------------------------------------- */
  /*  Client-side search filtering                                     */
  /* ---------------------------------------------------------------- */

  const filteredTs = useMemo(() => {
    if (!debouncedTsSearch) return timesheets;
    const q = debouncedTsSearch.toLowerCase();
    return timesheets.filter(
      (ts) =>
        ts.employee?.name.toLowerCase().includes(q) ||
        ts.periodStart.includes(q) ||
        ts.periodEnd.includes(q),
    );
  }, [timesheets, debouncedTsSearch]);

  const filteredLeave = useMemo(() => {
    if (!debouncedLeaveSearch) return leaveRequests;
    const q = debouncedLeaveSearch.toLowerCase();
    return leaveRequests.filter(
      (r) =>
        r.employee?.name.toLowerCase().includes(q) ||
        r.policy?.name.toLowerCase().includes(q) ||
        r.startDate.includes(q),
    );
  }, [leaveRequests, debouncedLeaveSearch]);

  /* ---------------------------------------------------------------- */
  /*  Client-side sorting                                              */
  /* ---------------------------------------------------------------- */

  const sortedTs = useMemo(() => {
    const [key, order] = [tsSortBy, tsSortOrder];
    const dir = order === "asc" ? 1 : -1;
    return [...filteredTs].sort((a, b) => {
      switch (key) {
        case "employee":
          return (
            dir *
            (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "")
          );
        case "hours":
          return dir * (a.totalHours - b.totalHours);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "period":
        default:
          return dir * a.periodStart.localeCompare(b.periodStart);
      }
    });
  }, [filteredTs, tsSortBy, tsSortOrder]);

  const sortedLeave = useMemo(() => {
    const [key, order] = [leaveSortBy, leaveSortOrder];
    const dir = order === "asc" ? 1 : -1;
    return [...filteredLeave].sort((a, b) => {
      switch (key) {
        case "employee":
          return (
            dir *
            (a.employee?.name ?? "").localeCompare(b.employee?.name ?? "")
          );
        case "hours":
          return dir * (a.hours - b.hours);
        case "status":
          return dir * a.status.localeCompare(b.status);
        case "date":
        default:
          return dir * a.startDate.localeCompare(b.startDate);
      }
    });
  }, [filteredLeave, leaveSortBy, leaveSortOrder]);

  /* ---------------------------------------------------------------- */
  /*  Derived stats (from both datasets)                               */
  /* ---------------------------------------------------------------- */

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

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

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
        // Trigger refetch for leave
        setLeaveRefetching(true);
        setLeavePage(1);
        fetch(`/api/v1/payroll/leave/requests?${buildLeaveParams(1)}`, {
          headers: { "x-organization-id": orgId },
        })
          .then((r) => r.json())
          .then((data) => {
            setLeaveRequests(data.data || []);
            setLeaveTotalCount(data.pagination?.total || 0);
          })
          .finally(() => {
            setLeaveRefetching(false);
            setLeaveFetchKey((k) => k + 1);
          });
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
      // Refetch leave
      setLeaveRefetching(true);
      setLeavePage(1);
      fetch(`/api/v1/payroll/leave/requests?${buildLeaveParams(1)}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          setLeaveRequests(data.data || []);
          setLeaveTotalCount(data.pagination?.total || 0);
        })
        .finally(() => {
          setLeaveRefetching(false);
          setLeaveFetchKey((k) => k + 1);
        });
    }
  }

  async function handleReject(id: string) {
    if (!orgId) return;
    const confirmed = await confirm({
      title: "Reject leave request?",
      description: "The employee will be notified of the rejection.",
      confirmLabel: "Reject",
      destructive: true,
    });
    if (!confirmed) return;
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
      // Refetch leave
      setLeaveRefetching(true);
      setLeavePage(1);
      fetch(`/api/v1/payroll/leave/requests?${buildLeaveParams(1)}`, {
        headers: { "x-organization-id": orgId },
      })
        .then((r) => r.json())
        .then((data) => {
          setLeaveRequests(data.data || []);
          setLeaveTotalCount(data.pagination?.total || 0);
        })
        .finally(() => {
          setLeaveRefetching(false);
          setLeaveFetchKey((k) => k + 1);
        });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Initial load                                                     */
  /* ---------------------------------------------------------------- */

  if (tsInitialLoad && leaveInitialLoad) return <BrandLoader />;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <ContentReveal className="space-y-6">
      {/* Stat cards - always visible */}
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
                card.highlight && "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {card.value}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="h-px bg-border" />

      {/* View tabs */}
      <div className="space-y-4">
        <div className="inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-[3px]">
          {([
            { value: "timesheets" as const, icon: Clock, label: "Timesheets" },
            { value: "leave" as const, icon: CalendarDays, label: "Leave Requests" },
          ]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                swipeDirRef.current = tab.value === "leave" ? 1 : -1;
                setView(tab.value);
              }}
              className={cn(
                "relative inline-flex h-[calc(100%-1px)] items-center gap-1.5 rounded-md px-5 text-sm font-medium whitespace-nowrap transition-colors",
                view === tab.value
                  ? "text-foreground"
                  : "text-foreground/60 hover:text-foreground"
              )}
            >
              {view === tab.value && (
                <motion.div
                  layoutId="view-tab-bg"
                  className="absolute inset-0 rounded-md bg-background shadow-sm dark:border dark:border-input dark:bg-input/30"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <tab.icon className="size-3.5" />
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden">
        <AnimatePresence mode="wait" custom={swipeDirRef.current}>
        {/* ============================================================ */}
        {/*  Timesheets View                                              */}
        {/* ============================================================ */}
        {view === "timesheets" && (
          <motion.div
            key="timesheets"
            custom={swipeDirRef.current}
            initial="enter"
            animate="center"
            exit="exit"
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 60, filter: "blur(6px)" }),
              center: { opacity: 1, x: 0, filter: "blur(0px)" },
              exit: (d: number) => ({ opacity: 0, x: d * -60, filter: "blur(6px)" }),
            }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-4"
          >
            {/* Status filter tabs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs
                value={tsFilter}
                onValueChange={(v) => setTsFilter(v as TsFilter)}
              >
                <TabsList className="overflow-x-auto">
                  <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
                  <TabsTrigger value="draft" className="whitespace-nowrap">Draft</TabsTrigger>
                  <TabsTrigger value="submitted" className="whitespace-nowrap">Submitted</TabsTrigger>
                  <TabsTrigger value="approved" className="whitespace-nowrap">Approved</TabsTrigger>
                  <TabsTrigger value="rejected" className="whitespace-nowrap">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setTsDrawerOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                New Timesheet
              </Button>
            </div>

            {/* Search + sort */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employee..."
                  value={tsSearch}
                  onChange={(e) => setTsSearch(e.target.value)}
                  className="h-8 w-56 pl-8 pr-7 text-xs"
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

              <Select
                value={`${tsSortBy}:${tsSortOrder}`}
                onValueChange={(v) => {
                  const [key, order] = v.split(":");
                  setTsSortBy(key);
                  setTsSortOrder(order as "asc" | "desc");
                }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period:desc">Newest period</SelectItem>
                  <SelectItem value="period:asc">Oldest period</SelectItem>
                  <SelectItem value="employee:asc">Employee A-Z</SelectItem>
                  <SelectItem value="employee:desc">Employee Z-A</SelectItem>
                  <SelectItem value="hours:desc">Most hours</SelectItem>
                  <SelectItem value="hours:asc">Fewest hours</SelectItem>
                  <SelectItem value="status:asc">Status A-Z</SelectItem>
                  <SelectItem value="status:desc">Status Z-A</SelectItem>
                </SelectContent>
              </Select>

              {tsSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setTsSearch("")}
                >
                  <X className="mr-1 size-3" />
                  Clear
                </Button>
              )}
            </div>

            {/* Data */}
            {tsRefetching || pendingTsSearch ? (
              <BrandLoader className="h-48" />
            ) : sortedTs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed">
                <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                  <Clock className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No timesheets found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tsSearch
                    ? "Try a different search"
                    : "Create a timesheet to start tracking hours"}
                </p>
              </div>
            ) : (
              <ContentReveal key={`ts-${tsFetchKey}-${tsSearchKey}`}>
                <div className="rounded-xl border bg-card divide-y">
                  {sortedTs.map((ts) => (
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
                </div>
              </ContentReveal>
            )}

            {/* Infinite scroll sentinel & count */}
            {!tsRefetching && !pendingTsSearch && sortedTs.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    Showing {timesheets.length} of {tsTotalCount} timesheet
                    {tsTotalCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {tsHasMore && (
                  <div ref={tsSentinelRef} className="flex justify-center py-4">
                    {tsLoadingMore && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ============================================================ */}
        {/*  Leave Requests View                                          */}
        {/* ============================================================ */}
        {view === "leave" && (
          <motion.div
            key="leave"
            custom={swipeDirRef.current}
            initial="enter"
            animate="center"
            exit="exit"
            variants={{
              enter: (d: number) => ({ opacity: 0, x: d * 60, filter: "blur(6px)" }),
              center: { opacity: 1, x: 0, filter: "blur(0px)" },
              exit: (d: number) => ({ opacity: 0, x: d * -60, filter: "blur(6px)" }),
            }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-4"
          >
            {/* Status filter tabs */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Tabs
                value={leaveFilter}
                onValueChange={(v) => setLeaveFilter(v as LeaveFilter)}
              >
                <TabsList className="overflow-x-auto">
                  <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
                  <TabsTrigger value="pending" className="whitespace-nowrap">Pending</TabsTrigger>
                  <TabsTrigger value="approved" className="whitespace-nowrap">Approved</TabsTrigger>
                  <TabsTrigger value="rejected" className="whitespace-nowrap">Rejected</TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setLeaveDrawerOpen(true)}
              >
                <Plus className="mr-2 size-4" />
                New Request
              </Button>
            </div>

            {/* Search + sort */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employee or policy..."
                  value={leaveSearch}
                  onChange={(e) => setLeaveSearch(e.target.value)}
                  className="h-8 w-56 pl-8 pr-7 text-xs"
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

              <Select
                value={`${leaveSortBy}:${leaveSortOrder}`}
                onValueChange={(v) => {
                  const [key, order] = v.split(":");
                  setLeaveSortBy(key);
                  setLeaveSortOrder(order as "asc" | "desc");
                }}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date:desc">Newest first</SelectItem>
                  <SelectItem value="date:asc">Oldest first</SelectItem>
                  <SelectItem value="employee:asc">Employee A-Z</SelectItem>
                  <SelectItem value="employee:desc">Employee Z-A</SelectItem>
                  <SelectItem value="hours:desc">Most hours</SelectItem>
                  <SelectItem value="hours:asc">Fewest hours</SelectItem>
                  <SelectItem value="status:asc">Status A-Z</SelectItem>
                  <SelectItem value="status:desc">Status Z-A</SelectItem>
                </SelectContent>
              </Select>

              {leaveSearch && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground"
                  onClick={() => setLeaveSearch("")}
                >
                  <X className="mr-1 size-3" />
                  Clear
                </Button>
              )}
            </div>

            {/* Data */}
            {leaveRefetching || pendingLeaveSearch ? (
              <BrandLoader className="h-48" />
            ) : sortedLeave.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed">
                <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
                  <CalendarDays className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No leave requests found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {leaveSearch
                    ? "Try a different search"
                    : "Submit a leave request to get started"}
                </p>
              </div>
            ) : (
              <ContentReveal key={`leave-${leaveFetchKey}-${leaveSearchKey}`}>
                <div className="rounded-xl border bg-card divide-y">
                  {sortedLeave.map((r) => (
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
                </div>
              </ContentReveal>
            )}

            {/* Infinite scroll sentinel & count */}
            {!leaveRefetching && !pendingLeaveSearch && sortedLeave.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    Showing {leaveRequests.length} of {leaveTotalCount} request
                    {leaveTotalCount !== 1 ? "s" : ""}
                  </p>
                </div>
                {leaveHasMore && (
                  <div
                    ref={leaveSentinelRef}
                    className="flex justify-center py-4"
                  >
                    {leaveLoadingMore && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
        </AnimatePresence>
        </div>
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

      {confirmDialog}
    </ContentReveal>
  );
}
