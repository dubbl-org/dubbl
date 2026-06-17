import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { chartAccount, taxRate, costCenter } from "./bookkeeping";

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
]);

export const recurringStatusEnum = pgEnum("recurring_status", [
  "active",
  "paused",
  "completed",
]);

// Recurring transaction template
export const recurringTemplate = pgTable("recurring_template", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // "invoice" | "bill" | "expense" | "journal"
  // Journal templates have no counterparty; contact is nullable so a
  // type='journal' template can materialize a manual journal entry on a
  // schedule without a contact. Invoice/bill/expense templates still require
  // one (enforced in the create route).
  contactId: uuid("contact_id").references(() => contact.id),
  frequency: recurringFrequencyEnum("frequency").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // nullable = run indefinitely
  nextRunDate: date("next_run_date").notNull(),
  lastRunDate: date("last_run_date"),
  occurrencesGenerated: integer("occurrences_generated").notNull().default(0),
  maxOccurrences: integer("max_occurrences"), // nullable = unlimited
  status: recurringStatusEnum("status").notNull().default("active"),
  reference: text("reference"),
  notes: text("notes"),
  currencyCode: text("currency_code").notNull().default("USD"),
  // Recurring-invoice automation. When autoSend is true the generator posts the
  // invoice GL (status -> sent) and runs the existing send pipeline (email) on
  // each occurrence. createAsApproved (a.k.a. create-as-approved) likewise posts
  // the GL and marks the invoice sent, but WITHOUT emailing — useful for
  // back-office invoices that should hit the ledger immediately but be delivered
  // out of band. Both default false (legacy: generate as draft). Only meaningful
  // for type='invoice'.
  autoSend: boolean("auto_send").notNull().default(false),
  createAsApproved: boolean("create_as_approved").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Template line items
export const recurringTemplateLine = pgTable("recurring_template_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => recurringTemplate.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(100), // 2 decimal as int
  unitPrice: integer("unit_price").notNull().default(0), // cents
  accountId: uuid("account_id").references(() => chartAccount.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  discountPercent: integer("discount_percent").notNull().default(0), // basis points: 1000 = 10%
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
  // Journal-template legs (type='journal'). The line's debit/credit (integer
  // cents) is posted verbatim to `accountId`; quantity/unitPrice/tax/discount
  // are ignored for journal templates. Default 0 keeps invoice/bill/expense
  // templates (which use quantity*unitPrice) unaffected.
  debitAmount: integer("debit_amount").notNull().default(0),
  creditAmount: integer("credit_amount").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Relations
export const recurringTemplateRelations = relations(recurringTemplate, ({ one, many }) => ({
  organization: one(organization, {
    fields: [recurringTemplate.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [recurringTemplate.contactId],
    references: [contact.id],
  }),
  createdByUser: one(users, {
    fields: [recurringTemplate.createdBy],
    references: [users.id],
  }),
  lines: many(recurringTemplateLine),
}));

export const recurringTemplateLineRelations = relations(recurringTemplateLine, ({ one }) => ({
  template: one(recurringTemplate, {
    fields: [recurringTemplateLine.templateId],
    references: [recurringTemplate.id],
  }),
  account: one(chartAccount, {
    fields: [recurringTemplateLine.accountId],
    references: [chartAccount.id],
  }),
  taxRate: one(taxRate, {
    fields: [recurringTemplateLine.taxRateId],
    references: [taxRate.id],
  }),
  costCenter: one(costCenter, {
    fields: [recurringTemplateLine.costCenterId],
    references: [costCenter.id],
  }),
}));
