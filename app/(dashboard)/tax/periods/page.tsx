"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CalendarDays, FileCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLoader } from "@/components/dashboard/brand-loader";
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

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  filed: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  amended: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800",
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

  if (loading) return <BrandLoader />;

  const openCount = periods.filter((p) => p.status === "open").length;
  const filedCount = periods.filter((p) => p.status === "filed").length;

  if (periods.length === 0) {
    return (
      <div className="relative">
        {/* Ghost table preview */}
        <div className="pointer-events-none w-full space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border px-4 py-3">
                <div className="size-9 rounded-lg bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-2 w-16 rounded bg-muted/60" />
                  <div className="h-4 w-8 rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-4 border-b bg-muted/30 px-4 h-10">
              <div className="h-2 w-14 rounded bg-muted-foreground/20" />
              <div className="h-2 w-20 rounded bg-muted-foreground/20" />
              <div className="h-2 w-12 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="h-2 w-12 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="h-2 w-16 rounded bg-muted-foreground/20 hidden sm:block" />
              <div className="ml-auto h-2 w-14 rounded bg-muted-foreground/20" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 h-11">
                <div className={`h-2.5 rounded bg-muted ${i % 2 === 0 ? "w-20" : "w-16"}`} />
                <div className={`h-2.5 rounded bg-muted/60 ${i % 2 === 0 ? "w-32" : "w-28"}`} />
                <div className="h-2.5 w-16 rounded bg-muted/40 hidden sm:block" />
                <div className={`shrink-0 rounded-full border px-2.5 py-0.5 h-5 w-12 bg-muted/30 hidden sm:block`} />
                <div className="h-2.5 w-20 rounded bg-muted/40 hidden sm:block" />
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
          <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
            Create tax periods to track your filing deadlines and mark them
            as filed when submitted to the tax authority.
          </p>
          <div className="mt-6">
            <CreatePeriodSheet open={createOpen} setOpen={setCreateOpen} onCreated={fetchPeriods} orgId={orgId} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      <FileSheet period={filing} onClose={() => setFiling(null)} onFiled={fetchPeriods} orgId={orgId} />
    </div>
  );
}
