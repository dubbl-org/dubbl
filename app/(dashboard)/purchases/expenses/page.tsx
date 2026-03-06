"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Receipt } from "lucide-react";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
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
  const { open: openDrawer } = useCreateDrawer();
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

  if (!loading && claims.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Expenses" description="Submit and manage expense claims.">
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-12">
            <div className="flex items-center gap-2 mb-8 opacity-40">
              {[
                { label: "Draft", color: "bg-gray-200 dark:bg-gray-700" },
                { label: "Submitted", color: "bg-blue-200 dark:bg-blue-900" },
                { label: "Approved", color: "bg-emerald-200 dark:bg-emerald-900" },
                { label: "Paid", color: "bg-purple-200 dark:bg-purple-900" },
              ].map(({ label, color }, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`rounded-full px-3 py-1.5 ${color}`}>
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  </div>
                  {i < 3 && (
                    <svg className="size-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <Receipt className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No expense claims yet</h3>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Submit expenses and track them through approval to reimbursement.
            </p>
            <div className="mt-4">
              <Button
                onClick={() => openDrawer("expense")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Expense Claim
              </Button>
            </div>
          </div>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal className="space-y-10">
      <Section title="Overview" description="A summary of your expense claims and pending approvals.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            {([
              { status: "draft", label: "Draft", color: "border-l-gray-400" },
              { status: "submitted", label: "Submitted", color: "border-l-blue-500" },
              { status: "approved", label: "Approved", color: "border-l-emerald-500" },
              { status: "rejected", label: "Rejected", color: "border-l-red-500" },
              { status: "paid", label: "Paid", color: "border-l-purple-500" },
            ] as const).map(({ status, label, color }) => {
              const count = claims.filter((c) => c.status === status).length;
              const total = claims.filter((c) => c.status === status).reduce((s, c) => s + c.totalAmount, 0);
              return (
                <div key={status} className={`rounded-lg border border-l-4 ${color} bg-card p-4`}>
                  <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold mt-1 tabular-nums">{count}</p>
                  {total > 0 && <p className="text-xs font-mono text-muted-foreground tabular-nums mt-0.5">{formatMoney(total)}</p>}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => openDrawer("expense")}
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
