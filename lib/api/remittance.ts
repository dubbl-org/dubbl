import { db } from "@/lib/db";
import { paymentBatch, bill, contact } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { notDeleted } from "@/lib/db/soft-delete";

/**
 * Remittance advice builder for a payment batch, shared by the REST route and
 * the MCP tool.
 *
 * A payment batch holds one item per (bill, supplier) being paid. This groups
 * those items by supplier (contact) and produces a remittance advice — a
 * document each supplier receives listing which of their bills were paid and
 * the amount applied to each. All amounts are integer cents.
 */

export interface RemittanceLine {
  billId: string;
  billNumber: string;
  billDate: string;
  billReference: string | null;
  billTotal: number;
  amountPaid: number;
  currencyCode: string;
}

export interface RemittanceGroup {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  currencyCode: string;
  totalPaid: number;
  lines: RemittanceLine[];
}

export interface BatchRemittance {
  batch: typeof paymentBatch.$inferSelect;
  groups: RemittanceGroup[];
}

export async function buildBatchRemittance(
  organizationId: string,
  batchId: string
): Promise<BatchRemittance | null> {
  const batch = await db.query.paymentBatch.findFirst({
    where: and(
      eq(paymentBatch.id, batchId),
      eq(paymentBatch.organizationId, organizationId),
      notDeleted(paymentBatch.deletedAt)
    ),
    with: { items: true },
  });

  if (!batch) return null;

  // Resolve the bills referenced by the batch so we can list bill numbers,
  // dates and references on the remittance.
  const billIds = batch.items
    .map((i) => i.billId)
    .filter((v): v is string => Boolean(v));
  const billRows = billIds.length
    ? await db
        .select()
        .from(bill)
        .where(
          and(eq(bill.organizationId, organizationId), inArray(bill.id, billIds))
        )
    : [];
  const billsById = new Map(billRows.map((b) => [b.id, b]));

  // Resolve contacts for names/emails.
  const contactIds = Array.from(
    new Set(
      batch.items.map((i) => i.contactId).filter((v): v is string => Boolean(v))
    )
  );
  const contactRows = contactIds.length
    ? await db
        .select()
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            inArray(contact.id, contactIds)
          )
        )
    : [];
  const contactsById = new Map(contactRows.map((c) => [c.id, c]));

  // Group items by supplier.
  const groupMap = new Map<string, RemittanceGroup>();
  for (const item of batch.items) {
    const contactId = item.contactId;
    if (!contactId) continue;
    const c = contactsById.get(contactId);

    let group = groupMap.get(contactId);
    if (!group) {
      group = {
        contactId,
        contactName: c?.name || "Unknown supplier",
        contactEmail: c?.email || null,
        currencyCode: item.currencyCode,
        totalPaid: 0,
        lines: [],
      };
      groupMap.set(contactId, group);
    }

    const b = item.billId ? billsById.get(item.billId) : undefined;
    group.lines.push({
      billId: item.billId || "",
      billNumber: b?.billNumber || "—",
      billDate: b?.issueDate || batch.createdAt.toISOString().slice(0, 10),
      billReference: b?.reference ?? null,
      billTotal: b?.total ?? item.amount,
      amountPaid: item.amount,
      currencyCode: item.currencyCode,
    });
    group.totalPaid += item.amount;
  }

  return { batch, groups: Array.from(groupMap.values()) };
}

/** Resolve the effective payment date for a batch (submitted/completed/created). */
export function resolveBatchPaymentDate(
  batch: typeof paymentBatch.$inferSelect
): string {
  return (
    batch.submittedAt?.toISOString().slice(0, 10) ||
    batch.completedAt?.toISOString().slice(0, 10) ||
    batch.createdAt.toISOString().slice(0, 10)
  );
}
