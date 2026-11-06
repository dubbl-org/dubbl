import { db } from "@/lib/db";
import {
  bill,
  contact,
  entityTag,
  expenseClaim,
  invoice,
  journalEntry,
  project,
  tag,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

/**
 * Shared helpers for attaching tags to records. Used by the REST routes under
 * app/api/v1/tags and the MCP tag tools so both enforce the same rules.
 */

/** The record kinds a tag can be attached to. */
export const TAGGABLE_ENTITY_TYPES = [
  "journal_entry",
  "invoice",
  "bill",
  "expense",
  "contact",
  "project",
] as const;

export type TaggableEntityType = (typeof TAGGABLE_ENTITY_TYPES)[number];

/** A tag as shown on a record. */
export interface RecordTag {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

/**
 * True when the record exists in the organization. Stops a caller from linking
 * its tags to (or probing) another organization's records.
 */
export async function taggableEntityExists(
  organizationId: string,
  entityType: TaggableEntityType,
  entityId: string
): Promise<boolean> {
  let found: { id: string } | undefined;
  switch (entityType) {
    case "journal_entry":
      [found] = await db
        .select({ id: journalEntry.id })
        .from(journalEntry)
        .where(and(eq(journalEntry.id, entityId), eq(journalEntry.organizationId, organizationId)))
        .limit(1);
      break;
    case "invoice":
      [found] = await db
        .select({ id: invoice.id })
        .from(invoice)
        .where(and(eq(invoice.id, entityId), eq(invoice.organizationId, organizationId)))
        .limit(1);
      break;
    case "bill":
      [found] = await db
        .select({ id: bill.id })
        .from(bill)
        .where(and(eq(bill.id, entityId), eq(bill.organizationId, organizationId)))
        .limit(1);
      break;
    case "expense":
      [found] = await db
        .select({ id: expenseClaim.id })
        .from(expenseClaim)
        .where(and(eq(expenseClaim.id, entityId), eq(expenseClaim.organizationId, organizationId)))
        .limit(1);
      break;
    case "contact":
      [found] = await db
        .select({ id: contact.id })
        .from(contact)
        .where(and(eq(contact.id, entityId), eq(contact.organizationId, organizationId)))
        .limit(1);
      break;
    case "project":
      [found] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, entityId), eq(project.organizationId, organizationId)))
        .limit(1);
      break;
  }
  return Boolean(found);
}

/**
 * The organization's (non-deleted) tags attached to each of the given records,
 * keyed by record id, sorted by tag name. Records without tags map to [].
 */
export async function getRecordTags(
  organizationId: string,
  entityType: TaggableEntityType,
  entityIds: string[]
): Promise<Record<string, RecordTag[]>> {
  const result: Record<string, RecordTag[]> = {};
  for (const id of entityIds) result[id] = [];
  if (entityIds.length === 0) return result;

  const rows = await db
    .select({
      entityId: entityTag.entityId,
      id: tag.id,
      name: tag.name,
      color: tag.color,
      description: tag.description,
    })
    .from(entityTag)
    .innerJoin(tag, eq(entityTag.tagId, tag.id))
    .where(
      and(
        eq(tag.organizationId, organizationId),
        isNull(tag.deletedAt),
        eq(entityTag.entityType, entityType),
        inArray(entityTag.entityId, entityIds)
      )
    )
    .orderBy(tag.name);

  for (const r of rows) {
    result[r.entityId]?.push({
      id: r.id,
      name: r.name,
      color: r.color,
      description: r.description,
    });
  }
  return result;
}
