"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CalendarDays, FileCheck, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
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
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContentReveal } from "@/components/ui/content-reveal";

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

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  filed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amended: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

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
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ name, startDate, endDate, type, notes: notes || undefined }),
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
          <Plus className="mr-1.5 size-3.5" />New Tax Period
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader><SheetTitle>New Tax Period</SheetTitle></SheetHeader>
        <form onSubmit={handleCreate} className="space-y-4 px-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q1 2026" required />
          </div>
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Creating..." : "Create"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

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
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
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
    <Sheet open={!!period} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent>
        <SheetHeader><SheetTitle>File Tax Period</SheetTitle></SheetHeader>
        <form onSubmit={handleFile} className="space-y-4 px-4">
          <p className="text-sm text-muted-foreground">
            Mark &quot;{period?.name}&quot; as filed. This action cannot be undone.
          </p>
          <div className="space-y-2">
            <Label>Filing Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. confirmation number" />
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {saving ? "Filing..." : "Mark as Filed"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function TaxPeriodsPage() {
  const [periods, setPeriods] = useState<TaxPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filing, setFiling] = useState<TaxPeriod | null>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  const fetchPeriods = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await fetch("/api/v1/tax-periods", { headers: { "x-organization-id": orgId } });
      const data = await res.json();
      if (data.taxPeriods) setPeriods(data.taxPeriods);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPeriods(); }, [orgId]);

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

  return (
    <ContentReveal className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <CalendarDays className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Periods</p>
            <p className="text-lg font-semibold tabular-nums">{periods.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
            <CalendarDays className="size-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Open</p>
            <p className="text-lg font-semibold tabular-nums">{openCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
            <FileCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Filed</p>
            <p className="text-lg font-semibold tabular-nums">{filedCount}</p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Tax Periods</h2>
          <p className="text-sm text-muted-foreground">
            Track tax filing periods and mark them as filed when submitted.
          </p>
        </div>
        <CreatePeriodSheet open={createOpen} setOpen={setCreateOpen} onCreated={fetchPeriods} orgId={orgId} />
      </div>

      {/* Table */}
      {!loading && periods.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No tax periods" description="Create tax periods to track your filing deadlines." />
      ) : loading ? (
        <div className="rounded-xl border bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`flex items-center gap-4 px-5 py-3.5 ${i < 2 ? "border-b" : ""}`}>
              <div className="size-8 rounded-lg bg-muted animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-20 rounded bg-muted animate-pulse" />
              </div>
              <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Period</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Filed Date</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{p.startDate} - {p.endDate}</td>
                  <td className="px-4 py-2.5 capitalize text-muted-foreground">{p.type}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={`capitalize text-[11px] ${STATUS_COLORS[p.status] || ""}`}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {p.filedAt ? new Date(p.filedAt).toLocaleDateString() : "-"}
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
                          <FileCheck className="mr-1 size-3" />File
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FileSheet period={filing} onClose={() => setFiling(null)} onFiled={fetchPeriods} orgId={orgId} />
    </ContentReveal>
  );
}
