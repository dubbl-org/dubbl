"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus, ShoppingCart } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import { devDelay } from "@/lib/dev-delay";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { BlurReveal } from "@/components/ui/blur-reveal";


interface Bill {
  id: string;
  billNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  amountDue: number;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  draft: "",
  received: "border-blue-200 bg-blue-50 text-blue-700",
  partial: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
  overdue: "border-red-200 bg-red-50 text-red-700",
  void: "border-gray-200 bg-gray-50 text-gray-700",
};

const columns: Column<Bill>[] = [
  {
    key: "number",
    header: "Number",
    className: "w-32",
    render: (r) => <span className="font-mono text-sm">{r.billNumber}</span>,
  },
  {
    key: "contact",
    header: "Supplier",
    render: (r) => <span className="text-sm font-medium">{r.contact?.name || "-"}</span>,
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.issueDate}</span>,
  },
  {
    key: "due",
    header: "Due",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.dueDate}</span>,
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge variant="outline" className={statusColors[r.status] || ""}>
        {r.status}
      </Badge>
    ),
  },
  {
    key: "total",
    header: "Total",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.total)}</span>
    ),
  },
  {
    key: "due-amount",
    header: "Due",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">{formatMoney(r.amountDue)}</span>
    ),
  },
];

export default function BillsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/bills?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) setBills(data.data);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const outstanding = bills
    .filter((b) => ["received", "partial", "overdue"].includes(b.status))
    .reduce((s, b) => s + b.amountDue, 0);

  const aging = useMemo(() => {
    const now = new Date();
    const buckets = { current: { count: 0, amount: 0 }, "1-30": { count: 0, amount: 0 }, "31-60": { count: 0, amount: 0 }, "60+": { count: 0, amount: 0 } };
    bills
      .filter((b) => ["received", "partial", "overdue"].includes(b.status) && b.amountDue > 0)
      .forEach((bill) => {
        const due = new Date(bill.dueDate);
        const days = Math.floor((now.getTime() - due.getTime()) / 86400000);
        if (days <= 0) { buckets.current.count++; buckets.current.amount += bill.amountDue; }
        else if (days <= 30) { buckets["1-30"].count++; buckets["1-30"].amount += bill.amountDue; }
        else if (days <= 60) { buckets["31-60"].count++; buckets["31-60"].amount += bill.amountDue; }
        else { buckets["60+"].count++; buckets["60+"].amount += bill.amountDue; }
      });
    return buckets;
  }, [bills]);

  const agingTotal = aging.current.amount + aging["1-30"].amount + aging["31-60"].amount + aging["60+"].amount;

  if (loading) return <BrandLoader />;

  if (!loading && bills.length === 0 && statusFilter === "all") {
    return (
      <BlurReveal className="space-y-10">
        <Section title="Bills" description="Track purchase bills from your suppliers and manage payables.">
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center py-12">
            <div className="grid grid-cols-4 gap-3 mb-8 w-full max-w-lg opacity-40">
              {["Current", "1-30 days", "31-60 days", "60+ days"].map((label) => (
                <div key={label} className="rounded-lg border border-dashed p-3">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="text-lg font-semibold tabular-nums text-muted-foreground/40 mt-0.5">$0</p>
                </div>
              ))}
            </div>
            <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <ShoppingCart className="size-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No bills yet</h3>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Add your first bill from a supplier to track payables.
            </p>
            <div className="mt-4">
              <Button
                onClick={() => openDrawer("bill")}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Bill
              </Button>
            </div>
          </div>
        </Section>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
    <div className="space-y-10">
      <Section title="Overview" description="Bills and payables summary across all suppliers.">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Outstanding" value={formatMoney(outstanding)} icon={ShoppingCart} />
            <StatCard title="Total Bills" value={bills.length.toString()} icon={ShoppingCart} />
          </div>
          {agingTotal > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Payables Aging</p>
              <div className="h-3 w-full rounded-full overflow-hidden flex">
                {([
                  { key: "current" as const, color: "bg-emerald-500" },
                  { key: "1-30" as const, color: "bg-amber-400" },
                  { key: "31-60" as const, color: "bg-orange-500" },
                  { key: "60+" as const, color: "bg-red-500" },
                ] as const).map(({ key, color }) => {
                  const pct = (aging[key].amount / agingTotal) * 100;
                  if (pct === 0) return null;
                  return <div key={key} className={`${color} h-full`} style={{ width: `${pct}%` }} />;
                })}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {([
                  { key: "current" as const, color: "bg-emerald-500", label: "Current" },
                  { key: "1-30" as const, color: "bg-amber-400", label: "1-30 days" },
                  { key: "31-60" as const, color: "bg-orange-500", label: "31-60 days" },
                  { key: "60+" as const, color: "bg-red-500", label: "60+ days" },
                ] as const).map(({ key, color, label }) => (
                  <div key={key} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block size-2 rounded-full ${color}`} />
                      <span className="text-muted-foreground">{label}</span>
                    </div>
                    <p className="font-mono tabular-nums mt-0.5 pl-3.5">
                      {aging[key].count} · {formatMoney(aging[key].amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => openDrawer("bill")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Bill
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <Section title="Bills" description="View, filter, and manage all your bills.">
        <div className="space-y-4">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="received">Received</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>

          <DataTable
              columns={columns}
              data={bills}
              loading={loading}
              emptyMessage="No bills found."
              onRowClick={(r) => router.push(`/purchases/${r.id}`)}
            />
        </div>
      </Section>
    </div>
    </BlurReveal>
  );
}
