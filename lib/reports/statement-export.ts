/**
 * Normalized financial-statement export.
 *
 * Report routes compute their figures (in integer cents) and map them into the
 * neutral {@link Statement} shape below. This module then serializes a Statement
 * to either XLSX (via exceljs) or PDF (via @react-pdf/renderer) so every report
 * shares one rendering path.
 *
 * Monetary amounts on `StatementRow.amount` / `subtotal` / `grandTotal` are
 * ALWAYS integer minor units (cents). We divide by 100 exactly once, at the
 * cell, so XLSX cells stay numeric (sortable / summable) instead of strings.
 *
 * MULTI-COLUMN statements: a Statement may carry several amount columns (e.g.
 * current vs prior period, or budget vs actual). Set `Statement.columns` to the
 * column headers and provide `amounts: number[]` (aligned to `columns`) on each
 * row / subtotal / grand total instead of the single `amount`. Single-column
 * callers keep using the scalar `amount` and need not set `columns` — both forms
 * are fully supported.
 */
import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

export interface StatementRow {
  /** Optional account code (e.g. "1000"). */
  code?: string;
  /** Row label / account name. */
  name: string;
  /**
   * Single-column amount in integer minor units (cents). Used when the
   * Statement is single-column (no `columns`). Ignored when `amounts` is set.
   */
  amount?: number;
  /**
   * Multi-column amounts in integer minor units (cents), aligned to
   * `Statement.columns`. When present these are rendered as N columns; missing
   * trailing entries are treated as blank.
   */
  amounts?: number[];
  /** Indentation level for nested rows (0 = top level). */
  depth: number;
  /** Render the row emphasised (e.g. a header or running total). */
  bold?: boolean;
}

export interface StatementSection {
  label: string;
  rows: StatementRow[];
  /** Optional single-column section subtotal in integer minor units (cents). */
  subtotal?: number;
  /** Optional multi-column subtotals (cents), aligned to `Statement.columns`. */
  subtotals?: number[];
}

export interface Statement {
  title: string;
  /** Human-readable period, e.g. "1 Jan 2026 – 30 Jun 2026" or "As at 16 Jun 2026". */
  periodLabel: string;
  /** ISO 4217 currency code the figures are expressed in. */
  currency: string;
  /**
   * Optional amount-column headers. When set (length >= 1) the statement is
   * rendered multi-column and rows/subtotals should populate `amounts`/
   * `subtotals`. When omitted, the statement is single-column and uses the
   * scalar `amount`/`subtotal`/`grandTotal`.
   */
  columns?: string[];
  sections: StatementSection[];
  /** Optional single-column bottom-line total in integer minor units (cents). */
  grandTotal?: number;
  /** Optional multi-column bottom-line totals (cents), aligned to `columns`. */
  grandTotals?: number[];
}

/**
 * Normalize a Statement's column headers. Returns the explicit `columns` when
 * the statement is multi-column, otherwise a single default header for the
 * scalar amount path.
 */
function resolveColumns(statement: Statement): string[] {
  if (statement.columns && statement.columns.length > 0) {
    return statement.columns;
  }
  return [`Amount (${statement.currency})`];
}

/** Whether a statement is in multi-column mode. */
function isMultiColumn(statement: Statement): boolean {
  return Boolean(statement.columns && statement.columns.length > 0);
}

/**
 * Resolve the per-column amounts for a row/subtotal/grand-total given the
 * statement mode. In single-column mode returns `[scalar ?? 0]`; in
 * multi-column mode returns the `amounts` array padded/truncated to the column
 * count (missing entries become `null` = blank cell).
 */
function resolveAmounts(
  statement: Statement,
  scalar: number | undefined,
  multi: number[] | undefined
): (number | null)[] {
  if (isMultiColumn(statement)) {
    const cols = statement.columns!.length;
    const out: (number | null)[] = [];
    for (let i = 0; i < cols; i++) {
      const v = multi?.[i];
      out.push(v === undefined ? null : v);
    }
    return out;
  }
  return [scalar ?? 0];
}

/**
 * Number-format mask for a currency, scaled to its real minor units.
 * Excel stores the value as a raw number; this only changes display.
 */
