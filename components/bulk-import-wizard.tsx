"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
  columnAliases?: Record<string, string[]>; // targetField -> CSV column name aliases
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
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "importing" | "results">("upload");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ processedRows: number; errorRows: number; errorDetails?: Array<{ row: number; error: string }> } | null>(null);
  const [loading, setLoading] = useState(false);

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
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

      // Auto-map matching columns (check key/label first, then aliases)
      const autoMappings: ColumnMapping[] = headers.map(h => {
        const hLower = h.toLowerCase();
        // Exact key or label match
        let match = targetFields.find(
          f => f.key.toLowerCase() === hLower || f.label.toLowerCase() === hLower
        );
        // Alias match
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Upload a CSV file to import</p>
              <Input type="file" accept=".csv" onChange={handleFileUpload} className="max-w-xs" />
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Map CSV columns to fields</p>
            <div className="space-y-2">
              {csvHeaders.map((header, i) => (
                <div key={header} className="flex items-center gap-3">
                  <span className="w-40 text-sm truncate">{header}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={mappings[i]?.targetField || ""}
                    onValueChange={(v) => {
                      const next = [...mappings];
                      next[i] = { csvColumn: header, targetField: v };
                      setMappings(next);
                    }}
                  >
                    <SelectTrigger className="w-48">
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={handlePreview} disabled={loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : "Preview"}
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{validCount} valid</Badge>
              <Badge variant="destructive">{preview.length - validCount} invalid</Badge>
            </div>
            <div className="max-h-60 overflow-y-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead className="w-16">Status</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Errors</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.slice(0, 50).map(p => (
                    <TableRow key={p.row}>
                      <TableCell>{p.row}</TableCell>
                      <TableCell>
                        {p.valid ? <CheckCircle2 className="size-4 text-green-500" /> : <XCircle className="size-4 text-red-500" />}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">
                        {JSON.stringify(p.data).slice(0, 80)}
                      </TableCell>
                      <TableCell className="text-xs text-red-500">{p.errors.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                Import {validCount} rows
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Importing...</p>
          </div>
        )}

        {step === "results" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{result.processedRows}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              {result.errorRows > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{result.errorRows}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              )}
            </div>
            {result.errorDetails && result.errorDetails.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border p-3 text-xs">
                {result.errorDetails.map((e, i) => (
                  <p key={i} className="text-red-500">Row {e.row}: {e.error}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
