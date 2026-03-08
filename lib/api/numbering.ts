import { db } from "@/lib/db";
import { numberSequence } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Get next sequential number for an entity type.
 * Uses a sequence table with SELECT FOR UPDATE to prevent
 * duplicate numbers under concurrent requests.
 *
 * Returns formatted string like "INV-00001"
 */
export async function getNextNumber(
  organizationId: string,
  entityType: string,
  _numberColumn: string, // kept for backward compat, unused
  prefix: string
): Promise<string> {
  return await db.transaction(async (tx) => {
    // Try to lock and increment the existing sequence row
    const result = await tx.execute(
      sql`SELECT id, last_number FROM number_sequence WHERE organization_id = ${organizationId} AND entity_type = ${entityType} FOR UPDATE`
    );

    // drizzle execute() returns QueryResult with .rows
    const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
    const existing = rows[0] as { id: string; last_number: number } | undefined;

    if (existing) {
      const next = existing.last_number + 1;
      await tx
        .update(numberSequence)
        .set({ lastNumber: next })
        .where(eq(numberSequence.id, existing.id));
      return `${prefix}-${next.toString().padStart(5, "0")}`;
    }

    // First time for this org+entity: seed from the actual table to handle
    // existing data created before the sequence table existed.
    const tableName = entityTypeToTable(entityType);
    const columnName = entityTypeToColumn(entityType);

    let maxNum = 0;
    if (tableName && columnName) {
      const maxResult = await tx.execute(
        sql.raw(
          `SELECT MAX(CAST(NULLIF(regexp_replace(${columnName}, '^[A-Z]+-', ''), '') AS integer)) as max_num FROM ${tableName} WHERE organization_id = '${organizationId}'`
        )
      );
      const maxRows = Array.isArray(maxResult) ? maxResult : (maxResult as any).rows ?? [];
      maxNum = Number(maxRows[0]?.max_num || 0);
    }

    const next = maxNum + 1;

    await tx.insert(numberSequence).values({
      organizationId,
      entityType,
      prefix,
      lastNumber: next,
    });

    return `${prefix}-${next.toString().padStart(5, "0")}`;
  });
}

function entityTypeToTable(entityType: string): string | null {
  const map: Record<string, string> = {
    invoice: "invoice",
    bill: "bill",
    quote: "quote",
    purchase_order: "purchase_order",
    debit_note: "debit_note",
    credit_note: "credit_note",
    payment: "payment",
  };
  return map[entityType] || null;
}

function entityTypeToColumn(entityType: string): string | null {
  const map: Record<string, string> = {
    invoice: "invoice_number",
    bill: "bill_number",
    quote: "quote_number",
    purchase_order: "po_number",
    debit_note: "debit_note_number",
    credit_note: "credit_note_number",
    payment: "payment_number",
  };
  return map[entityType] || null;
}