function currencyNumberFormat(currency: string): string {
  const minorUnits = getMinorUnits(currency);
  const decimals = minorUnits > 0 ? "." + "0".repeat(minorUnits) : "";
  // Negatives in parentheses, the accounting convention.
  return `#,##0${decimals};(#,##0${decimals})`;
}

function getMinorUnits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency })
        .resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Scale integer minor units to a real number for a numeric spreadsheet cell. */
function centsToNumber(cents: number, currency: string): number {
  return cents / Math.pow(10, getMinorUnits(currency));
}

/**
 * Neutralize values that a spreadsheet might interpret as a formula.
 * Excel/Sheets treat a leading = + - @ (and tab/CR) as formula triggers; a
 * malicious account name like `=cmd|...` would otherwise execute on open.
 */
function sanitizeText(value: string): string {
  const text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    return "'" + text;
  }
  return text;
}

/** Render a Statement to an XLSX workbook buffer. */
export async function toXlsx(statement: Statement): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "dubbl";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName(statement.title));
  const numFmt = currencyNumberFormat(statement.currency);
  const columnHeaders = resolveColumns(statement);

  // One spreadsheet column per amount column, keyed amount0, amount1, …
  const amountKeys = columnHeaders.map((_, i) => `amount${i}`);
  ws.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Account", key: "name", width: 48 },
    ...columnHeaders.map((header, i) => ({
      header: sanitizeText(header),
      key: amountKeys[i],
      width: 20,
    })),
  ];

  // Title + period banner above the column headers.
  ws.spliceRows(1, 0, [sanitizeText(statement.title)], [sanitizeText(statement.periodLabel)]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.getRow(2).font = { italic: true, color: { argb: "FF666666" } };
  // Header row is now row 3.
  ws.getRow(3).font = { bold: true };

  const setAmounts = (
    rowValues: Record<string, unknown>,
    amounts: (number | null)[]
  ) => {
    amounts.forEach((a, i) => {
      rowValues[amountKeys[i]] = a === null ? null : centsToNumber(a, statement.currency);
    });
  };
  const formatAmountCells = (
    dataRow: ReturnType<typeof ws.addRow>
  ) => {
    for (const key of amountKeys) dataRow.getCell(key).numFmt = numFmt;
  };

  for (const section of statement.sections) {
    const sectionRow = ws.addRow({ name: sanitizeText(section.label) });
    sectionRow.getCell("name").font = { bold: true };

    for (const row of section.rows) {
      const values: Record<string, unknown> = {
        code: row.code ? sanitizeText(row.code) : "",
        name: indent(sanitizeText(row.name), row.depth),
      };
      setAmounts(values, resolveAmounts(statement, row.amount, row.amounts));
      const dataRow = ws.addRow(values);
      formatAmountCells(dataRow);
      if (row.bold) dataRow.font = { bold: true };
    }

    if (section.subtotal !== undefined || section.subtotals !== undefined) {
      const values: Record<string, unknown> = { name: `Total ${section.label}` };
      setAmounts(values, resolveAmounts(statement, section.subtotal, section.subtotals));
      const subtotalRow = ws.addRow(values);
      subtotalRow.font = { bold: true };
      formatAmountCells(subtotalRow);
    }

    // Spacer between sections.
    ws.addRow({});
  }

  if (statement.grandTotal !== undefined || statement.grandTotals !== undefined) {
    const values: Record<string, unknown> = { name: "Total" };
    setAmounts(values, resolveAmounts(statement, statement.grandTotal, statement.grandTotals));
    const totalRow = ws.addRow(values);
    totalRow.font = { bold: true, size: 12 };
    formatAmountCells(totalRow);
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

function indent(name: string, depth: number): string {
  return depth > 0 ? "  ".repeat(depth) + name : name;
}

function sheetName(title: string): string {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  return title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Report";
}

// --- PDF rendering -------------------------------------------------------

const dark = "#111827";
const gray = "#6b7280";
const lightGray = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: dark,
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  period: { fontSize: 10, color: gray, marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: dark,
    paddingBottom: 3,
  },
  row: { flexDirection: "row", paddingVertical: 2 },
  cellCode: { width: 50, color: gray },
  cellName: { flex: 1 },
  cellAmount: { width: 110, textAlign: "right" },
  columnHeaderRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: dark,
    marginBottom: 2,
  },
  cellAmountHeader: { width: 110, textAlign: "right", color: gray },
  subtotalRow: {
    flexDirection: "row",
    paddingVertical: 3,
    marginTop: 2,
    borderTopWidth: 0.5,
    borderTopColor: lightGray,
  },
  grandRow: {
    flexDirection: "row",
    paddingVertical: 4,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: dark,
  },
  bold: { fontFamily: "Helvetica-Bold" },
});

