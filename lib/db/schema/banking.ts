import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";
import { chartAccount, journalEntry, taxRate } from "./bookkeeping";
import { contact } from "./contacts";

// Enums
export const bankTransactionStatusEnum = pgEnum("bank_transaction_status", [
  "unreconciled",
  "reconciled",
  "excluded",
]);

export const bankReconciliationStatusEnum = pgEnum("bank_reconciliation_status", [
  "in_progress",
  "completed",
]);

export const bankRuleMatchEnum = pgEnum("bank_rule_match", [
  "contains",
  "equals",
  "starts_with",
  "ends_with",
]);

export const bankAccountTypeEnum = pgEnum("bank_account_type", [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "loan",
  "investment",
  "other",
]);

export const bankImportStatusEnum = pgEnum("bank_import_status", [
  "completed",
  "partial",
  "failed",
]);

export const bankImportFormatEnum = pgEnum("bank_import_format", [
  "csv",
  "tsv",
  "qif",
  "ofx",
  "qfx",
  "qbo",
  "camt052",
  "camt053",
  "camt054",
  "mt940",
  "mt942",
  "bai2",
]);

// Bank Account
export const bankAccount = pgTable("bank_account", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  currencyCode: text("currency_code").notNull().default("USD"),
  countryCode: text("country_code"),
  accountType: bankAccountTypeEnum("account_type").notNull().default("checking"),
  color: text("color").notNull().default("#0f766e"),
  chartAccountId: uuid("chart_account_id").references(() => chartAccount.id),
  balance: integer("balance").notNull().default(0),
  lowBalanceThreshold: integer("low_balance_threshold"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const bankImportProfile = pgTable("bank_import_profile", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  dateFormat: text("date_format"),
  decimalSeparator: text("decimal_separator").notNull().default("."),
  thousandSeparator: text("thousand_separator").notNull().default(","),
  timezone: text("timezone").notNull().default("UTC"),
  debitIsNegative: boolean("debit_is_negative").notNull().default(true),
  encoding: text("encoding").notNull().default("utf-8"),
  csvDelimiter: text("csv_delimiter"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const bankStatementImport = pgTable("bank_statement_import", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  format: bankImportFormatEnum("format").notNull(),
  fileName: text("file_name").notNull(),
  contentHash: text("content_hash").notNull(),
  detectedEncoding: text("detected_encoding").notNull().default("utf-8"),
  status: bankImportStatusEnum("status").notNull().default("completed"),
  accountIdentifier: text("account_identifier"),
  statementCurrency: text("statement_currency"),
  statementStartDate: date("statement_start_date"),
  statementEndDate: date("statement_end_date"),
  openingBalance: integer("opening_balance"),
  closingBalance: integer("closing_balance"),
  importedCount: integer("imported_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Bank Transaction
export const bankTransaction = pgTable("bank_transaction", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  amount: integer("amount").notNull(),
  balance: integer("balance"),
  status: bankTransactionStatusEnum("status").notNull().default("unreconciled"),
  reconciliationId: uuid("reconciliation_id").references(() => bankReconciliation.id),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntry.id),
  importId: uuid("import_id").references(() => bankStatementImport.id),
  sourceType: text("source_type").notNull().default("statement_import"),
  externalTransactionId: text("external_transaction_id"),
  statementLineRef: text("statement_line_ref"),
  payee: text("payee"),
  counterparty: text("counterparty"),
  currencyCode: text("currency_code"),
  postedDate: date("posted_date"),
  pending: boolean("pending").notNull().default(false),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  dedupeHash: text("dedupe_hash"),
  // Auto-categorization fields (set by bank rules or manual)
  accountId: uuid("account_id").references(() => chartAccount.id),
  contactId: uuid("contact_id").references(() => contact.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Bank Reconciliation
export const bankReconciliation = pgTable("bank_reconciliation", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccount.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  startBalance: integer("start_balance").notNull().default(0),
  endBalance: integer("end_balance").notNull().default(0),
  status: bankReconciliationStatusEnum("status").notNull().default("in_progress"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Bank Rule - auto-categorize imported transactions
export const bankRule = pgTable("bank_rule", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(0), // higher = checked first
  matchField: text("match_field").notNull().default("description"), // "description" or "reference"
  matchType: bankRuleMatchEnum("match_type").notNull().default("contains"),
  matchValue: text("match_value").notNull(),
  accountId: uuid("account_id").references(() => chartAccount.id),
  contactId: uuid("contact_id").references(() => contact.id),
  taxRateId: uuid("tax_rate_id").references(() => taxRate.id),
  autoReconcile: boolean("auto_reconcile").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

// Relations
export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  organization: one(organization, {
    fields: [bankAccount.organizationId],
    references: [organization.id],
  }),
  chartAccount: one(chartAccount, {
    fields: [bankAccount.chartAccountId],
    references: [chartAccount.id],
  }),
  transactions: many(bankTransaction),
  reconciliations: many(bankReconciliation),
  imports: many(bankStatementImport),
  importProfiles: many(bankImportProfile),
}));

export const bankTransactionRelations = relations(bankTransaction, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankTransaction.bankAccountId],
    references: [bankAccount.id],
  }),
  reconciliation: one(bankReconciliation, {
    fields: [bankTransaction.reconciliationId],
    references: [bankReconciliation.id],
  }),
  journalEntry: one(journalEntry, {
    fields: [bankTransaction.journalEntryId],
    references: [journalEntry.id],
  }),
  import: one(bankStatementImport, {
    fields: [bankTransaction.importId],
    references: [bankStatementImport.id],
  }),
  account: one(chartAccount, {
    fields: [bankTransaction.accountId],
    references: [chartAccount.id],
  }),
  contact: one(contact, {
    fields: [bankTransaction.contactId],
    references: [contact.id],
  }),
  taxRate: one(taxRate, {
    fields: [bankTransaction.taxRateId],
    references: [taxRate.id],
  }),
}));

export const bankReconciliationRelations = relations(bankReconciliation, ({ one, many }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankReconciliation.bankAccountId],
    references: [bankAccount.id],
  }),
  transactions: many(bankTransaction),
}));

export const bankImportProfileRelations = relations(bankImportProfile, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankImportProfile.bankAccountId],
    references: [bankAccount.id],
  }),
}));

export const bankStatementImportRelations = relations(bankStatementImport, ({ one, many }) => ({
  organization: one(organization, {
    fields: [bankStatementImport.organizationId],
    references: [organization.id],
  }),
  bankAccount: one(bankAccount, {
    fields: [bankStatementImport.bankAccountId],
    references: [bankAccount.id],
  }),
  transactions: many(bankTransaction),
}));

export const bankRuleRelations = relations(bankRule, ({ one }) => ({
  organization: one(organization, {
    fields: [bankRule.organizationId],
    references: [organization.id],
  }),
  account: one(chartAccount, {
    fields: [bankRule.accountId],
    references: [chartAccount.id],
  }),
  contact: one(contact, {
    fields: [bankRule.contactId],
    references: [contact.id],
  }),
  taxRate: one(taxRate, {
    fields: [bankRule.taxRateId],
    references: [taxRate.id],
  }),
}));
