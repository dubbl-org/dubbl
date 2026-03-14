import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { organization, users } from "./auth";
import { chartAccount } from "./bookkeeping";
import { bankAccount } from "./banking";

// Stripe Integration (multiple per org)
export const stripeIntegration = pgTable(
  "stripe_integration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(), // "acct_xxx"
    label: text("label").notNull().default("Default"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    livemode: boolean("livemode").notNull().default(false),
    scope: text("scope"),
    webhookEndpointId: text("webhook_endpoint_id"),
    webhookSecret: text("webhook_secret"),
    status: text("status").notNull().default("active"), // "active" | "disconnected" | "error"
    errorMessage: text("error_message"),
    lastError: text("last_error"),
    // Account mapping FKs
    clearingAccountId: uuid("clearing_account_id").references(() => chartAccount.id),
    revenueAccountId: uuid("revenue_account_id").references(() => chartAccount.id),
    feesAccountId: uuid("fees_account_id").references(() => chartAccount.id),
    payoutBankAccountId: uuid("payout_bank_account_id").references(() => bankAccount.id),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    initialSyncCompleted: boolean("initial_sync_completed").notNull().default(false),
    initialSyncDays: integer("initial_sync_days").notNull().default(30),
    connectedBy: uuid("connected_by").references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("stripe_integration_account_active_idx")
      .on(table.stripeAccountId)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// Stripe Entity Map (idempotency + linking)
export const stripeEntityMap = pgTable(
  "stripe_entity_map",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeEntityType: text("stripe_entity_type").notNull(), // "charge" | "customer" | "payout" | "refund"
    stripeEntityId: text("stripe_entity_id").notNull(), // "ch_xxx", "cus_xxx", etc.
    dubblEntityType: text("dubbl_entity_type").notNull(), // "journal_entry" | "contact" | "payment"
    dubblEntityId: uuid("dubbl_entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stripe_entity_map_unique_idx").on(
      table.organizationId,
      table.stripeEntityType,
      table.stripeEntityId
    ),
  ]
);

// Stripe Sync Log (audit + idempotency)
export const stripeSyncLog = pgTable(
  "stripe_sync_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    integrationId: uuid("integration_id")
      .notNull()
      .references(() => stripeIntegration.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    stripeEventId: text("stripe_event_id"), // unique with integrationId where NOT NULL
    status: text("status").notNull(), // "success" | "failed" | "skipped"
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stripe_sync_log_event_idx").on(
      table.integrationId,
      table.stripeEventId
    ),
  ]
);

// Relations
export const stripeIntegrationRelations = relations(stripeIntegration, ({ one, many }) => ({
  organization: one(organization, {
    fields: [stripeIntegration.organizationId],
    references: [organization.id],
  }),
  connectedByUser: one(users, {
    fields: [stripeIntegration.connectedBy],
    references: [users.id],
  }),
  clearingAccount: one(chartAccount, {
    fields: [stripeIntegration.clearingAccountId],
    references: [chartAccount.id],
    relationName: "stripeClearingAccount",
  }),
  revenueAccount: one(chartAccount, {
    fields: [stripeIntegration.revenueAccountId],
    references: [chartAccount.id],
    relationName: "stripeRevenueAccount",
  }),
  feesAccount: one(chartAccount, {
    fields: [stripeIntegration.feesAccountId],
    references: [chartAccount.id],
    relationName: "stripeFeesAccount",
  }),
  payoutBankAccount: one(bankAccount, {
    fields: [stripeIntegration.payoutBankAccountId],
    references: [bankAccount.id],
  }),
  syncLogs: many(stripeSyncLog),
}));

export const stripeEntityMapRelations = relations(stripeEntityMap, ({ one }) => ({
  organization: one(organization, {
    fields: [stripeEntityMap.organizationId],
    references: [organization.id],
  }),
}));

export const stripeSyncLogRelations = relations(stripeSyncLog, ({ one }) => ({
  integration: one(stripeIntegration, {
    fields: [stripeSyncLog.integrationId],
    references: [stripeIntegration.id],
  }),
}));