function fmtMoneyPdf(cents: number, currency: string): string {
  const minorUnits = getMinorUnits(currency);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: minorUnits,
      maximumFractionDigits: minorUnits,
    }).format(cents / Math.pow(10, minorUnits));
  } catch {
    return (cents / Math.pow(10, minorUnits)).toFixed(minorUnits);
  }
}

function StatementDocument(statement: Statement): React.ReactElement {
  const h = React.createElement;
  const columnHeaders = resolveColumns(statement);
  const multiColumn = isMultiColumn(statement);

  // Render the N amount cells for a row/subtotal/grand line.
  const amountCells = (
    scalar: number | undefined,
    multi: number[] | undefined,
    bold: boolean
  ): React.ReactElement[] => {
    const amounts = resolveAmounts(statement, scalar, multi);
    const style = bold ? [styles.cellAmount, styles.bold] : styles.cellAmount;
    return amounts.map((a, ci) =>
      h(
        Text,
        { key: `a-${ci}`, style },
        a === null ? "" : fmtMoneyPdf(a, statement.currency)
      )
    );
  };

  // A column header row (only shown for multi-column statements).
  const columnHeaderRow = multiColumn
    ? h(
        View,
        { style: styles.columnHeaderRow },
        h(Text, { style: styles.cellCode }, ""),
        h(Text, { style: styles.cellName }, ""),
        ...columnHeaders.map((header, ci) =>
          h(Text, { key: `h-${ci}`, style: styles.cellAmountHeader }, header)
        )
      )
    : null;

  const sectionEls = statement.sections.map((section, si) => {
    const rowEls = section.rows.map((row, ri) =>
      h(
        View,
        { key: `r-${ri}`, style: styles.row },
        h(Text, { style: styles.cellCode }, row.code ?? ""),
        h(
          Text,
          {
            style: row.bold
              ? [styles.cellName, styles.bold, { marginLeft: row.depth * 10 }]
              : [styles.cellName, { marginLeft: row.depth * 10 }],
          },
          row.name
        ),
        ...amountCells(row.amount, row.amounts, Boolean(row.bold))
      )
    );

    const subtotalEl =
      section.subtotal !== undefined || section.subtotals !== undefined
        ? h(
            View,
            { style: styles.subtotalRow },
            h(Text, { style: styles.cellCode }, ""),
            h(Text, { style: [styles.cellName, styles.bold] }, `Total ${section.label}`),
            ...amountCells(section.subtotal, section.subtotals, true)
          )
        : null;

    return h(
      View,
      { key: `s-${si}` },
      h(Text, { style: styles.sectionLabel }, section.label),
      ...rowEls,
      subtotalEl
    );
  });

  const grandEl =
    statement.grandTotal !== undefined || statement.grandTotals !== undefined
      ? h(
          View,
          { style: styles.grandRow },
          h(Text, { style: styles.cellCode }, ""),
          h(Text, { style: [styles.cellName, styles.bold] }, "Total"),
          ...amountCells(statement.grandTotal, statement.grandTotals, true)
        )
      : null;

  return h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Text, { style: styles.title }, statement.title),
      h(Text, { style: styles.period }, statement.periodLabel),
      columnHeaderRow,
      ...sectionEls,
      grandEl
    )
  );
}

/** Render a Statement to a PDF buffer. */
export async function toPdf(statement: Statement): Promise<Buffer> {
  const doc = StatementDocument(statement) as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(doc);
  return buffer;
}
