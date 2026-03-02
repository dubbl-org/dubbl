"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";

interface PayrollRun {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  processedAt: string | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<PayrollRun>[] = [
  {
    key: "period",
    header: "Pay Period",
    render: (r) => (
      <span className="text-sm">
        {r.payPeriodStart} to {r.payPeriodEnd}
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
    key: "gross",
    header: "Gross",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.totalGross)}
      </span>
    ),
  },
  {
    key: "deductions",
    header: "Deductions",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(r.totalDeductions)}
      </span>
    ),
  },
  {
    key: "net",
    header: "Net Pay",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums font-medium">
        {formatMoney(r.totalNet)}
      </span>
    ),
  },
];

export default function PayrollRunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // New run form
  const [payPeriodStart, setPayPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [payPeriodEnd, setPayPeriodEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().split("T")[0];
  });

  function fetchRuns() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/payroll/runs?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setRuns(data.data);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCreateRun() {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;
    setCreating(true);

    try {
      const res = await fetch("/api/v1/payroll/runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({ payPeriodStart, payPeriodEnd }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create payroll run");
      }

      const data = await res.json();
      toast.success("Payroll run created");
      setDialogOpen(false);
      router.push(`/payroll/runs/${data.run.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create payroll run"
      );
    } finally {
      setCreating(false);
    }
  }

  if (!loading && runs.length === 0 && statusFilter === "all") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Payroll Runs"
          description="Create and manage pay runs."
        />
        <EmptyState
          icon={FileText}
          title="No payroll runs"
          description="Create your first payroll run to pay employees."
        >
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Payroll Run
          </Button>
        </EmptyState>
        <NewRunDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          payPeriodStart={payPeriodStart}
          setPayPeriodStart={setPayPeriodStart}
          payPeriodEnd={payPeriodEnd}
          setPayPeriodEnd={setPayPeriodEnd}
          onSubmit={handleCreateRun}
          loading={creating}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Runs"
        description="Create and manage pay runs."
      >
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-2 size-4" />
          New Payroll Run
        </Button>
      </PageHeader>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="void">Void</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={runs}
        loading={loading}
        emptyMessage="No payroll runs found."
        onRowClick={(r) => router.push(`/payroll/runs/${r.id}`)}
      />

      <NewRunDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        payPeriodStart={payPeriodStart}
        setPayPeriodStart={setPayPeriodStart}
        payPeriodEnd={payPeriodEnd}
        setPayPeriodEnd={setPayPeriodEnd}
        onSubmit={handleCreateRun}
        loading={creating}
      />
    </div>
  );
}

function NewRunDialog({
  open,
  onOpenChange,
  payPeriodStart,
  setPayPeriodStart,
  payPeriodEnd,
  setPayPeriodEnd,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payPeriodStart: string;
  setPayPeriodStart: (v: string) => void;
  payPeriodEnd: string;
  setPayPeriodEnd: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pay Period Start</Label>
            <Input
              type="date"
              value={payPeriodStart}
              onChange={(e) => setPayPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Pay Period End</Label>
            <Input
              type="date"
              value={payPeriodEnd}
              onChange={(e) => setPayPeriodEnd(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!payPeriodStart || !payPeriodEnd || loading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {loading ? "Creating..." : "Create Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
