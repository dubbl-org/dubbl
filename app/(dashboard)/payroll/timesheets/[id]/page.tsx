"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Plus, Clock, Send, CheckCircle, XCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useConfirm } from "@/lib/hooks/use-confirm";
import { cn } from "@/lib/utils";

interface TimesheetDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: number;
  rejectionReason: string | null;
  employee: { name: string; employeeNumber: string } | null;
  entries: TimesheetEntry[];
}

interface TimesheetEntry {
  id: string;
  date: string;
  hours: number;
  shiftType: string;
  description: string | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const anim = (delay: number) => ({
  initial: { opacity: 0, y: 12 } as const,
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.3, delay } as const,
});

export default function TimesheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ts, setTs] = useState<TimesheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // New entry form
  const [newDate, setNewDate] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newShiftType, setNewShiftType] = useState("regular");
  const [newDesc, setNewDesc] = useState("");

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  function fetchTimesheet() {
    if (!orgId) return;
    fetch(`/api/v1/payroll/timesheets/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => { if (data.timesheet) setTs(data.timesheet); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchTimesheet(); }, [id, orgId]);

  async function handleAddEntry() {
    if (!orgId || !newDate || !newHours) return;
    const res = await fetch(`/api/v1/payroll/timesheets/${id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({
        date: newDate,
        hours: parseFloat(newHours),
        shiftType: newShiftType,
        description: newDesc || undefined,
      }),
    });
    if (res.ok) {
      toast.success("Entry added");
      setNewDate(""); setNewHours(""); setNewDesc("");
      fetchTimesheet();
    } else {
      toast.error("Failed to add entry");
    }
  }

  async function handleDeleteEntry(entryId: string) {
    if (!orgId) return;
    await fetch(`/api/v1/payroll/timesheets/${id}/entries?entryId=${entryId}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    fetchTimesheet();
  }

  async function handleSubmit() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/timesheets/${id}/submit`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Timesheet submitted");
      fetchTimesheet();
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to submit");
    }
  }

  async function handleApprove() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/timesheets/${id}/approve`, {
      method: "POST",
      headers: { "x-organization-id": orgId },
    });
    if (res.ok) {
      toast.success("Timesheet approved");
      fetchTimesheet();
    }
  }

  async function handleReject() {
    if (!orgId) return;
    const res = await fetch(`/api/v1/payroll/timesheets/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-organization-id": orgId },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      toast.success("Timesheet rejected");
      fetchTimesheet();
    }
  }

  if (loading) return <BrandLoader />;

  if (!ts) {
    return (
      <ContentReveal>
        <button onClick={() => router.push("/payroll/timesheets")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="size-3.5" /> Back to timesheets
        </button>
        <p className="text-sm text-muted-foreground">Timesheet not found</p>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-6">
      <button onClick={() => router.push("/payroll/timesheets")} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to timesheets
      </button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <Clock className="size-5 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">{ts.employee?.name || "Unknown"}</h1>
              <Badge variant="outline" className={statusColors[ts.status] || ""}>{ts.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{ts.periodStart} to {ts.periodEnd} · {ts.totalHours}h total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ts.status === "draft" && (
            <Button size="sm" onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">
              <Send className="mr-1.5 size-3.5" /> Submit
            </Button>
          )}
          {ts.status === "submitted" && (
            <>
              <Button size="sm" onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="mr-1.5 size-3.5" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReject}>
                <XCircle className="mr-1.5 size-3.5" /> Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {ts.rejectionReason && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-4 py-3">
          <p className="text-sm text-red-600 dark:text-red-400">Rejected: {ts.rejectionReason}</p>
        </div>
      )}

      {/* Entries */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Time Entries ({ts.entries?.length || 0})</h3>

        {ts.status === "draft" && (
          <motion.div {...anim(0)} className="rounded-lg border p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hours</Label>
                <Input type="number" step="0.25" value={newHours} onChange={(e) => setNewHours(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={newShiftType} onValueChange={setNewShiftType}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="overtime">Overtime</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                    <SelectItem value="weekend">Weekend</SelectItem>
                    <SelectItem value="holiday">Holiday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="h-8 text-sm" placeholder="Optional" />
              </div>
            </div>
            <Button size="sm" onClick={handleAddEntry} disabled={!newDate || !newHours}>
              <Plus className="mr-1.5 size-3" /> Add Entry
            </Button>
          </motion.div>
        )}

        {(ts.entries || []).length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No entries yet</div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {(ts.entries || []).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium">{entry.date}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[10px]">{entry.shiftType}</Badge>
                    {entry.description && <span className="text-xs text-muted-foreground">{entry.description}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono tabular-nums">{entry.hours}h</span>
                  {ts.status === "draft" && (
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => handleDeleteEntry(entry.id)}>
                      <Trash2 className="size-3.5 text-muted-foreground" />
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
