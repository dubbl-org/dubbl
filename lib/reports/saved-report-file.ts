/**
 * Turn saved-report rows into a downloadable or emailed file: CSV, XLSX or
 * PDF. Money columns hold integer minor units and are written as decimal
 * amounts scaled by the row's currency (1250 -> 12.50 USD, 1250 JPY), numeric
 * in spreadsheets. Used by the saved-report export
 * route and the scheduled report emails.
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { SavedReportResult } from "@/lib/reports/saved-report-data";
import { columnLabel } from "@/lib/reports/saved-report-sources";
import { getCurrencyMinorUnits } from "@/lib/currency/iso4217";

export type SavedReportFormat = "csv" | "xlsx" | "pdf";

/** Neutralise values a spreadsheet would read as a formula. */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

type Row = SavedReportResult["rows"][number];

/** Decimal places for a row's money: its own currencyCode, else the org base currency. */
function rowMinorUnits(result: SavedReportResult, row: Row): number {
  const code = typeof row.currencyCode === "string" && row.currencyCode ? row.currencyCode : result.currency;
  return getCurrencyMinorUnits(code);
}

function cellValue(result: SavedReportResult, row: Row, col: string): string | number | null {
  const value = row[col];
  if (value === null || value === undefined) return null;
  if (result.moneyColumns.includes(col)) {
    const n = Number(value);
    return Number.isFinite(n) ? n / Math.pow(10, rowMinorUnits(result, row)) : null;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return value;
  return String(value);
}

function slug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "report";
}

export function savedReportCsv(result: SavedReportResult): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = result.columns.map(columnLabel).map(esc).join(",");
  const lines = result.rows.map((r) =>
    result.columns
      .map((c) => {
        const v = cellValue(result, r, c);
        if (v === null) return "";
        if (typeof v === "number") return result.moneyColumns.includes(c) ? v.toFixed(rowMinorUnits(result, r)) : String(v);
        return esc(safeText(v));
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export async function savedReportXlsx(name: string, result: SavedReportResult): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "dubbl";
  wb.created = new Date();
  const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report");
  ws.columns = result.columns.map((c) => ({ header: columnLabel(c), key: c, width: result.moneyColumns.includes(c) ? 16 : 22 }));
  ws.getRow(1).font = { bold: true };
  const numFmt = (digits: number) => {
    const d = digits > 0 ? "." + "0".repeat(digits) : "";
    return `#,##0${d};(#,##0${d})`;
  };
  for (const r of result.rows) {
    const values: Record<string, unknown> = {};
    for (const c of result.columns) {
      const v = cellValue(result, r, c);
      values[c] = typeof v === "string" ? safeText(v) : v;
    }
    const added = ws.addRow(values);
    const fmt = numFmt(rowMinorUnits(result, r));
    for (const c of result.moneyColumns) added.getCell(c).numFmt = fmt;
  }
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 8, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#6b7280", marginBottom: 12 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#111827", paddingVertical: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 2 },
  cell: { flex: 1, paddingRight: 4 },
  money: { flex: 1, paddingRight: 4, textAlign: "right" },
  bold: { fontFamily: "Helvetica-Bold" },
});

export async function savedReportPdf(name: string, result: SavedReportResult, generatedAt = new Date()): Promise<Buffer> {
  const h = React.createElement;
  const money = (c: string) => result.moneyColumns.includes(c);
  const fmt = (c: string, r: Row) => {
    const x = cellValue(result, r, c);
    if (x === null) return "";
    if (money(c) && typeof x === "number") {
      const digits = rowMinorUnits(result, r);
      return x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    return String(x);
  };
  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: "A4", orientation: result.columns.length > 6 ? "landscape" : "portrait", style: styles.page },
      h(Text, { style: styles.title }, name),
      h(Text, { style: styles.sub }, `Generated ${generatedAt.toISOString().slice(0, 10)} · ${result.rows.length} rows`),
      h(
        View,
        { style: styles.head },
        ...result.columns.map((c) => h(Text, { key: c, style: [money(c) ? styles.money : styles.cell, styles.bold] }, columnLabel(c)))
      ),
      ...result.rows.map((r, i) =>
        h(
          View,
          { key: i, style: styles.row, wrap: false },
          ...result.columns.map((c) => h(Text, { key: c, style: money(c) ? styles.money : styles.cell }, fmt(c, r)))
        )
      )
    )
  ) as Parameters<typeof renderToBuffer>[0];
  return renderToBuffer(doc);
}

/** Build the file for a format: filename, MIME type and content. */
export async function savedReportFile(
  name: string,
  result: SavedReportResult,
  format: SavedReportFormat
): Promise<{ filename: string; contentType: string; content: Buffer }> {
  const base = slug(name);
  if (format === "xlsx") {
    return {
      filename: `${base}.xlsx`,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: await savedReportXlsx(name, result),
    };
  }
  if (format === "pdf") {
    return { filename: `${base}.pdf`, contentType: "application/pdf", content: await savedReportPdf(name, result) };
  }
  return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", content: Buffer.from(savedReportCsv(result), "utf-8") };
}
