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
import { ContentReveal } from "@/components/ui/content-reveal";
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
      <ContentReveal className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Journal Entries</h2>
          <Button
            onClick={() => openDrawer("entry")}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Plus className="mr-2 size-4" />
            New Entry
          </Button>
        </div>

        <div className="rounded-lg border overflow-hidden opacity-50">
          <div className="grid grid-cols-[100px_1fr_1fr_100px_100px] gap-px bg-muted text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <div className="bg-card px-4 py-2.5">Date</div>
            <div className="bg-card px-4 py-2.5">Description</div>
            <div className="bg-card px-4 py-2.5">Account</div>
            <div className="bg-card px-4 py-2.5 text-right">Debit</div>
            <div className="bg-card px-4 py-2.5 text-right">Credit</div>
          </div>
          {[
            { date: "Mar 01", desc: "Office rent payment", account: "Rent Expense", debit: "$2,500", credit: "-" },
            { date: "", desc: "", account: "Cash", debit: "-", credit: "$2,500" },
            { date: "Mar 03", desc: "Client invoice payment", account: "Cash", debit: "$8,400", credit: "-" },
            { date: "", desc: "", account: "Accounts Receivable", debit: "-", credit: "$8,400" },
            { date: "Mar 05", desc: "Software subscription", account: "Software Expense", debit: "$199", credit: "-" },
            { date: "", desc: "", account: "Cash", debit: "-", credit: "$199" },
          ].map((row, i) => (
            <div key={i} className="grid grid-cols-[100px_1fr_1fr_100px_100px] gap-px bg-muted">
              <div className="bg-card px-4 py-2.5 text-sm text-muted-foreground">{row.date}</div>
              <div className="bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground">{row.desc}</div>
              <div className="bg-card px-4 py-2.5 text-sm text-muted-foreground">{row.account}</div>
              <div className="bg-card px-4 py-2.5 text-sm font-mono tabular-nums text-right text-muted-foreground">{row.debit}</div>
              <div className="bg-card px-4 py-2.5 text-sm font-mono tabular-nums text-right text-muted-foreground">{row.credit}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-6 pt-2">
          {[
            { icon: BookOpen, label: "Set up accounts" },
            { icon: ArrowLeftRight, label: "Record entries" },
            { icon: BarChart3, label: "Generate reports" },
          ].map(({ icon: StepIcon, label }, i) => (
            <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{i + 1}</span>
              <StepIcon className="size-3.5" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal>
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
    </ContentReveal>
  );
}
