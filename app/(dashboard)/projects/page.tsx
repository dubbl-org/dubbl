"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";

interface Project {
  id: string;
  name: string;
  status: "active" | "completed" | "archived";
  budget: number;
  hourlyRate: number;
  totalHours: number;
  totalBilled: number;
  startDate: string | null;
  endDate: string | null;
  contact: { name: string } | null;
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

const columns: Column<Project>[] = [
  {
    key: "name",
    header: "Project",
    render: (r) => <span className="text-sm font-medium">{r.name}</span>,
  },
  {
    key: "contact",
    header: "Client",
    render: (r) => (
      <span className="text-sm text-muted-foreground">{r.contact?.name || "-"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={statusColors[r.status] || ""}>
        {r.status}
      </Badge>
    ),
  },
  {
    key: "hours",
    header: "Hours",
    className: "w-24 text-right",
    render: (r) => (
      <span className="text-sm font-mono tabular-nums">{formatHours(r.totalHours)}</span>
    ),
  },
  {
    key: "budget",
    header: "Budget",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {r.budget > 0 ? formatMoney(r.budget) : "-"}
      </span>
    ),
  },
  {
    key: "billed",
    header: "Billed",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.totalBilled)}</span>
    ),
  },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/projects?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setProjects(data.data);
      })
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
  const totalBilled = projects.reduce((sum, p) => sum + p.totalBilled, 0);

  if (!loading && projects.length === 0 && statusFilter === "all") {
    return (
      <div className="space-y-6">
        <PageHeader title="Projects" description="Track projects, time, and billing." />
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start tracking time and billing."
        >
          <Button
            onClick={() => router.push("/projects/new")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Project
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Track projects, time, and billing.">
        <Button
          onClick={() => router.push("/projects/new")}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Project
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active Projects" value={activeProjects.length.toString()} icon={FolderKanban} />
        <StatCard title="Total Budget" value={formatMoney(totalBudget)} icon={FolderKanban} />
        <StatCard title="Total Billed" value={formatMoney(totalBilled)} icon={FolderKanban} />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={projects}
        loading={loading}
        emptyMessage="No projects found."
        onRowClick={(r) => router.push(`/projects/${r.id}`)}
      />
    </div>
  );
}
