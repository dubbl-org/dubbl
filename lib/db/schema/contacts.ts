import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount, taxRate } from "./bookkeeping";

export const contactTypeEnum = pgEnum("contact_type", [
  "customer",
  "supplier",
  "both",
]);

export const contact = pgTable("contact", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
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
  // Bookkeeping defaults
  creditLimit: integer("credit_limit"), // cents, nullable = no limit
  isTaxExempt: boolean("is_tax_exempt").notNull().default(false),
  defaultRevenueAccountId: uuid("default_revenue_account_id").references(() => chartAccount.id),
  defaultExpenseAccountId: uuid("default_expense_account_id").references(() => chartAccount.id),
  defaultTaxRateId: uuid("default_tax_rate_id").references(() => taxRate.id),
  peppolId: text("peppol_id"), // PEPPOL participant identifier
  peppolScheme: text("peppol_scheme"), // e.g. "0088" (EAN), "9925" (VAT)
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const contactPerson = pgTable("contact_person", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contact.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  jobTitle: text("job_title"),
  isPrimary: boolean("is_primary").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const contactRelations = relations(contact, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contact.organizationId],
    references: [organization.id],
  }),
  defaultRevenueAccount: one(chartAccount, {
    fields: [contact.defaultRevenueAccountId],
    references: [chartAccount.id],
    relationName: "contactRevenueAccount",
  }),
  defaultExpenseAccount: one(chartAccount, {
    fields: [contact.defaultExpenseAccountId],
    references: [chartAccount.id],
    relationName: "contactExpenseAccount",
  }),
  defaultTaxRate: one(taxRate, {
    fields: [contact.defaultTaxRateId],
    references: [taxRate.id],
  }),
  people: many(contactPerson),
}));

export const contactPersonRelations = relations(contactPerson, ({ one }) => ({
  contact: one(contact, {
    fields: [contactPerson.contactId],
    references: [contact.id],
  }),
}));
