import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

/**
 * Pure helpers for restoring a backup snapshot: turning JSON records back into
 * insertable rows and working out which foreign keys must wait until the rows
 * they point at have been restored. No database access here (see
 * restoreFromSnapshot in ./backup-snapshot.ts).
 */

type Row = Record<string, unknown>;

/**
 * A snapshot record as a row for `table`: only real columns are kept (relations
 * such as `lines` are dropped) and timestamps, which JSON turned into strings,
 * become Dates again.
 */
export function toInsertRow(table: Table, record: Row): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!(key in record)) continue;
    const value = record[key];
    const isDateObject =
      column.columnType === "PgTimestamp" || column.columnType === "PgDate";
    row[key] =
      isDateObject && typeof value === "string" ? new Date(value) : value;
  }
  return row;
}

/**
 * The columns of `table` that reference a table restored at the same step or
 * later (including itself, such as a reversal pointing at its pair). They're
 * inserted as null and filled in once everything is in. Required (not null)
 * columns can't wait, so the restore order must already satisfy those.
 */
export function deferredColumns(
  table: PgTable,
  step: number,
  stepOf: (table: Table) => number | undefined
): string[] {
  const columns = Object.entries(getTableColumns(table));
  const deferred = new Set<string>();
  for (const fk of getTableConfig(table).foreignKeys) {
    const ref = fk.reference();
    const targetStep = stepOf(ref.foreignTable);
    if (targetStep === undefined || targetStep < step) continue;
    for (const col of ref.columns) {
      const entry = columns.find(([, c]) => c.name === col.name);
      if (entry && !entry[1].notNull) deferred.add(entry[0]);
    }
  }
  return [...deferred];
}

/** Split a row into what can be inserted now and the deferred values to set later. */
export function splitDeferred(row: Row, deferred: string[]): { now: Row; later: Row } {
  const now: Row = { ...row };
  const later: Row = {};
  for (const key of deferred) {
    if (now[key] != null) {
      later[key] = now[key];
      now[key] = null;
    }
  }
  return { now, later };
}

/** Readable "entity record" label for an error message. */
export function describeRecord(table: Table, record: Row): string {
  const label =
    record.invoiceNumber ??
    record.billNumber ??
    record.entryNumber ??
    record.quoteNumber ??
    record.creditNoteNumber ??
    record.debitNoteNumber ??
    record.poNumber ??
    record.paymentNumber ??
    record.code ??
    record.name ??
    record.title ??
    record.id;
  return `${getTableName(table)} ${String(label)}`;
}
