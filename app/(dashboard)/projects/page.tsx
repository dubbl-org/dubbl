"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Clock, DollarSign, Target, Users } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";
import { cn } from "@/lib/utils";

interface ProjectMember {
  id: string;
  role: string;
  member: {
    id: string;
    user: { name: string | null; email: string; image: string | null };
  };
}

interface Project {
  id: string;
  name: string;
  status: string;
  priority: string;
  billingType: string;
  color: string;
  budget: number;
  hourlyRate: number;
  totalHours: number;
  totalBilled: number;
  estimatedHours: number;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
  tags: string[];
  contact: { name: string } | null;
  members: ProjectMember[];
}

const statusColors: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-blue-200 bg-blue-50 text-blue-700",
  on_hold: "border-amber-200 bg-amber-50 text-amber-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
  archived: "border-gray-200 bg-gray-50 text-gray-700",
};

const priorityColors: Record<string, string> = {
  low: "border-gray-200 bg-gray-50 text-gray-600",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
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
    render: (r) => (
      <div className="flex items-center gap-2.5">
        <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
        <div className="min-w-0">
          <span className="text-sm font-medium block truncate">{r.name}</span>
          {r.contact && <span className="text-[11px] text-muted-foreground">{r.contact.name}</span>}
        </div>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-28",
    render: (r) => (
      <Badge variant="outline" className={cn("text-[10px]", statusColors[r.status])}>
        {r.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "priority",
    header: "Priority",
    className: "w-24",
    render: (r) => (
      <Badge variant="outline" className={cn("text-[10px]", priorityColors[r.priority])}>
        {r.priority}
      </Badge>
    ),
  },
  {
    key: "progress",
    header: "Time",
    className: "w-32",
    render: (r) => {
      const pct = r.estimatedHours > 0 ? Math.round((r.totalHours / r.estimatedHours) * 100) : 0;
      return (
        <div className="space-y-1">
          <span className="text-xs font-mono tabular-nums">{formatHours(r.totalHours)}</span>
          {r.estimatedHours > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-16 rounded-full bg-muted">
                <div className={cn("h-full rounded-full", pct > 100 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{pct}%</span>
            </div>
          )}
        </div>
      );
    },
  },
  {
    key: "budget",
    header: "Budget",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-xs tabular-nums">
        {r.budget > 0 ? formatMoney(r.budget) : "-"}
      </span>
    ),
  },
  {
    key: "billed",
    header: "Billed",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-xs tabular-nums">{formatMoney(r.totalBilled)}</span>
    ),
  },
  {
    key: "team",
    header: "Team",
    className: "w-24",
    render: (r) => {
      if (r.members.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
      return (
        <div className="flex -space-x-1.5">
          {r.members.slice(0, 3).map((m) => (
            <div key={m.id} className="size-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-medium ring-2 ring-white" title={m.member.user.name || m.member.user.email}>
              {(m.member.user.name || m.member.user.email)[0].toUpperCase()}
            </div>
          ))}
          {r.members.length > 3 && (
            <div className="size-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[9px] font-medium ring-2 ring-white">
              +{r.members.length - 3}
            </div>
          )}
        </div>
      );
    },
  },
];

export default function ProjectsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
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
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const activeProjects = projects.filter((p) => p.status === "active");
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
  const totalBilled = projects.reduce((sum, p) => sum + p.totalBilled, 0);
  const totalHours = projects.reduce((sum, p) => sum + p.totalHours, 0);
  const totalMembers = new Set(projects.flatMap(p => p.members.map(m => m.member.id))).size;

  if (loading) return <BrandLoader />;

  if (!loading && projects.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Projects" description="Create your first project to start tracking time, tasks, and billing.">
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to start tracking time, tasks, and billing."
          >
            <Button
              onClick={() => openDrawer("project")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Project
            </Button>
          </EmptyState>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
    <div className="space-y-8">
      <Section title="Overview" description="A summary of your projects and resource allocation.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard title="Active" value={activeProjects.length.toString()} icon={FolderKanban} />
            <StatCard title="Total Budget" value={formatMoney(totalBudget)} icon={DollarSign} />
            <StatCard title="Total Billed" value={formatMoney(totalBilled)} icon={Target}
              change={totalBudget > 0 ? `${Math.round((totalBilled / totalBudget) * 100)}% of budget` : undefined}
            />
            <StatCard title="Hours Logged" value={formatHours(totalHours)} icon={Clock} />
            <StatCard title="Team Members" value={totalMembers.toString()} icon={Users} />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => openDrawer("project")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Project
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Projects" description="View and manage all your projects.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="on_hold">On Hold</TabsTrigger>
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
      </Section>
    </div>
    </BlurReveal>
  );
}
