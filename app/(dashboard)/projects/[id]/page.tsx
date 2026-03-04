"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Clock, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney, centsToDecimal } from "@/lib/money";
import Link from "next/link";

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  budget: number;
  hourlyRate: number;
  totalHours: number;
  totalBilled: number;
  startDate: string | null;
  endDate: string | null;
  contactId: string | null;
  contact: { name: string } | null;
  timeEntries: {
    id: string;
    date: string;
    description: string | null;
    minutes: number;
    isBillable: boolean;
    hourlyRate: number;
    invoiceId: string | null;
    user: { name: string | null } | null;
  }[];
}

const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  archived: "border-gray-200 bg-gray-50 text-gray-700",
};

function formatHours(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [proj, setProj] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") : null;

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/v1/projects/${id}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.project) setProj(data.project);
      })
      .finally(() => setLoading(false));
  }, [id, orgId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    if (!orgId) return;

    try {
      const res = await fetch(`/api/v1/projects/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description") || null,
          status: form.get("status"),
          budget: Math.round(parseFloat(form.get("budget") as string || "0") * 100),
          hourlyRate: Math.round(parseFloat(form.get("hourlyRate") as string || "0") * 100),
          startDate: form.get("startDate") || null,
          endDate: form.get("endDate") || null,
        }),
      });

      if (!res.ok) throw new Error("Failed to update");
      const data = await res.json();
      setProj((prev) => prev ? { ...prev, ...data.project } : prev);
      toast.success("Project updated");
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateInvoice() {
    if (!orgId) return;
    try {
      const res = await fetch(`/api/v1/projects/${id}/invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate invoice");
      }

      const data = await res.json();
      toast.success("Invoice generated");
      router.push(`/sales/${data.invoice.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate invoice");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this project?")) return;
    if (!orgId) return;

    await fetch(`/api/v1/projects/${id}`, {
      method: "DELETE",
      headers: { "x-organization-id": orgId },
    });
    toast.success("Project deleted");
    router.push("/projects");
  }

  if (loading) return <div className="space-y-6"><PageHeader title="Loading..." /></div>;
  if (!proj) return <div className="space-y-6"><PageHeader title="Project not found" /></div>;

  const unbilledEntries = proj.timeEntries.filter(
    (e) => e.isBillable && !e.invoiceId
  );
  const unbilledMinutes = unbilledEntries.reduce((sum, e) => sum + e.minutes, 0);
  const unbilledAmount = unbilledEntries.reduce(
    (sum, e) => sum + Math.round((e.minutes / 60) * e.hourlyRate),
    0
  );
  const budgetUsed = proj.budget > 0
    ? Math.round((proj.totalBilled / proj.budget) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={proj.name}
        description={proj.contact ? `Client: ${proj.contact.name}` : undefined}
      >
        <Button variant="outline" size="sm" asChild>
          <Link href="/projects">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/projects/${id}/time`}>
            <Clock className="mr-2 size-4" />
            Time Log
          </Link>
        </Button>
        {proj.contactId && unbilledEntries.length > 0 && (
          <Button
            size="sm"
            onClick={handleGenerateInvoice}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <FileText className="mr-2 size-4" />
            Generate Invoice
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleDelete} className="text-red-600">
          <Trash2 className="mr-2 size-4" />
          Delete
        </Button>
      </PageHeader>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className={statusColors[proj.status] || ""}>
          {proj.status}
        </Badge>
        {proj.startDate && (
          <span className="text-sm text-muted-foreground">
            {proj.startDate}
            {proj.endDate ? ` · ${proj.endDate}` : ""}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard
          title="Total Hours"
          value={formatHours(proj.totalHours)}
          icon={Clock}
        />
        <StatCard
          title="Total Billed"
          value={formatMoney(proj.totalBilled)}
          icon={FileText}
        />
        <StatCard
          title="Budget Used"
          value={proj.budget > 0 ? `${budgetUsed}%` : "-"}
          icon={FileText}
          changeType={budgetUsed > 90 ? "negative" : "neutral"}
        />
        <StatCard
          title="Unbilled"
          value={formatMoney(unbilledAmount)}
          change={`${formatHours(unbilledMinutes)}`}
          icon={Clock}
        />
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Project Name</Label>
            <Input id="name" name="name" required defaultValue={proj.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={proj.status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budget">Budget</Label>
            <Input
              id="budget"
              name="budget"
              type="number"
              step="0.01"
              min={0}
              defaultValue={centsToDecimal(proj.budget)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly Rate</Label>
            <Input
              id="hourlyRate"
              name="hourlyRate"
              type="number"
              step="0.01"
              min={0}
              defaultValue={centsToDecimal(proj.hourlyRate)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={proj.startDate || ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={proj.endDate || ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={proj.description || ""}
            rows={3}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
