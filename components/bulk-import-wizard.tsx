"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Upload, CheckCircle2, XCircle, Loader2, FileUp, ArrowRight } from "lucide-react";

interface ColumnMapping {
  csvColumn: string;
  targetField: string;
}

interface PreviewRow {
  row: number;
  data: Record<string, unknown>;
  valid: boolean;
  errors: string[];
}

interface BulkImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  targetFields: { key: string; label: string; required?: boolean }[];
  previewEndpoint: string;
  importEndpoint: string;
  onComplete?: () => void;
  columnAliases?: Record<string, string[]>;
}

const STEPS = ["upload", "mapping", "preview", "importing", "results"] as const;

function getStepIndex(step: typeof STEPS[number]) {
  return STEPS.indexOf(step);
}

export function BulkImportWizard({
  open,
  onOpenChange,
  title,
  targetFields,
  previewEndpoint,
  importEndpoint,
  onComplete,
  columnAliases,
}: BulkImportWizardProps) {
  const [step, setStep] = useState<typeof STEPS[number]>("upload");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ processedRows: number; errorRows: number; errorDetails?: Array<{ row: number; error: string }> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orgId = typeof window !== "undefined" ? localStorage.getItem("activeOrgId") || "" : "";

  const reset = useCallback(() => {
    setStep("upload");
    setCsvData([]);
    setCsvHeaders([]);
    setMappings([]);
    setPreview([]);
    setValidCount(0);
    setFileName("");
    setResult(null);
    setDragActive(false);
  }, []);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;

      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      setCsvHeaders(headers);

      const rows = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] || ""; });
        return row;
      });
      setCsvData(rows);

      const autoMappings: ColumnMapping[] = headers.map(h => {
        const hLower = h.toLowerCase();
        let match = targetFields.find(
          f => f.key.toLowerCase() === hLower || f.label.toLowerCase() === hLower
        );
        if (!match && columnAliases) {
          for (const f of targetFields) {
            const aliases = columnAliases[f.key];
            if (aliases?.some(a => a.toLowerCase() === hLower)) {
              match = f;
              break;
            }
          }
        }
        return { csvColumn: h, targetField: match?.key || "" };
      });
      setMappings(autoMappings);
      setStep("mapping");
    };
    reader.readAsText(file);
  }, [targetFields, columnAliases]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) processFile(file);
  }, [processFile]);

  const handlePreview = useCallback(async () => {
    setLoading(true);
    const mappedRows = csvData.map(row => {
      const mapped: Record<string, unknown> = {};
      mappings.forEach(m => {
        if (m.targetField && m.csvColumn) {
          mapped[m.targetField] = row[m.csvColumn];
        }
      });
      return mapped;
    });

    try {
      const res = await fetch(previewEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const data = await res.json();
      setPreview(data.preview || []);
      setValidCount(data.validCount || 0);
      setStep("preview");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [csvData, mappings, previewEndpoint, orgId]);

  const handleImport = useCallback(async () => {
    setStep("importing");
    const mappedRows = csvData.map(row => {
      const mapped: Record<string, unknown> = {};
      mappings.forEach(m => {
        if (m.targetField && m.csvColumn) {
          mapped[m.targetField] = row[m.csvColumn];
        }
      });
      return mapped;
    });

    try {
      const res = await fetch(importEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organization-id": orgId },
        body: JSON.stringify({ fileName, rows: mappedRows }),
      });
      const data = await res.json();
      setResult({
        processedRows: data.job?.processedRows || 0,
        errorRows: data.job?.errorRows || 0,
        errorDetails: data.job?.errorDetails,
      });
      setStep("results");
      onComplete?.();
    } catch {
      setStep("preview");
    }
  }, [csvData, mappings, importEndpoint, orgId, fileName, onComplete]);

  const stepIndex = getStepIndex(step);
  const mappedCount = mappings.filter(m => m.targetField).length;
  const requiredFields = targetFields.filter(f => f.required);
  const mappedRequired = requiredFields.filter(f =>
    mappings.some(m => m.targetField === f.key)
  );
  const allRequiredMapped = mappedRequired.length === requiredFields.length;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {step === "upload" && "Upload a CSV file to get started"}
            {step === "mapping" && `Map columns from ${fileName}`}
            {step === "preview" && "Review data before importing"}
            {step === "importing" && "Import in progress..."}
            {step === "results" && "Import complete"}
          </SheetDescription>
        </SheetHeader>

        {/* Step indicator */}
        {step !== "importing" && (
          <div className="flex items-center gap-1.5 px-1 pt-2 pb-4">
            {(["Upload", "Map", "Preview", "Import"] as const).map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`flex size-6 items-center justify-center rounded-full text-[10px] font-medium transition-colors ${
                  i <= stepIndex
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {i + 1}
                </div>
                <span className={`text-xs ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
                {i < 3 && <ArrowRight className="size-3 text-muted-foreground mx-0.5" />}
              </div>
            ))}
          </div>
        )}

        {/* Upload step */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
                dragActive ? "border-foreground bg-muted" : "border-border hover:border-foreground/30 hover:bg-muted/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <FileUp className="size-6 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">Drop your CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        )}

        {/* Mapping step */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {mappedCount} of {csvHeaders.length} columns mapped
              </p>
              {!allRequiredMapped && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
                  Required fields missing
                </Badge>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg border p-3">
              {csvHeaders.map((header, i) => (
                <div key={header} className="flex items-center gap-2">
                  <span className="w-32 text-xs truncate text-muted-foreground" title={header}>
                    {header}
                  </span>
                  <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                  <Select
                    value={mappings[i]?.targetField || ""}
                    onValueChange={(v) => {
                      const next = [...mappings];
                      next[i] = { csvColumn: header, targetField: v };
                      setMappings(next);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Skip" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Skip</SelectItem>
                      {targetFields.map(f => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label}{f.required ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { reset(); }}>
                Change file
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handlePreview} disabled={loading || !allRequiredMapped}>
                {loading ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                Preview
              </Button>
            </div>
          </div>
        )}

        {/* Preview step */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs gap-1">
                <CheckCircle2 className="size-3" />
                {validCount} valid
              </Badge>
              {preview.length - validCount > 0 && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <XCircle className="size-3" />
                  {preview.length - validCount} invalid
                </Badge>
              )}
            </div>

            <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs">Row</TableHead>
                    <TableHead className="w-12 text-xs" />
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 50).map(p => (
                    <TableRow key={p.row}>
                      <TableCell className="text-xs tabular-nums">{p.row}</TableCell>
                      <TableCell>
                        {p.valid
                          ? <CheckCircle2 className="size-3.5 text-emerald-500" />
                          : <XCircle className="size-3.5 text-destructive" />
                        }
                      </TableCell>
                      <TableCell className="text-[11px] max-w-[200px] truncate text-muted-foreground">
                        {JSON.stringify(p.data).slice(0, 80)}
                      </TableCell>
                      <TableCell className="text-[11px] text-destructive">{p.errors.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setStep("mapping")}>
                Back
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handleImport} disabled={validCount === 0}>
                <Upload className="mr-1.5 size-3.5" />
                Import {validCount} rows
              </Button>
            </div>
          </div>
        )}

        {/* Importing step */}
        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Importing {csvData.length} rows...</p>
          </div>
        )}

        {/* Results step */}
        {step === "results" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-6 rounded-lg border p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 tabular-nums">{result.processedRows}</p>
                <p className="text-[11px] text-muted-foreground">Imported</p>
              </div>
              {result.errorRows > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive tabular-nums">{result.errorRows}</p>
                  <p className="text-[11px] text-muted-foreground">Errors</p>
                </div>
              )}
            </div>

            {result.errorDetails && result.errorDetails.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border p-3 space-y-1">
                {result.errorDetails.map((e, i) => (
                  <p key={i} className="text-[11px] text-destructive">
                    Row {e.row}: {e.error}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button size="sm" className="h-8 text-xs" onClick={() => { reset(); onOpenChange(false); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
