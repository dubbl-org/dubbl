import { test } from "node:test";
import assert from "node:assert/strict";
import type { Table } from "drizzle-orm";
import { toInsertRow, deferredColumns, splitDeferred, describeRecord } from "../lib/api/backup-restore";
import { invoice, invoiceLine, contact, taxRate, taxComponent, chartAccount } from "../lib/db/schema";

test("toInsertRow drops relations and turns JSON timestamps back into Dates", () => {
  const row = toInsertRow(invoice, {
    id: "i1",
    invoiceNumber: "INV-1",
    issueDate: "2026-01-31",
    total: 12500,
    createdAt: "2026-01-31T10:00:00.000Z",
    lines: [{ id: "l1" }],
    contact: { id: "c1" },
  });
  assert.equal(row.lines, undefined);
  assert.equal(row.contact, undefined);
  assert.ok(row.createdAt instanceof Date);
  assert.equal((row.createdAt as Date).toISOString(), "2026-01-31T10:00:00.000Z");
  // date-only columns stay strings, amounts stay integer cents
  assert.equal(row.issueDate, "2026-01-31");
  assert.equal(row.total, 12500);
});

test("deferredColumns waits on links to tables restored at the same step or later", () => {
  const steps = new Map<Table, number>([
    [taxRate, 0],
    [taxComponent, 0.5],
    [chartAccount, 2],
    [contact, 3],
    [invoice, 9],
    [invoiceLine, 9.5],
  ]);
  const stepOf = (t: Table) => steps.get(t);
  // Tax rates come before accounts, so a component's account link waits
  assert.deepEqual(deferredColumns(taxComponent, 0.5, stepOf), ["accountId"]);
  // An invoice's contact is already restored
  assert.ok(!deferredColumns(invoice, 9, stepOf).includes("contactId"));
  // A line's own invoice comes first, so it's never deferred
  assert.ok(!deferredColumns(invoiceLine, 9.5, stepOf).includes("invoiceId"));
});

test("splitDeferred nulls deferred links and keeps them for later", () => {
  const { now, later } = splitDeferred(
    { id: "a", reversesEntryId: "b", reversedByEntryId: null },
    ["reversesEntryId", "reversedByEntryId"]
  );
  assert.equal(now.reversesEntryId, null);
  assert.deepEqual(later, { reversesEntryId: "b" });
});

test("describeRecord names the record by its number", () => {
  assert.equal(describeRecord(invoice, { id: "x", invoiceNumber: "INV-7" }), "invoice INV-7");
});
