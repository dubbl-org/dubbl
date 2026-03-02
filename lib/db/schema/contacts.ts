import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization } from "./auth";

export const contactTypeEnum = pgEnum("contact_type", [
  "customer",
  "supplier",
  "both",
]);

export const contact = pgTable("contact", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  taxNumber: text("tax_number"),
  type: contactTypeEnum("type").notNull().default("customer"),
  paymentTermsDays: integer("payment_terms_days").default(30),
  addresses: jsonb("addresses").$type<{
    billing?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };
    shipping?: { line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string };
  }>(),
  notes: text("notes"),
  currencyCode: text("currency_code").default("USD"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const contactRelations = relations(contact, ({ one }) => ({
  organization: one(organization, {
    fields: [contact.organizationId],
    references: [organization.id],
  }),
}));
