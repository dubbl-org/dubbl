import {
  pgTable,
  text,
  uuid,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

// Sequence counter table for generating unique document numbers.
// Uses row-level locking (SELECT FOR UPDATE) to prevent duplicates
// under concurrent requests.
export const numberSequence = pgTable(
  "number_sequence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // "invoice", "bill", "quote", etc.
    prefix: text("prefix").notNull(), // "INV", "BILL", "QTE", etc.
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [
    uniqueIndex("number_sequence_org_entity_idx").on(
      table.organizationId,
      table.entityType
    ),
  ]
);
