"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { BlurReveal } from "@/components/ui/blur-reveal";

interface ExpenseClaim {
  id: string;
  title: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  createdAt: string;
  submittedAt: string | null;
  submittedByUser: { name: string | null; email: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  paid: "border-purple-200 bg-purple-50 text-purple-700",
};

const columns: Column<ExpenseClaim>[] = [
  {
    key: "title",
    header: "Title",
    render: (r) => <span className="text-sm font-medium">{r.title}</span>,
  },
  {
    key: "submittedBy",
    header: "Submitted By",
    render: (r) => (
      <span className="text-sm">
        {r.submittedByUser?.name || r.submittedByUser?.email || "-"}
      </span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => (
      <span className="text-sm">
        {new Date(r.createdAt).toLocaleDateString()}
      </span>
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
    key: "total",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.totalAmount, r.currencyCode)}
      </span>
    ),
  },
];

export default function ExpensesPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    fetch(`/api/v1/expenses?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.data) setClaims(data.data);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [statusFilter]);

  const pendingTotal = claims
    .filter((c) => ["submitted", "approved"].includes(c.status))
    .reduce((s, c) => s + c.totalAmount, 0);

  if (!loading && claims.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Expenses" description="Submit and manage expense claims.">
          <EmptyState
            icon={Receipt}
            title="No expense claims yet"
            description="Create your first expense claim to get reimbursed."
          >
            <Button
              onClick={() => router.push("/purchases/expenses/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Expense Claim
            </Button>
          </EmptyState>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="A summary of your expense claims and pending approvals.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              title="Pending Approval"
              value={formatMoney(pendingTotal)}
              icon={Receipt}
            />
            <StatCard
              title="Total Claims"
              value={claims.length.toString()}
              icon={Receipt}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => router.push("/purchases/expenses/new")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Expense Claim
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Expenses" description="View and manage all submitted expense claims.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="submitted">Submitted</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
            columns={columns}
            data={claims}
            loading={loading}
            emptyMessage="No expense claims found."
            onRowClick={(r) => router.push(`/purchases/expenses/${r.id}`)}
          />
        </div>
      </Section>
    </BlurReveal>
  );
}
