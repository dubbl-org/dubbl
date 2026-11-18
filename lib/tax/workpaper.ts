/**
 * Tax return workpaper: the XLSX a reviewer (corporate secretary, accounting
 * firm, IRAS audit) reads instead of a screenshot.
 *
 * Sheets:
 *   1. the return's boxes — box id, official label, amount, where the figure
 *      came from and the plain-English help, so a figure can be traced without
 *      opening the app;
 *   2. the reconciliation — return figure, ledger figure, delta per check;
 *   3. the rate warnings — tax rates whose effective window does not cover the
 *      period (a warning, never a block).
 *
 * Amounts stay integer cents in the Statement and are divided by 100 exactly
 * once at the cell by lib/reports/statements-workbook.ts, so the sheet stays
 * numeric and summable in Excel.
 *
 * Note on columns: `Statement` carries one account-code column, one description
 * column and N amount columns. The source and the help therefore ride in the
 * description cell rather than as extra columns, which keeps each box on one row
 * with its figure.
 */
import type { Statement } from "@/lib/reports/statement-export";
import { toWorkbookXlsx } from "@/lib/reports/statements-workbook";
import type { ComputedBox, ReturnResult } from "@/lib/tax/types";

function periodLabel(result: ReturnResult): string {
  return `${result.period.startDate} to ${result.period.endDate} · ${result.basis} basis · ${result.authority} · ${result.currency}`;
}

function boxDescription(box: ComputedBox): string {
  const parts = [`${box.label} [${box.source}]`];
  if (box.help) parts.push(box.help);
  if (box.optional) parts.push("optional on the form");
  return parts.join(" — ");
}

/** The three workpaper sheets as normalized statements. */
export function returnWorkpaper(result: ReturnResult): Statement[] {
  const label = periodLabel(result);

  const boxes: Statement = {
    title: result.title,
    periodLabel: label,
    currency: result.currency,
    sections: [
      {
        label: "Return boxes",
        rows: result.boxes.map((box) => ({
          code: box.box,
          name: boxDescription(box),
          amount: box.amount,
          depth: 0,
        })),
      },
    ],
  };

  const reconciliation: Statement = {
    title: "Reconciliation",
    periodLabel: label,
    currency: result.currency,
    columns: [
      `Return (${result.currency})`,
      `Ledger (${result.currency})`,
      `Delta (${result.currency})`,
    ],
    sections: [
      {
        label: "Return figure vs ledger figure",
        rows:
          result.reconciliation.length > 0
            ? result.reconciliation.map((row) => ({
                name: row.note ? `${row.label} — ${row.note}` : row.label,
                amounts: [row.returnAmount, row.ledgerAmount, row.delta],
                depth: 0,
              }))
            : [
                {
                  name: "No reconciliation checks apply to this return kind.",
                  depth: 0,
                },
              ],
      },
    ],
  };

  const warnings: Statement = {
    title: "Rate warnings",
    periodLabel: label,
    currency: result.currency,
    columns: ["Rate warnings"],
    sections: [
      {
        label: "Tax rates not in force for this period",
        rows:
          result.rateWarnings.length > 0
            ? result.rateWarnings.map((warning) => ({ name: warning, depth: 0 }))
            : [
                {
                  name: "Every tax rate used is active and in force for this period.",
                  depth: 0,
                },
              ],
      },
    ],
  };

  return [boxes, reconciliation, warnings];
}

/** The workpaper as an XLSX buffer, ready for a download response. */
export async function workpaperXlsx(result: ReturnResult): Promise<Buffer> {
  return toWorkbookXlsx(returnWorkpaper(result));
}
