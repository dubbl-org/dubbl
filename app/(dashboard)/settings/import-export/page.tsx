"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContentReveal } from "@/components/ui/content-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { BulkImportWizard } from "@/components/bulk-import-wizard";
import { getMapping, aliasesToRecord } from "@/lib/import-export/mappings";
import type { SourceSystem, ImportEntity } from "@/lib/import-export/types";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Users,
  Receipt,
  ClipboardList,
  BookOpen,
  Package,
  Landmark,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

const SOURCES: { key: SourceSystem; label: string }[] = [
  { key: "quickbooks", label: "QuickBooks" },
  { key: "xero", label: "Xero" },
  { key: "freshbooks", label: "FreshBooks" },
  { key: "wave", label: "Wave" },
  { key: "custom", label: "Custom CSV" },
];

const ENTITIES: {
  key: ImportEntity;
  label: string;
  icon: typeof FileSpreadsheet;
  note: string;
  previewEndpoint: string;
  importEndpoint: string;
  targetFields: { key: string; label: string; required?: boolean }[];
}[] = [
  {
    key: "accounts",
    label: "Chart of Accounts",
    icon: BookOpen,
    note: "No dependencies",
    previewEndpoint: "/api/v1/bulk/accounts/preview",
    importEndpoint: "/api/v1/bulk/accounts/import",
    targetFields: [
      { key: "code", label: "Code", required: true },
      { key: "name", label: "Name", required: true },
      { key: "type", label: "Type", required: true },
      { key: "subType", label: "Sub Type" },
      { key: "description", label: "Description" },
    ],
  },
  {
    key: "contacts",
    label: "Contacts",
    icon: Users,
    note: "No dependencies",
    previewEndpoint: "/api/v1/bulk/contacts/preview",
    importEndpoint: "/api/v1/bulk/contacts/import",
    targetFields: [
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "type", label: "Type" },
      { key: "taxNumber", label: "Tax Number" },
      { key: "billingLine1", label: "Billing Address" },
      { key: "billingCity", label: "Billing City" },
      { key: "billingState", label: "Billing State" },
      { key: "billingPostalCode", label: "Billing Postal Code" },
      { key: "billingCountry", label: "Billing Country" },
    ],
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    note: "Import accounts first",
    previewEndpoint: "/api/v1/bulk/products/preview",
    importEndpoint: "/api/v1/bulk/products/import",
    targetFields: [
      { key: "name", label: "Name", required: true },
      { key: "sku", label: "SKU" },
      { key: "description", label: "Description" },
      { key: "unitPrice", label: "Unit Price" },
      { key: "costPrice", label: "Cost Price" },
      { key: "type", label: "Type" },
      { key: "quantityOnHand", label: "Quantity On Hand" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    icon: Receipt,
    note: "Import contacts + accounts first",
    previewEndpoint: "/api/v1/bulk/invoices/preview",
    importEndpoint: "/api/v1/bulk/invoices/import",
    targetFields: [
      { key: "contactId", label: "Contact ID", required: true },
      { key: "issueDate", label: "Issue Date", required: true },
      { key: "dueDate", label: "Due Date", required: true },
      { key: "reference", label: "Reference" },
    ],
  },
  {
    key: "bills",
    label: "Bills",
    icon: ClipboardList,
    note: "Import contacts + accounts first",
    previewEndpoint: "/api/v1/bulk/bills/preview",
    importEndpoint: "/api/v1/bulk/bills/import",
    targetFields: [
      { key: "billNumber", label: "Bill Number" },
      { key: "contactName", label: "Contact Name", required: true },
      { key: "issueDate", label: "Issue Date", required: true },
      { key: "dueDate", label: "Due Date", required: true },
      { key: "lineDescription", label: "Line Description", required: true },
      { key: "lineQuantity", label: "Line Quantity" },
      { key: "lineUnitPrice", label: "Line Unit Price" },
      { key: "lineAmount", label: "Line Amount" },
      { key: "lineAccountCode", label: "Line Account Code" },
    ],
  },
  {
    key: "entries",
    label: "Journal Entries",
    icon: FileSpreadsheet,
    note: "Import accounts first",
    previewEndpoint: "/api/v1/bulk/entries/preview",
    importEndpoint: "/api/v1/bulk/entries/import",
    targetFields: [
      { key: "entryNumber", label: "Entry Number" },
      { key: "date", label: "Date", required: true },
      { key: "description", label: "Description", required: true },
      { key: "reference", label: "Reference" },
      { key: "lineAccountCode", label: "Account Code", required: true },
      { key: "debit", label: "Debit" },
      { key: "credit", label: "Credit" },
    ],
  },
  {
    key: "bank-transactions",
    label: "Bank Transactions",
    icon: Landmark,
    note: "Import accounts first",
    previewEndpoint: "/api/v1/bulk/bank-transactions/preview",
    importEndpoint: "/api/v1/bulk/bank-transactions/import",
    targetFields: [
      { key: "date", label: "Date", required: true },
      { key: "description", label: "Description", required: true },
      { key: "amount", label: "Amount", required: true },
      { key: "reference", label: "Reference" },
      { key: "bankAccountCode", label: "Bank Account", required: true },
      { key: "debit", label: "Debit" },
      { key: "credit", label: "Credit" },
    ],
  },
];

const EXPORT_ENTITIES = [
  { key: "accounts", label: "Chart of Accounts", transactional: false },
  { key: "contacts", label: "Contacts", transactional: false },
  { key: "invoices", label: "Invoices", transactional: true },
  { key: "bills", label: "Bills", transactional: true },
  { key: "entries", label: "Journal Entries", transactional: true },
  { key: "products", label: "Products", transactional: false },
  { key: "bank-transactions", label: "Bank Transactions", transactional: true },
];

interface ImportJob {
  id: string;
  type: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
}

export default function ImportExportPage() {
  const [source, setSource] = useState<SourceSystem>("quickbooks");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeEntity, setActiveEntity] = useState<typeof ENTITIES[number] | null>(null);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  // Export state
  const [selectedExports, setSelectedExports] = useState<Set<string>>(new Set());
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") || "" : "";

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/bulk/import-jobs?" + new URLSearchParams({ limit: "20" }), {
        headers: { "x-organization-id": orgId },
      });
      if (res.ok) {
        const data = await res.json();
        setImportJobs(data.jobs || []);
      }
    } catch {
      // ignore
    } finally {
      setJobsLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleEntityClick = (entity: typeof ENTITIES[number]) => {
    setActiveEntity(entity);
    setWizardOpen(true);
  };

  const columnAliases = activeEntity
    ? aliasesToRecord(getMapping(source, activeEntity.key))
    : undefined;

  const handleExport = async (entityKey?: string) => {
    setExporting(true);
    try {
      const entities = entityKey ? [entityKey] : Array.from(selectedExports);
      if (entities.length === 0) {
        toast.error("Select at least one entity to export");
        return;
      }

      if (!entityKey && entities.length > 1) {
        const params = new URLSearchParams();
        if (exportDateFrom) params.set("startDate", exportDateFrom);
        if (exportDateTo) params.set("endDate", exportDateTo);

        const res = await fetch(`/api/v1/export/all?${params}`, {
          headers: { "x-organization-id": orgId },
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        downloadBlob(blob, "dubbl-export.zip");
      } else {
        const key = entities[0];
        const params = new URLSearchParams();
        if (exportDateFrom) params.set("startDate", exportDateFrom);
        if (exportDateTo) params.set("endDate", exportDateTo);

        const res = await fetch(`/api/v1/export/${key}?${params}`, {
          headers: { "x-organization-id": orgId },
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        downloadBlob(blob, `${key}.csv`);
      }
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const toggleExport = (key: string) => {
    setSelectedExports(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllExports = () => {
    setSelectedExports(new Set(EXPORT_ENTITIES.map(e => e.key)));
  };

  const hasTransactionalSelected = Array.from(selectedExports).some(
    k => EXPORT_ENTITIES.find(e => e.key === k)?.transactional
  );

  return (
    <ContentReveal>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Import & Export</h2>
            <p className="text-sm text-muted-foreground">
              Migrate data from other bookkeeping tools or export your Dubbl data
            </p>
          </div>
        </div>

        {/* Import Section */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Import Data</h3>
          </div>

          {/* Source selector */}
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm text-muted-foreground">Select your source system</p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map(s => (
                <Button
                  key={s.key}
                  variant={source === s.key ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSource(s.key)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Entity grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ENTITIES.map(entity => {
              const Icon = entity.icon;
              return (
                <button
                  key={entity.key}
                  onClick={() => handleEntityClick(entity)}
                  className="group flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all hover:bg-muted hover:border-foreground/20"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{entity.label}</p>
                    <p className="text-[11px] text-muted-foreground">{entity.note}</p>
                  </div>
                  <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>

          {/* Import history */}
          {jobsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : importJobs.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Recent Imports</h4>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importJobs.map(job => (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {job.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {job.fileName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {job.status === "completed" ? (
                              <CheckCircle2 className="size-3.5 text-emerald-500" />
                            ) : job.status === "failed" ? (
                              <XCircle className="size-3.5 text-destructive" />
                            ) : (
                              <Clock className="size-3.5 text-muted-foreground" />
                            )}
                            <span className="text-xs capitalize">{job.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {job.processedRows}/{job.totalRows}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {job.errorRows || "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(job.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t" />

        {/* Export Section */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Export Data</h3>
          </div>

          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Select entities to export as CSV</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={selectAllExports}
              >
                Select all
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {EXPORT_ENTITIES.map(entity => (
                <Label
                  key={entity.key}
                  className="flex items-center gap-2.5 cursor-pointer text-sm font-normal"
                >
                  <Checkbox
                    checked={selectedExports.has(entity.key)}
                    onCheckedChange={() => toggleExport(entity.key)}
                  />
                  <span>{entity.label}</span>
                  {entity.transactional && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground">
                      date range
                    </Badge>
                  )}
                </Label>
              ))}
            </div>

            {/* Date range */}
            {hasTransactionalSelected && (
              <div className="flex items-end gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <DatePicker
                    value={exportDateFrom}
                    onChange={setExportDateFrom}
                    placeholder="Start date"
                    className="w-[180px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <DatePicker
                    value={exportDateTo}
                    onChange={setExportDateTo}
                    placeholder="End date"
                    className="w-[180px]"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleExport()}
                disabled={exporting || selectedExports.size === 0}
              >
                <Download className="mr-1.5 size-3.5" />
                {exporting ? "Exporting..." : "Export Selected"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  selectAllExports();
                  handleExport("all");
                }}
                disabled={exporting}
              >
                Export All as ZIP
              </Button>
            </div>
          </div>
        </div>

        {/* Import Wizard */}
        {activeEntity && (
          <BulkImportWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            title={`Import ${activeEntity.label} from ${SOURCES.find(s => s.key === source)?.label || source}`}
            targetFields={activeEntity.targetFields}
            previewEndpoint={activeEntity.previewEndpoint}
            importEndpoint={activeEntity.importEndpoint}
            columnAliases={columnAliases}
            source={source}
            onComplete={fetchJobs}
          />
        )}
      </div>
    </ContentReveal>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
