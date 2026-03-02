import { isNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

/** Where-clause helper: only rows where deletedAt IS NULL */
export function notDeleted(deletedAtColumn: PgColumn) {
  return isNull(deletedAtColumn);
}

/** Returns the set object for soft-deleting a row */
export function softDelete() {
  return { deletedAt: new Date() };
}
