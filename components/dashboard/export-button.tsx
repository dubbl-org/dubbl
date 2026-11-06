"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportButtonProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>[];
  columns: string[];
  /**
   * Columns holding integer cents. They are written as decimal amounts
   * (1250 → 12.50) so the file opens with real money values in a spreadsheet.
   */
  moneyColumns?: string[];
  filename?: string;
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toMoneyValue(value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;
  const n = Number(value);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : value;
}

export function ExportButton({ data, columns, moneyColumns = [], filename = "export" }: ExportButtonProps) {
  const handleExport = () => {
    if (data.length === 0) return;

    const header = columns.join(",");
    const rows = data.map((row) =>
      columns
        .map((col) => toCsvValue(moneyColumns.includes(col) ? toMoneyValue(row[col]) : row[col]))
        .join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={data.length === 0}
    >
      <Download className="mr-1.5 size-3.5" />
      Export CSV
    </Button>
  );
}
