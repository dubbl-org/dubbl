/**
 * Multi-sheet workbook helper.
 *
 * Combines several normalized {@link Statement}s into a single XLSX workbook,
 * one worksheet per statement. Useful for packaging a full reporting bundle
 * (e.g. balance sheet + P&L + trial balance) into one downloadable file.
 *
 * Cell rules mirror lib/reports/statement-export.ts: amounts are integer minor
 * units (cents), divided by 100 exactly once at the numeric cell, and text
 * cells are guarded against CSV/formula injection.
 */
import type { Statement } from "@/lib/reports/statement-export";

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

function currencyNumberFormat(currency: string): string {
  const minorUnits = getMinorUnits(currency);
  const decimals = minorUnits > 0 ? "." + "0".repeat(minorUnits) : "";
  return `#,##0${decimals};(#,##0${decimals})`;
}

function centsToNumber(cents: number, currency: string): number {
  return cents / Math.pow(10, getMinorUnits(currency));
}

function sanitizeText(value: string): string {
  const text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function indent(name: string, depth: number): string {
  return depth > 0 ? "  ".repeat(depth) + name : name;
}

/** Column headers for a statement: explicit `columns` or one default header. */
function resolveColumns(statement: Statement): string[] {
  if (statement.columns && statement.columns.length > 0) {
    return statement.columns;
  }
  return [`Amount (${statement.currency})`];
}

function isMultiColumn(statement: Statement): boolean {
  return Boolean(statement.columns && statement.columns.length > 0);
}

/**
 * Per-column amounts for a row/subtotal/grand-total. Single-column mode returns
 * `[scalar ?? 0]`; multi-column returns `amounts` padded/truncated to the column
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

function uniqueSheetName(title: string, used: Set<string>): string {
  const base = (title.replace(/[:\\/?*[\]]/g, " ").trim() || "Report").slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

/** Render multiple statements into one XLSX workbook buffer (one sheet each). */
export async function toWorkbookXlsx(statements: Statement[]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "dubbl";
  wb.created = new Date();

  const usedNames = new Set<string>();

  for (const statement of statements) {
    const ws = wb.addWorksheet(uniqueSheetName(statement.title, usedNames));
    const numFmt = currencyNumberFormat(statement.currency);
    const columnHeaders = resolveColumns(statement);
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

    ws.spliceRows(1, 0, [sanitizeText(statement.title)], [sanitizeText(statement.periodLabel)]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.getRow(2).font = { italic: true, color: { argb: "FF666666" } };
    ws.getRow(3).font = { bold: true };

    const setAmounts = (
      rowValues: Record<string, unknown>,
      amounts: (number | null)[]
    ) => {
      amounts.forEach((a, i) => {
        rowValues[amountKeys[i]] = a === null ? null : centsToNumber(a, statement.currency);
      });
    };
    const formatAmountCells = (dataRow: ReturnType<typeof ws.addRow>) => {
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

      ws.addRow({});
    }

    if (statement.grandTotal !== undefined || statement.grandTotals !== undefined) {
      const values: Record<string, unknown> = { name: "Total" };
      setAmounts(values, resolveAmounts(statement, statement.grandTotal, statement.grandTotals));
      const totalRow = ws.addRow(values);
      totalRow.font = { bold: true, size: 12 };
      formatAmountCells(totalRow);
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
