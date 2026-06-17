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

// How a tax rate behaves for input-tax recovery and posting. Drives whether the
// tax on a purchase is reclaimable (input VAT control), absorbed into cost
// (blocked / irrecoverable), self-accounted (reverse charge), or a gross
// non-recoverable US sales tax. See [[bank-feed-bookkeeping-gaps]].
export const taxRateKindEnum = pgEnum("tax_rate_kind", [
  "standard", // normal recoverable VAT/GST (recoverablePercent applies)
  "blocked", // fully irrecoverable input tax (entertainment, certain cars) — absorbed into cost
  "partial_block", // partly recoverable (e.g. 50% car lease) — recoverablePercent applies
  "exempt", // exempt supply — no tax, no recovery
  "reverse_charge", // buyer self-accounts output + input VAT (cross-border B2B, domestic DRC)
  "no_vat", // outside scope / no VAT
  "sales_tax_us", // US sales/use tax — collected gross on sales, non-recoverable on purchases
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
    // Default tax rate applied to lines coded to this account (Xero-style
    // account-driven tax defaulting).
    defaultTaxRateId: uuid("default_tax_rate_id").references(() => taxRate.id),
    // Portion of activity on this account that is tax-disallowable for income
    // tax (add-back), in basis points (10000 = 100% disallowed).
    taxDisallowedPercent: integer("tax_disallowed_percent").notNull().default(0),
    // Optional reporting/report-code mapping for cross-client report packs.
    reportingCode: text("reporting_code"),
    // System control accounts (AR/AP/bank/tax/retained earnings) must not be
    // retyped or deleted.
    isSystem: boolean("is_system").notNull().default(false),
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
    // Auto-reversing journals: if set, a mirror reversing entry is posted on this
    // date (accruals/prepayments). Self-referential links track the pair.
    autoReverseDate: date("auto_reverse_date"),
    reversedByEntryId: uuid("reversed_by_entry_id"),
    reversesEntryId: uuid("reverses_entry_id"),
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
  // Project/job dimension (alongside cost center) for job-costing & tracking
  // reports. Plain uuid (project lives in ./projects) to avoid a schema import
  // cycle; joined by id in queries.
  projectId: uuid("project_id"),
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
  kind: taxRateKindEnum("kind").notNull().default("standard"),
  // Share of input tax that is recoverable, in basis points (10000 = 100%).
  // 0 = fully blocked/absorbed into cost; 5000 = 50% (e.g. UK car lease).
  recoverablePercent: integer("recoverable_percent").notNull().default(10000),
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
    // Stricter advisor/hard lock: staff are blocked at lockDate, advisors (with
    // bypass:period-lock) only at advisorLockDate. Null = same as lockDate.
    advisorLockDate: date("advisor_lock_date"),
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

// Exchange Rate Source
export const exchangeRateSourceEnum = pgEnum("exchange_rate_source", [
  "manual",
  "api",
]);

// Exchange Rate
export const exchangeRate = pgTable(
  "exchange_rate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    baseCurrency: text("base_currency").notNull(),
    targetCurrency: text("target_currency").notNull(),
    rate: integer("rate").notNull(), // 6 decimal places as int (1.000000 = 1000000)
    date: date("date").notNull(),
    source: exchangeRateSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exchange_rate_org_currencies_date_idx").on(
      table.organizationId,
      table.baseCurrency,
      table.targetCurrency,
      table.date
    ),
  ]
);

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

export const exchangeRateRelations = relations(exchangeRate, ({ one }) => ({
  organization: one(organization, {
    fields: [exchangeRate.organizationId],
    references: [organization.id],
  }),
}));

export const taxPeriodTypeEnum = pgEnum("tax_period_type", [
  "monthly",
  "quarterly",
  "annual",
]);

export const taxPeriodStatusEnum = pgEnum("tax_period_status", [
  "open",
  "filed",
  "amended",
]);

// Tax Period - for filing tracking
export const taxPeriod = pgTable("tax_period", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Q1 2026"
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: taxPeriodTypeEnum("type").notNull(),
  status: taxPeriodStatusEnum("status").notNull().default("open"),
  filedAt: timestamp("filed_at", { mode: "date" }),
  filedBy: uuid("filed_by").references(() => users.id),
  filedReference: text("filed_reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Tax Return Line - individual boxes/fields on a tax return
export const taxReturnLine = pgTable("tax_return_line", {
  id: uuid("id").primaryKey().defaultRandom(),
  taxPeriodId: uuid("tax_period_id")
    .notNull()
    .references(() => taxPeriod.id, { onDelete: "cascade" }),
  boxNumber: text("box_number").notNull(),
  label: text("label").notNull(),
  amount: integer("amount").notNull().default(0), // cents
  isCalculated: boolean("is_calculated").notNull().default(true),
  sourceDescription: text("source_description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const taxPeriodRelations = relations(taxPeriod, ({ one, many }) => ({
  organization: one(organization, {
    fields: [taxPeriod.organizationId],
    references: [organization.id],
  }),
  filedByUser: one(users, {
    fields: [taxPeriod.filedBy],
    references: [users.id],
  }),
  lines: many(taxReturnLine),
}));

export const taxReturnLineRelations = relations(taxReturnLine, ({ one }) => ({
  taxPeriod: one(taxPeriod, {
    fields: [taxReturnLine.taxPeriodId],
    references: [taxPeriod.id],
  }),
}));

// Tax Jurisdiction - cached tax rates by location for auto sales tax
export const taxJurisdictionSourceEnum = pgEnum("tax_jurisdiction_source", [
  "manual",
  "api",
]);

export const taxJurisdiction = pgTable(
  "tax_jurisdiction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    country: text("country").notNull(),
    state: text("state"),
    county: text("county"),
    city: text("city"),
    postalCode: text("postal_code"),
    combinedRate: integer("combined_rate").notNull(), // basis points
    stateRate: integer("state_rate").notNull().default(0),
    countyRate: integer("county_rate").notNull().default(0),
    cityRate: integer("city_rate").notNull().default(0),
    specialRate: integer("special_rate").notNull().default(0),
    source: taxJurisdictionSourceEnum("source").notNull().default("manual"),
    lastSyncedAt: timestamp("last_synced_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("tax_jurisdiction_lookup_idx").on(
      table.organizationId,
      table.country,
      table.state,
      table.postalCode
    ),
  ]
);

export const taxJurisdictionRelations = relations(taxJurisdiction, ({ one }) => ({
  organization: one(organization, {
    fields: [taxJurisdiction.organizationId],
    references: [organization.id],
  }),
}));

// Tags - flexible segmentation for transactions
export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6b7280"),
    description: text("description"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("tag_org_name_idx").on(table.organizationId, table.name),
  ]
);

export const entityTag = pgTable(
  "entity_tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(), // "journal_entry", "invoice", "bill", "expense", "contact", "project"
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("entity_tag_unique_idx").on(table.tagId, table.entityType, table.entityId),
  ]
);

export const tagRelations = relations(tag, ({ one, many }) => ({
  organization: one(organization, {
    fields: [tag.organizationId],
    references: [organization.id],
  }),
  entityTags: many(entityTag),
}));

export const entityTagRelations = relations(entityTag, ({ one }) => ({
  tag: one(tag, {
    fields: [entityTag.tagId],
    references: [tag.id],
  }),
}));
