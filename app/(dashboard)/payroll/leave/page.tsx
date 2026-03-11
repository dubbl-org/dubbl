"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Plus, Search } from "lucide-react";
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

type StatusFilter = "all" | "pending" | "approved" | "rejected";

const statusColors: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
  cancelled: "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

export default function LeavePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [policies, setPolicies] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({ employeeId: "", policyId: "", startDate: "", endDate: "", hours: "", reason: "" });

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchData = useCallback(() => {
    if (!orgId) return;
    const headers = { "x-organization-id": orgId };

    Promise.all([
      fetch("/api/v1/payroll/leave/requests", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/employees", { headers }).then((r) => r.json()),
      fetch("/api/v1/payroll/leave/policies", { headers }).then((r) => r.json()),
    ])
      .then(([reqData, empData, polData]) => {
        if (reqData.data) setRequests(reqData.data);
        if (empData.data) setEmployees(empData.data.map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
        if (polData.data) setPolicies(polData.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = requests.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return r.employee?.name.toLowerCase().includes(q) || false;
    }
    return true;
  });

  async function handleCreate() {
    if (!orgId || !form.employeeId || !form.policyId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/payroll/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({
          ...form,
          hours: parseFloat(form.hours || "0"),
        }),
      });
      if (res.ok) {
        toast.success("Leave request created");
        setDialogOpen(false);
        fetchData();
      }
    } catch {
      toast.error("Failed to create request");
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove(id: string) {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/leave/requests/${id}/approve`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) { toast.success("Request approved"); fetchData(); }
  }

  async function handleReject(id: string) {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/leave/requests/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({}),
    });
    if (res.ok) { toast.success("Request rejected"); fetchData(); }
  }

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <PageHeader title="Leave Management" description="Manage leave requests and PTO balances." />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-3" /> New Request
          </Button>
        </div>

        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by employee..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-muted mb-3">
            <CalendarDays className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No leave requests found</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y">
          {filtered.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.employee?.name || "Unknown"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.policy?.name || "-"} · {r.startDate} to {r.endDate} · {r.hours}h
                </p>
                {r.reason && <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={cn("text-[10px]", statusColors[r.status] || "")}>
                  {r.status}
                </Badge>
                {r.status === "pending" && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleApprove(r.id)}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleReject(r.id)}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">Select...</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Policy</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.policyId} onChange={(e) => setForm({ ...form, policyId: e.target.value })}>
                <option value="">Select...</option>
                {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? "Creating..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentReveal>
  );
}
