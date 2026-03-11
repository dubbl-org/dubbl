"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, MotionConfig } from "motion/react";
import { toast } from "sonner";
import { Clock, Plus, Search, X } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ContentReveal } from "@/components/ui/content-reveal";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface Timesheet {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
  employee: { name: string; employeeNumber: string } | null;
}

type StatusFilter = "all" | "draft" | "submitted" | "approved" | "rejected";

const statusColors: Record<string, string> = {
  draft: "",
  submitted: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

export default function TimesheetsPage() {
  const router = useRouter();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTs, setNewTs] = useState({ employeeId: "", periodStart: "", periodEnd: "" });
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/timesheets", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/employees", { headers }).then((r) => r.json()),
    ])
      .then(([tsData, empData]) => {
        if (tsData.data) setTimesheets(tsData.data);
        if (empData.data) setEmployees(empData.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = timesheets.filter((ts) => {
    if (statusFilter !== "all" && ts.status !== statusFilter) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return ts.employee?.name.toLowerCase().includes(q) || ts.periodStart.includes(q);
    }
    return true;
  });

  async function handleCreate() {
    if (!orgId || !newTs.employeeId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/payroll/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify(newTs),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Timesheet created");
        setDialogOpen(false);
        router.push(`/payroll/timesheets/${data.timesheet.id}`);
      }
    } catch {
      toast.error("Failed to create timesheet");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <PageHeader title="Timesheets" description="Track and manage employee work hours." />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="submitted">Submitted</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3" />
            New Timesheet
          </Button>
        </div>

        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <Clock className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No timesheets found</p>
          <p className="text-xs text-muted-foreground mt-1">Create a timesheet to start tracking hours</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {filtered.map((ts) => (
            <button
              key={ts.id}
              onClick={() => router.push(`/payroll/timesheets/${ts.id}`)}
              className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Clock className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ts.employee?.name || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">{ts.periodStart} to {ts.periodEnd}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-mono tabular-nums">{ts.totalHours}h</span>
                <Badge variant="outline" className={cn("text-[11px]", statusColors[ts.status] || "")}>
                  {ts.status}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Timesheet</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={newTs.employeeId}
                onChange={(e) => setNewTs({ ...newTs, employeeId: e.target.value })}
              >
                <option value="">Select employee...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Period Start</Label>
                <Input type="date" value={newTs.periodStart} onChange={(e) => setNewTs({ ...newTs, periodStart: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Period End</Label>
                <Input type="date" value={newTs.periodEnd} onChange={(e) => setNewTs({ ...newTs, periodEnd: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
