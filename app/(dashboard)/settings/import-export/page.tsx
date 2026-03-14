"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Calendar,
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
        // Export all as ZIP
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
        // Single entity export
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

  return (
    <ContentReveal>
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold">Import & Export</h2>
          <p className="text-sm text-muted-foreground">
            Migrate data from other bookkeeping tools or export your Dubbl data
          </p>
        </div>

        {/* Import Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Import</h3>

          {/* Source selector */}
          <div>
            <p className="mb-2 text-sm text-muted-foreground">Select your source system</p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map(s => (
                <button
                  key={s.key}
                  onClick={() => setSource(s.key)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    source === s.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Entity grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ENTITIES.map(entity => {
              const Icon = entity.icon;
              return (
                <button
                  key={entity.key}
                  onClick={() => handleEntityClick(entity)}
                  className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted"
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{entity.label}</p>
                    <p className="text-xs text-muted-foreground">{entity.note}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Import history */}
          <div>
            <h4 className="mb-2 text-sm font-medium">Import History</h4>
            {jobsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : importJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No imports yet</p>
            ) : (
              <div className="rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rows</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importJobs.map(job => (
                      <TableRow key={job.id}>
                        <TableCell className="capitalize">{job.type}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs">{job.fileName}</TableCell>
                        <TableCell>
                          <Badge variant={job.status === "completed" ? "secondary" : job.status === "failed" ? "destructive" : "outline"}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{job.processedRows}/{job.totalRows}</TableCell>
                        <TableCell>{job.errorRows || "-"}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(job.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Export</h3>

          <div className="space-y-3">
            {EXPORT_ENTITIES.map(entity => (
              <label key={entity.key} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selectedExports.has(entity.key)}
                  onCheckedChange={() => toggleExport(entity.key)}
                />
                <span className="text-sm">{entity.label}</span>
                {entity.transactional && (
                  <Calendar className="size-3 text-muted-foreground" />
                )}
              </label>
            ))}
          </div>

          {/* Date range for transactional data */}
          {Array.from(selectedExports).some(k => EXPORT_ENTITIES.find(e => e.key === k)?.transactional) && (
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">Date range:</label>
              <input
                type="date"
                value={exportDateFrom}
                onChange={e => setExportDateFrom(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={exportDateTo}
                onChange={e => setExportDateTo(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-sm"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => handleExport()}
              disabled={exporting || selectedExports.size === 0}
            >
              <Download className="mr-2 size-4" />
              Export Selected
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedExports(new Set(EXPORT_ENTITIES.map(e => e.key)));
                handleExport("all");
              }}
              disabled={exporting}
            >
              Export All
            </Button>
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
