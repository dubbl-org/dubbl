"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, BookOpen, BarChart3 } from "lucide-react";
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
import { ActivityFeed } from "@/components/dashboard/activity-feed";


interface Entry {
  id: string;
  entryNumber: number;
  date: string;
  description: string;
  reference: string | null;
  status: "draft" | "posted" | "void";
  totalDebit: string;
  createdAt: string;
}

const columns: Column<Entry>[] = [
  {
    key: "number",
    header: "#",
    className: "w-16",
    render: (r) => (
      <span className="font-mono text-xs text-muted-foreground">
        {r.entryNumber}
      </span>
    ),
  },
  {
    key: "date",
    header: "Date",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.date}</span>,
  },
  {
    key: "description",
    header: "Description",
    render: (r) => (
      <div>
        <p className="text-sm font-medium">{r.description}</p>
        {r.reference && (
          <p className="text-xs text-muted-foreground">{r.reference}</p>
        )}
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "w-24",
    render: (r) => (
      <Badge
        variant="outline"
        className={
          r.status === "posted"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : r.status === "void"
            ? "border-red-200 bg-red-50 text-red-700"
            : ""
        }
      >
        {r.status}
      </Badge>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {formatMoney(Math.round(parseFloat(r.totalDebit) * 100))}
      </span>
    ),
  },
];

export default function TransactionsPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    fetch("/api/v1/entries", {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) setEntries(data.entries);
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, []);

  const posted = entries.filter((e) => e.status === "posted");
  const drafts = entries.filter((e) => e.status === "draft");
  const totalPosted = posted.reduce(
    (sum, e) => sum + Math.round(parseFloat(e.totalDebit) * 100),
    0
  );

  const filtered =
    statusFilter === "all"
      ? entries
      : entries.filter((e) => e.status === statusFilter);

  if (loading) return <BrandLoader />;

  if (!loading && entries.length === 0) {
    return (
      <BlurReveal>
        <div className="min-h-[60vh] flex flex-col justify-center gap-10">
          <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-10">
            <div className="flex-1 space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">Journal Entries</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Record debits and credits across your chart of accounts. Every transaction stays balanced and audit-ready.
              </p>
              <Button
                onClick={() => openDrawer("entry")}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Plus className="mr-2 size-4" />
                New Entry
              </Button>
            </div>
            <div className="w-full sm:w-auto sm:min-w-[320px] flex flex-col gap-2">
              {[
                { icon: BookOpen, label: "Set up accounts", desc: "Categorize where money flows" },
                { icon: ArrowLeftRight, label: "Record entries", desc: "Balanced debits and credits" },
                { icon: BarChart3, label: "View reports", desc: "Financial statements from your data" },
              ].map(({ icon: StepIcon, label, desc }, i) => (
                <div key={label} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 text-xs font-bold">
                    {i + 1}
                  </span>
                  <StepIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BlurReveal>
    );
  }

  return (
    <BlurReveal>
    <div className="space-y-6 sm:space-y-10">
      <Section title="Overview" description="Summary of transactions and journal entries across all statuses.">
        <div className="space-y-4">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
            <StatCard title="Total Posted" value={formatMoney(totalPosted)} icon={ArrowLeftRight} />
            <StatCard title="Posted Entries" value={posted.length.toString()} icon={ArrowLeftRight} />
            <StatCard title="Drafts" value={drafts.length.toString()} icon={ArrowLeftRight} />
          </div>
          <div className="flex justify-end flex-wrap">
            <Button
              onClick={() => openDrawer("entry")}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="mr-2 size-4" />
              New Entry
            </Button>
          </div>
        </div>
      </Section>

      <div className="h-px bg-border" />

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <Section title="Journal Entries" description="View, filter, and manage all your journal entries.">
          <div className="space-y-4">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="posted">Posted</TabsTrigger>
                <TabsTrigger value="void">Void</TabsTrigger>
              </TabsList>
            </Tabs>

            <DataTable
                columns={columns}
                data={filtered}
                loading={loading}
                emptyMessage="No entries found."
                onRowClick={(r) => router.push(`/accounting/${r.id}`)}
              />
          </div>
        </Section>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <ActivityFeed />
        </div>
      </div>
    </div>
    </BlurReveal>
  );
}
