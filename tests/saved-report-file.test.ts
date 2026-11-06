import { test } from "node:test";
import assert from "node:assert/strict";
import { savedReportCsv } from "../lib/reports/saved-report-file";

test("saved report CSV: money scales by each row's currency minor units", () => {
  const csv = savedReportCsv({
    columns: ["invoiceNumber", "total", "currencyCode"],
    moneyColumns: ["total"],
    currency: "USD",
    rows: [
      { invoiceNumber: "INV-1", total: 1250, currencyCode: "USD" },
      { invoiceNumber: "INV-2", total: 1250, currencyCode: "JPY" },
      { invoiceNumber: "INV-3", total: 1250, currencyCode: "KWD" },
      { invoiceNumber: "INV-4", total: 1250 },
    ],
  });
  const totals = csv.split("\n").slice(1).map((l) => l.split(",")[1]);
  assert.deepEqual(totals, ["12.50", "1250", "1.250", "12.50"]);
});

test("saved report CSV: rows without a currency use the org base currency", () => {
  const csv = savedReportCsv({
    columns: ["month", "net"],
    moneyColumns: ["net"],
    currency: "JPY",
    rows: [{ month: "2026-01", net: 5000 }],
  });
  assert.equal(csv.split("\n")[1], "2026-01,5000");
});
