"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  BarChart3,
  Plus,
  Play,
  Download,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";

interface ReportConfig {
  dataSource: string;
  columns: string[];
  filters: { field: string; operator: string; value: string }[];
  groupBy: string[];
  dateRange?: { from: string; to: string };
  chartType?: string;
}

interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  config: ReportConfig;
  createdAt: string;
  updatedAt: string;
}

interface ReportSchedule {
  id: string;
  savedReportId: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

// Plain-language label for each data source (end users aren't accountants).
const DATA_SOURCE_LABELS: Record<string, string> = {
  invoices: "Invoices",
  expenses: "Expenses",
  transactions: "Bank transactions",
  payroll: "Payroll",
  inventory: "Inventory",
  contacts: "Contacts",
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SavedReportsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SavedReport[]>([]);
  // Last-run lives on report schedules, not on the saved report itself.
  // Map savedReportId -> most recent lastRunAt across its schedules.
  const [lastRunByReport, setLastRunByReport] = useState<Record<string, string | null>>({});

  // Run-inline state
  const [runOpen, setRunOpen] = useState(false);
  const [runReportItem, setRunReportItem] = useState<SavedReport | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);

  useDocumentTitle("Reports · Saved reports");

  function getHeaders() {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") || "" : "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  const fetchReports = useCallback(() => {
    setLoading(true);
    // Fetch saved reports + schedules (for last-run) in parallel.
    Promise.all([
      fetch("/api/v1/reports/saved", { headers: getHeaders() })
        .then((r) => r.json())
        .catch(() => ({ reports: [] })),
      fetch("/api/v1/report-schedules?limit=200", { headers: getHeaders() })
        .then((r) => r.json())
        .catch(() => ({ data: [] })),
    ])
      .then(([savedData, scheduleData]) => {
        setReports(Array.isArray(savedData?.reports) ? savedData.reports : []);

        const schedules: ReportSchedule[] = Array.isArray(scheduleData?.data)
          ? scheduleData.data
          : [];
        const lastRun: Record<string, string | null> = {};
        for (const s of schedules) {
          if (!s.savedReportId || !s.lastRunAt) continue;
          const existing = lastRun[s.savedReportId];
          if (!existing || new Date(s.lastRunAt) > new Date(existing)) {
            lastRun[s.savedReportId] = s.lastRunAt;
          }
        }
        setLastRunByReport(lastRun);
      })
      .finally(() => {
        setLoading(false);
        setInitialLoad(false);
      });
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  async function openRun(report: SavedReport) {
    setRunReportItem(report);
    setResults(null);
    setRunOpen(true);
    setRunning(true);
    try {
      const res = await fetch("/api/v1/reports/run", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          dataSource: report.config.dataSource,
          columns: report.config.columns,
          filters: report.config.filters || [],
          groupBy: report.config.groupBy || [],
          ...(report.config.dateRange ? { dateRange: report.config.dateRange } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Failed to run report");
        setResults([]);
      } else {
        setResults(data.data || []);
      }
    } catch {
      toast.error("Failed to run report");
      setResults([]);
    } finally {
      setRunning(false);
    }
  }

  function handleExport(report: SavedReport) {
    const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") || "" : "";
    window.open(
      `/api/v1/reports/saved/${report.id}/export?x-organization-id=${orgId}`,
      "_blank"
    );
  }

  async function handleDelete(report: SavedReport) {
    await confirm({
      title: `Delete "${report.name}"?`,
      description: "This saved report will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(`/api/v1/reports/saved/${report.id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        if (res.ok) {
          toast.success("Report deleted");
          fetchReports();
        } else {
          toast.error("Failed to delete report");
        }
      },
    });
  }

  const columns: Column<SavedReport>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{r.name}</p>
          {r.description && (
            <p className="text-xs text-muted-foreground truncate">{r.description}</p>
          )}
        </div>
      ),
    },
    {
      key: "source",
      header: "Based on",
      className: "w-40",
      render: (r) => (
        <Badge variant="outline" className="text-[11px]">
          {DATA_SOURCE_LABELS[r.config.dataSource] || r.config.dataSource}
        </Badge>
      ),
    },
    {
      key: "columns",
      header: "Columns",
      className: "w-24 text-right",
      render: (r) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {r.config.columns?.length ?? 0}
        </span>
      ),
    },
    {
      key: "lastRun",
      header: "Last run",
      className: "w-32",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(lastRunByReport[r.id] ?? null)}
        </span>
      ),
    },
    {
      key: "updated",
      header: "Updated",
      className: "w-32",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{formatDate(r.updatedAt)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28 text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              openRun(r);
            }}
          >
            <Play className="size-3" /> Run
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport(r)}>
                <Download className="size-4" /> Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(r)}>
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  if (initialLoad) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link
        href="/reports"
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader
        title="Saved reports"
        description="Reports you've built and saved. Run one to see the latest data, or export it to a spreadsheet."
      >
        <Button asChild size="sm" className="h-7 text-xs gap-1">
          <Link href="/reports/custom">
            <Plus className="size-3" /> New report
          </Link>
        </Button>
      </PageHeader>

      {loading ? (
        <BrandLoader className="h-48" />
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <BarChart3 className="size-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-medium">No saved reports yet</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Build a custom report from your invoices, contacts, inventory, or transactions and save it here.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/reports/custom">Create a report</Link>
          </Button>
        </div>
      ) : (
        <ContentReveal>
          <DataTable
            columns={columns}
            data={reports}
            loading={false}
            emptyMessage="No saved reports."
            onRowClick={(r) => openRun(r)}
          />
        </ContentReveal>
      )}

      {/* Run results dialog */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{runReportItem?.name || "Report"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {runReportItem
                  ? `Based on ${DATA_SOURCE_LABELS[runReportItem.config.dataSource] || runReportItem.config.dataSource}`
                  : ""}
              </p>
              {runReportItem && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => handleExport(runReportItem)}
                >
                  <Download className="size-3" /> Export CSV
                </Button>
              )}
            </div>

            {running ? (
              <BrandLoader className="h-48" />
            ) : results && runReportItem ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {runReportItem.config.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {runReportItem.config.columns.map((col) => (
                          <td key={col} className="px-3 py-2 text-xs whitespace-nowrap">
                            {String(row[col] ?? "-")}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {results.length === 0 && (
                      <tr>
                        <td
                          colSpan={runReportItem.config.columns.length}
                          className="px-3 py-8 text-center text-xs text-muted-foreground"
                        >
                          No data found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {results.length > 50 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground border-t">
                    Showing 50 of {results.length} rows
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </ContentReveal>
  );
}
