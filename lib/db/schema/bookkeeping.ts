import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

// Enums
export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const entryStatusEnum = pgEnum("entry_status", [
  "draft",
  "posted",
  "void",
]);

export const taxTypeEnum = pgEnum("tax_type", [
  "sales",
  "purchase",
  "both",
]);

// Currency
export const currency = pgTable("currency", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  decimalPlaces: integer("decimal_places").notNull().default(2),
});

// Fiscal Year
export const fiscalYear = pgTable("fiscal_year", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Chart of Accounts
export const chartAccount = pgTable(
  "chart_account",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    subType: text("sub_type"),
    parentId: uuid("parent_id"),
    currencyCode: text("currency_code")
      .notNull()
      .default("USD"),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("chart_account_org_code_idx").on(
      table.organizationId,
      table.code
    ),
  ]
);

// Journal Entry
export const journalEntry = pgTable(
  "journal_entry",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entryNumber: integer("entry_number").notNull(),
    date: date("date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    status: entryStatusEnum("status").notNull().default("draft"),
    fiscalYearId: uuid("fiscal_year_id").references(() => fiscalYear.id),
    sourceType: text("source_type"), // "invoice", "bill", "expense", "bank", "payment", "credit_note", "debit_note", "manual"
    sourceId: uuid("source_id"),
    createdBy: uuid("created_by").references(() => users.id),
    postedAt: timestamp("posted_at", { mode: "date" }),
    voidedAt: timestamp("voided_at", { mode: "date" }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("journal_entry_org_number_idx").on(
      table.organizationId,
      table.entryNumber
    ),
  ]
);

// Cost Center / Department
export const costCenter = pgTable(
  "cost_center",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("cost_center_org_code_idx").on(
      table.organizationId,
      table.code
    ),
  ]
);

// Journal Line
export const journalLine = pgTable("journal_line", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  journalEntryId: uuid("journal_entry_id")
    .notNull()
    .references(() => journalEntry.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => chartAccount.id),
  description: text("description"),
  debitAmount: integer("debit_amount").notNull().default(0),
  creditAmount: integer("credit_amount").notNull().default(0),
  currencyCode: text("currency_code").notNull().default("USD"),
  exchangeRate: integer("exchange_rate").notNull().default(1000000), // 6 decimal places as int (1.000000 = 1000000)
  costCenterId: uuid("cost_center_id").references(() => costCenter.id),
});

// Tax Rate
export const taxRate = pgTable("tax_rate", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rate: integer("rate").notNull(), // basis points: 1000 = 10.00%
  type: taxTypeEnum("type").notNull().default("both"),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Tax Component (for compound taxes)
export const taxComponent = pgTable("tax_component", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  taxRateId: uuid("tax_rate_id")
    .notNull()
    .references(() => taxRate.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  rate: integer("rate").notNull(), // basis points
  accountId: uuid("account_id").references(() => chartAccount.id),
});

// Period Lock - prevents editing entries on or before the lock date
export const periodLock = pgTable(
  "period_lock",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    lockDate: date("lock_date").notNull(),
    lockedBy: uuid("locked_by").references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("period_lock_org_idx").on(table.organizationId),
  ]
);

// Attachment (generalized document)
export const attachment = pgTable("attachment", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  entityType: text("entity_type"), // "journal_entry", "invoice", "bill", "expense"
  entityId: uuid("entity_id"),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const currencyRelations = relations(currency, () => ({}));

export const fiscalYearRelations = relations(fiscalYear, ({ one, many }) => ({
  organization: one(organization, {
    fields: [fiscalYear.organizationId],
    references: [organization.id],
  }),
  journalEntries: many(journalEntry),
}));

export const chartAccountRelations = relations(
  chartAccount,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [chartAccount.organizationId],
      references: [organization.id],
    }),
    parent: one(chartAccount, {
      fields: [chartAccount.parentId],
      references: [chartAccount.id],
      relationName: "parentChild",
    }),
    children: many(chartAccount, { relationName: "parentChild" }),
    journalLines: many(journalLine),
  })
);

export const journalEntryRelations = relations(
  journalEntry,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [journalEntry.organizationId],
      references: [organization.id],
    }),
    fiscalYear: one(fiscalYear, {
      fields: [journalEntry.fiscalYearId],
      references: [fiscalYear.id],
    }),
    createdByUser: one(users, {
      fields: [journalEntry.createdBy],
      references: [users.id],
    }),
    lines: many(journalLine),
    attachments: many(attachment),
  })
);

export const journalLineRelations = relations(journalLine, ({ one }) => ({
  journalEntry: one(journalEntry, {
    fields: [journalLine.journalEntryId],
    references: [journalEntry.id],
  }),
  account: one(chartAccount, {
    fields: [journalLine.accountId],
    references: [chartAccount.id],
  }),
  costCenter: one(costCenter, {
    fields: [journalLine.costCenterId],
    references: [costCenter.id],
  }),
}));

export const costCenterRelations = relations(costCenter, ({ one, many }) => ({
  organization: one(organization, {
    fields: [costCenter.organizationId],
    references: [organization.id],
  }),
  parent: one(costCenter, {
    fields: [costCenter.parentId],
    references: [costCenter.id],
    relationName: "costCenterParentChild",
  }),
  children: many(costCenter, { relationName: "costCenterParentChild" }),
  journalLines: many(journalLine),
}));

export const periodLockRelations = relations(periodLock, ({ one }) => ({
  organization: one(organization, {
    fields: [periodLock.organizationId],
    references: [organization.id],
  }),
  lockedByUser: one(users, {
    fields: [periodLock.lockedBy],
    references: [users.id],
  }),
}));

export const taxRateRelations = relations(taxRate, ({ one, many }) => ({
  organization: one(organization, {
    fields: [taxRate.organizationId],
    references: [organization.id],
  }),
  components: many(taxComponent),
}));

export const taxComponentRelations = relations(taxComponent, ({ one }) => ({
  taxRate: one(taxRate, {
    fields: [taxComponent.taxRateId],
    references: [taxRate.id],
  }),
  account: one(chartAccount, {
    fields: [taxComponent.accountId],
    references: [chartAccount.id],
  }),
}));

export const attachmentRelations = relations(attachment, ({ one }) => ({
  organization: one(organization, {
    fields: [attachment.organizationId],
    references: [organization.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [attachment.journalEntryId],
    references: [journalEntry.id],
  }),
  uploadedByUser: one(users, {
    fields: [attachment.uploadedBy],
    references: [users.id],
  }),
}));
