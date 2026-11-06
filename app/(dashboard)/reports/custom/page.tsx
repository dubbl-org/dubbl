"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Plus,
  Play,
  Save,
  Download,
  Trash2,
  MoreHorizontal,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PageHeader } from "@/components/dashboard/page-header";
import { useConfirm } from "@/lib/hooks/use-confirm";
import { useApi } from "@/lib/query/use-api";
import { formatMoney } from "@/lib/money";
import { downloadFile } from "@/components/dashboard/download-link";
import { SAVED_REPORT_SOURCES, columnLabel, type DataSourceInfo } from "@/lib/reports/saved-report-sources";

interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  config: {
    dataSource: string;
    columns: string[];
    filters: { field: string; operator: string; value: string }[];
    groupBy: string[];
    dateRange?: { from: string; to: string };
    chartType?: string;
  };
  createdAt: string;
}

const DATA_SOURCES: Record<string, DataSourceInfo> = SAVED_REPORT_SOURCES;

/** A cell in the preview: money columns hold integer cents. */
function formatCell(col: string, row: Record<string, unknown>, moneyColumns: string[], currency: string): string {
  const v = row[col];
  if (v === null || v === undefined || v === "") return "-";
  if (moneyColumns.includes(col)) {
    const n = Number(v);
    const rowCurrency = typeof row.currencyCode === "string" ? row.currencyCode : currency;
    return Number.isFinite(n) ? formatMoney(n, rowCurrency) : String(v);
  }
  if (col === "percentage") return `${v}%`;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function CustomReportsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: savedData, loading } = useApi<{ reports?: SavedReport[] }>("/api/v1/reports/saved");
  const savedReports = savedData?.reports || [];

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [dataSource, setDataSource] = useState("invoices");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [resultMoney, setResultMoney] = useState<{ moneyColumns: string[]; currency: string }>({ moneyColumns: [], currency: "USD" });
  const [running, setRunning] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function openBuilder() {
    setReportName("");
    setDataSource("invoices");
    setSelectedColumns(DATA_SOURCES.invoices.columns.slice(0, 5));
    setResults(null);
    setBuilderOpen(true);
  }

  async function runReport() {
    setRunning(true);
    try {
      const res = await fetch("/api/v1/reports/run", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          dataSource,
          columns: selectedColumns,
          filters: [],
          groupBy: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to run report");
        setResults([]);
        return;
      }
      setResults(data.data || []);
      setResultMoney({ moneyColumns: data.moneyColumns || [], currency: data.currency || "USD" });
    } catch {
      toast.error("Failed to run report");
    } finally {
      setRunning(false);
    }
  }

  async function saveReport() {
    if (!reportName.trim()) {
      toast.error("Please enter a report name");
      return;
    }
    await fetch("/api/v1/reports/saved", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        name: reportName,
        config: {
          dataSource,
          columns: selectedColumns,
          filters: [],
          groupBy: [],
        },
      }),
    });
    toast.success("Report saved");
    setBuilderOpen(false);
  }

  async function handleDelete(report: SavedReport) {
    await confirm({
      title: `Delete "${report.name}"?`,
      description: "This saved report will be permanently deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await fetch(`/api/v1/reports/saved/${report.id}`, {
          method: "DELETE",
          headers: getHeaders(),
        });
        toast.success("Report deleted");
      },
    });
  }

  async function handleExport(report: SavedReport, format: "csv" | "xlsx" | "pdf") {
    try {
      await downloadFile(`/api/v1/reports/saved/${report.id}/export?format=${format}`, `${report.name}.${format}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export the report");
    }
  }

  const availableColumns = DATA_SOURCES[dataSource]?.columns || [];

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal className="space-y-6">
      <Link href="/reports" className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="size-3.5" /> Back to reports
      </Link>

      <PageHeader title="Custom Reports" description="Build and save custom reports from your data.">
        <Button size="sm" className="h-7 text-xs gap-1" onClick={openBuilder}>
          <Plus className="size-3" />
          New Report
        </Button>
      </PageHeader>

      <ContentReveal>
        {savedReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
              <BarChart3 className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">No custom reports</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a custom report to analyze your data.
            </p>
            <Button size="sm" className="mt-4" onClick={openBuilder}>
              Create Report
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedReports.map((report) => (
              <div key={report.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium truncate">{report.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {DATA_SOURCES[report.config.dataSource]?.label || report.config.dataSource}
                      {" "}· {report.config.columns.length} columns
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="size-7 p-0">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleExport(report, "csv")}>
                        <Download className="size-4" /> Export CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(report, "xlsx")}>
                        <FileSpreadsheet className="size-4" /> Export spreadsheet
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExport(report, "pdf")}>
                        <Download className="size-4" /> Download PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(report)}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-1">
                  {report.config.columns.slice(0, 3).map((col) => (
                    <Badge key={col} variant="outline" className="text-[10px]">{columnLabel(col)}</Badge>
                  ))}
                  {report.config.columns.length > 3 && (
                    <Badge variant="outline" className="text-[10px]">+{report.config.columns.length - 3}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ContentReveal>

      {/* Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Report Builder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Report Name</Label>
                <Input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="Monthly Sales Report" />
              </div>
              <div className="space-y-1.5">
                <Label>Data Source</Label>
                <Select value={dataSource} onValueChange={(v) => {
                  setDataSource(v);
                  setSelectedColumns(DATA_SOURCES[v]?.columns.slice(0, 5) || []);
                  setResults(null);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DATA_SOURCES).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{DATA_SOURCES[dataSource]?.description}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Columns</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableColumns.map((col) => {
                  const selected = selectedColumns.includes(col);
                  return (
                    <button
                      key={col}
                      onClick={() => {
                        setSelectedColumns((prev) =>
                          selected ? prev.filter((c) => c !== col) : [...prev, col]
                        );
                      }}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        selected
                          ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/50 dark:text-brand-400"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {columnLabel(col)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="gap-1" onClick={runReport} disabled={running || selectedColumns.length === 0}>
                <Play className="size-3" />
                {running ? "Running..." : "Run Report"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={saveReport} disabled={!reportName.trim()}>
                <Save className="size-3" />
                Save
              </Button>
            </div>

            {results && (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {selectedColumns.map((col) => (
                        <th key={col} className={`px-3 py-2 text-xs font-medium text-muted-foreground ${resultMoney.moneyColumns.includes(col) ? "text-right" : "text-left"}`}>
                          {columnLabel(col)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {selectedColumns.map((col) => (
                          <td key={col} className={`px-3 py-2 text-xs ${resultMoney.moneyColumns.includes(col) ? "text-right font-mono tabular-nums" : ""}`}>
                            {formatCell(col, row, resultMoney.moneyColumns, resultMoney.currency)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {results.length === 0 && (
                      <tr>
                        <td colSpan={selectedColumns.length} className="px-3 py-8 text-center text-xs text-muted-foreground">
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
            )}
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </ContentReveal>
  );
}
