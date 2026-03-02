"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Clock } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

interface TimeEntry {
  id: string;
  date: string;
  description: string | null;
  minutes: number;
  isBillable: boolean;
  hourlyRate: number;
  invoiceId: string | null;
  user: { name: string | null } | null;
}

function formatHours(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

const columns: Column<TimeEntry>[] = [
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "user",
    header: "User",
    className: "w-36",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.user?.name || "—"}</span>
    ),
  },
  {
    key: "description",
    header: "Description",
    render: (r) => (
      <span className="text-sm">{r.description || "—"}</span>
    ),
  },
  {
    key: "duration",
    header: "Duration",
    className: "w-24 text-right",
    render: (r) => (
      <span className="text-sm font-mono tabular-nums">{formatHours(r.minutes)}</span>
    ),
  },
  {
    key: "rate",
    header: "Rate",
    className: "w-24 text-right",
    render: (r) => (
      <span className="text-sm font-mono tabular-nums">{formatMoney(r.hourlyRate)}/hr</span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => {
      const amount = Math.round((r.minutes / 60) * r.hourlyRate);
      return (
        <span className="text-sm font-mono tabular-nums font-medium">{formatMoney(amount)}</span>
      );
    },
  },
  {
    key: "status",
    header: "Status",
    className: "w-28",
    render: (r) => {
      if (r.invoiceId) {
        return (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Invoiced
          </Badge>
        );
      }
      return (
        <Badge
          variant="outline"
          className={
            r.isBillable
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : "border-gray-200 bg-gray-50 text-gray-700"
          }
        >
          {r.isBillable ? "Billable" : "Non-billable"}
        </Badge>
      );
    },
  },
];

export default function TimeEntriesPage() {
  const { id } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryDesc, setEntryDesc] = useState("");
  const [entryMinutes, setEntryMinutes] = useState("");
  const [entryBillable, setEntryBillable] = useState("true");
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;

    fetch(`/api/v1/projects/${id}/time-entries`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setEntries(data.data);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleAddEntry() {
    if (!orgId) return;
    const mins = parseInt(entryMinutes);
    if (!mins || mins <= 0) {
      toast.error("Enter a valid duration in minutes");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/projects/${id}/time-entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          date: entryDate,
          description: entryDesc || null,
          minutes: mins,
          isBillable: entryBillable === "true",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add time entry");
      }

      const data = await res.json();
      setEntries((prev) => [data.timeEntry, ...prev]);
      setAddOpen(false);
      setEntryDesc("");
      setEntryMinutes("");
      toast.success("Time entry added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add time entry");
    } finally {
      setSaving(false);
    }
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.minutes, 0);
  const totalAmount = entries.reduce(
    (sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate),
    0
  );

  if (!loading && entries.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Time Entries" description="Track time for this project.">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/projects/${id}`}>
              <ArrowLeft className="mr-2 size-4" />
              Back to Project
            </Link>
          </Button>
        </PageHeader>
        <EmptyState
          icon={Clock}
          title="No time entries yet"
          description="Log your first time entry for this project."
        >
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="mr-2 size-4" />
                Log Time
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Time Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={entryDesc}
                    onChange={(e) => setEntryDesc(e.target.value)}
                    placeholder="What did you work on?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes) *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={entryMinutes}
                    onChange={(e) => setEntryMinutes(e.target.value)}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Billable</Label>
                  <Select value={entryBillable} onValueChange={setEntryBillable}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleAddEntry}
                  disabled={saving}
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving ? "Adding..." : "Add Entry"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Time Entries" description="Track time for this project.">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${id}`}>
            <ArrowLeft className="mr-2 size-4" />
            Back to Project
          </Link>
        </Button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="mr-2 size-4" />
              Log Time
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Time Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={entryDesc}
                  onChange={(e) => setEntryDesc(e.target.value)}
                  placeholder="What did you work on?"
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={entryMinutes}
                  onChange={(e) => setEntryMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
              <div className="space-y-2">
                <Label>Billable</Label>
                <Select value={entryBillable} onValueChange={setEntryBillable}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddEntry}
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {saving ? "Adding..." : "Add Entry"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Time</p>
          <p className="text-xl font-bold font-mono">{formatHours(totalMinutes)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="text-xl font-bold font-mono text-emerald-600">{formatMoney(totalAmount)}</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={entries}
        loading={loading}
        emptyMessage="No time entries found."
      />
    </div>
  );
}
