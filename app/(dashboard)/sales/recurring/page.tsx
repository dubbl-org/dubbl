"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Calendar } from "lucide-react";
import { Section } from "@/components/dashboard/section";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { devDelay } from "@/lib/dev-delay";
import { formatMoney } from "@/lib/money";
import { useCreateDrawer } from "@/components/dashboard/create-drawer";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";

interface RecurringTemplate {
  id: string;
  name: string;
  type: string;
  frequency: string;
  status: string;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastRunDate: string | null;
  occurrencesGenerated: number;
  maxOccurrences: number | null;
  contact: { name: string } | null;
}

const statusColors: Record<string, string> = {
  active:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  completed:
    "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300",
};

const frequencyLabels: Record<string, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
};

const columns: Column<RecurringTemplate>[] = [
  {
    key: "name",
    header: "Name",
    render: (r) => <span className="text-sm font-medium">{r.name}</span>,
  },
  {
    key: "contact",
    header: "Customer",
    render: (r) => (
      <span className="text-sm font-medium">{r.contact?.name || "-"}</span>
    ),
  },
  {
    key: "frequency",
    header: "Frequency",
    className: "w-32",
    render: (r) => (
      <span className="text-sm">
        {frequencyLabels[r.frequency] || r.frequency}
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
    key: "nextRun",
    header: "Next Run",
    className: "w-28",
    render: (r) => <span className="text-sm">{r.nextRunDate || "-"}</span>,
  },
  {
    key: "occurrences",
    header: "Occurrences",
    className: "w-28 text-right",
    render: (r) => (
      <span className="font-mono text-sm tabular-nums">
        {r.occurrencesGenerated} / {r.maxOccurrences ?? "\u221E"}
      </span>
    ),
  },
];

export default function RecurringInvoicesPage() {
  const router = useRouter();
  const { open: openDrawer } = useCreateDrawer();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [upcoming, setUpcoming] = useState<
    { templateName: string; contactName: string; lineTotal: number; dates: { date: string; occurrence: number }[] }[]
  >([]);

  useEffect(() => {
    const orgId = localStorage.getItem("activeOrgId");
    if (!orgId) return;

    const params = new URLSearchParams({ type: "invoice" });
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/v1/recurring?${params}`, {
      headers: { "x-organization-id": orgId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setTemplates(data.data);
          // Load previews for active templates
          const active = (data.data as RecurringTemplate[]).filter((t) => t.status === "active");
          Promise.all(
            active.slice(0, 5).map((t) =>
              fetch(`/api/v1/recurring/${t.id}/preview?count=3`, {
                headers: { "x-organization-id": orgId },
              })
                .then((r) => r.json())
                .then((d) => ({
                  templateName: d.template?.name || t.name,
                  contactName: d.template?.contactName || t.contact?.name || "",
                  lineTotal: d.template?.lineTotal || 0,
                  dates: d.upcoming || [],
                }))
                .catch(() => null)
            )
          ).then((results) => {
            setUpcoming(results.filter((r): r is NonNullable<typeof r> => r !== null && r.dates.length > 0));
          });
        }
      })
      .then(() => devDelay())
      .finally(() => setLoading(false));
  }, [statusFilter]);

  if (loading) return <BrandLoader />;

  if (!loading && templates.length === 0 && statusFilter === "all") {
    // Generate a sample month grid
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDay = monthStart.getDay(); // 0=Sun
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
    // Highlight the 1st and 15th as "recurring" dates
    const recurringDays = new Set([1, 15]);

    return (
      <ContentReveal>
        <div className="pt-12 pb-12 space-y-10">
          {/* Top: title + CTA */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Recurring Invoices</h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">
                Set up templates that automatically generate invoices on a schedule.
              </p>
            </div>
            <Button
              onClick={() => openDrawer("recurring")}
              className="bg-emerald-600 hover:bg-emerald-700 shrink-0"
            >
              <Plus className="mr-2 size-4" />
              New Recurring Template
            </Button>
          </div>

          <div className="grid gap-6 sm:gap-8 grid-cols-1 lg:grid-cols-[1fr_1fr] items-start">
            {/* Left: Calendar */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                <p className="text-sm font-medium">{monthName}</p>
                <RefreshCw className="size-3.5 text-indigo-500" />
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 mb-1">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: startDay }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-8" />
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isRecurring = recurringDays.has(day);
                    const isToday = day === today.getDate();
                    return (
                      <div key={day} className="flex items-center justify-center h-8">
                        <div className={`flex size-7 items-center justify-center rounded-full text-xs
                          ${isRecurring ? "bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold ring-2 ring-indigo-300/50 dark:ring-indigo-700/50" : ""}
                          ${isToday && !isRecurring ? "bg-muted font-medium" : ""}
                          ${!isRecurring && !isToday ? "text-muted-foreground" : ""}
                        `}>
                          {day}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t">
                  <div className="size-2.5 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                  <span className="text-[10px] text-muted-foreground">Invoice auto-generates on these dates</span>
                </div>
              </div>
            </div>

            {/* Right: Mock template + frequency options */}
            <div className="space-y-4">
              {/* Mock template card */}
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="bg-muted/30 px-3 sm:px-5 py-3 border-b">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Example template</p>
                </div>
                <div className="p-3 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Monthly hosting</p>
                      <p className="text-xs text-muted-foreground">Acme Corp</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">active</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Frequency</p>
                      <p className="font-medium mt-0.5">Monthly</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Amount</p>
                      <p className="font-medium font-mono mt-0.5">$299.00</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Next invoice</p>
                      <p className="font-medium mt-0.5">Apr 1, 2026</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Generated</p>
                      <p className="font-medium font-mono mt-0.5">12 / &infin;</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Supported frequencies */}
              <div className="rounded-xl border bg-card px-3 sm:px-5 py-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Supported frequencies</p>
                <div className="flex flex-wrap gap-2">
                  {["Weekly", "Fortnightly", "Monthly", "Quarterly", "Semi-annual", "Annual"].map((freq) => (
                    <span key={freq} className="rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">{freq}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentReveal>
    );
  }

  return (
    <ContentReveal className="space-y-10">
      <Section
        title="Recurring Invoices"
        description="Manage recurring templates that automatically generate invoices."
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="overflow-x-auto">
                <TabsTrigger value="all" className="whitespace-nowrap">All</TabsTrigger>
                <TabsTrigger value="active" className="whitespace-nowrap">Active</TabsTrigger>
                <TabsTrigger value="paused" className="whitespace-nowrap">Paused</TabsTrigger>
                <TabsTrigger value="completed" className="whitespace-nowrap">Completed</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openDrawer("recurring")}>
              <Plus className="mr-2 size-4" />
              New Recurring
            </Button>
          </div>

          <DataTable
            columns={columns}
            data={templates}
            loading={loading}
            emptyMessage="No recurring invoices found."
            onRowClick={(r) => router.push(`/sales/recurring/${r.id}`)}
          />
        </div>
      </Section>

      {upcoming.length > 0 && (
        <Section
          title="Upcoming Generations"
          description="Next scheduled invoice generations from active templates."
        >
          <div className="space-y-3">
            {upcoming.map((u) => (
              <div key={u.templateName} className="rounded-lg border px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">{u.templateName}</p>
                    {u.contactName && (
                      <p className="text-xs text-muted-foreground">{u.contactName}</p>
                    )}
                  </div>
                  <p className="text-sm font-mono font-semibold tabular-nums">{formatMoney(u.lineTotal)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {u.dates.map((d) => (
                    <div key={d.date} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3" />
                      <span>{d.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </ContentReveal>
  );
}
