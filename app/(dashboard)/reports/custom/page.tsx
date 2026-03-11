"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  Plus,
  Play,
  Save,
  Download,
  Trash2,
  MoreHorizontal,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { BrandLoader } from "@/components/dashboard/brand-loader";
import { ContentReveal } from "@/components/ui/content-reveal";
import { useConfirm } from "@/lib/hooks/use-confirm";

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

const DATA_SOURCES: Record<string, { label: string; columns: string[] }> = {
  invoices: {
    label: "Invoices",
    columns: ["invoiceNumber", "contactName", "status", "issueDate", "dueDate", "subtotal", "taxTotal", "total", "amountPaid", "amountDue", "currencyCode"],
  },
  contacts: {
    label: "Contacts",
    columns: ["name", "email", "type", "phone", "paymentTermsDays", "creditLimit"],
  },
  inventory: {
    label: "Inventory",
    columns: ["code", "name", "category", "purchasePrice", "salePrice", "quantityOnHand", "reorderPoint", "isActive"],
  },
  transactions: {
    label: "Transactions",
    columns: ["date", "description", "amount", "status", "payee"],
  },
};

export default function CustomReportsPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [dataSource, setDataSource] = useState("invoices");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null);
  const [running, setRunning] = useState(false);

  function getHeaders() {
    const orgId = localStorage.getItem("activeOrgId") || "";
    return { "x-organization-id": orgId, "Content-Type": "application/json" };
  }

  function fetchReports() {
    fetch("/api/v1/reports/saved", { headers: getHeaders() })
      .then((r) => r.json())
      .then((data) => { if (data.reports) setSavedReports(data.reports); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchReports(); }, []);

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
      setResults(data.data || []);
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
    fetchReports();
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
        fetchReports();
      },
    });
  }

  function handleExport(report: SavedReport) {
    const orgId = localStorage.getItem("activeOrgId") || "";
    window.open(`/api/v1/reports/saved/${report.id}/export?x-organization-id=${orgId}`, "_blank");
  }

  const availableColumns = DATA_SOURCES[dataSource]?.columns || [];

  if (loading) return <BrandLoader />;

  return (
    <ContentReveal>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Custom Reports</h2>
            <p className="text-sm text-muted-foreground">
              Build and save custom reports from your data.
            </p>
          </div>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={openBuilder}>
            <Plus className="size-3" />
            New Report
          </Button>
        </div>

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
                      <DropdownMenuItem onClick={() => handleExport(report)}>
                        <Download className="size-4" /> Export CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => handleDelete(report)}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-1">
                  {report.config.columns.slice(0, 3).map((col) => (
                    <Badge key={col} variant="outline" className="text-[10px]">{col}</Badge>
                  ))}
                  {report.config.columns.length > 3 && (
                    <Badge variant="outline" className="text-[10px]">+{report.config.columns.length - 3}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

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
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {col}
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
                          <th key={col} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.slice(0, 50).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {selectedColumns.map((col) => (
                            <td key={col} className="px-3 py-2 text-xs">
                              {String(row[col] ?? "-")}
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
      </div>
    </ContentReveal>
  );
}
