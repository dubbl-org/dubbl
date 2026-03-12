import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

// Enums
export const planEnum = pgEnum("plan", ["free", "pro", "business"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "past_due",
  "trialing",
  "incomplete",
]);

// Subscription
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripePriceId: text("stripe_price_id"),
    plan: planEnum("plan").notNull().default("free"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start", { mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end")
      .notNull()
      .default(false),
    seatCount: integer("seat_count").notNull().default(1),
    // Enterprise / admin overrides (null = use plan defaults)
    customPlanName: text("custom_plan_name"), // e.g. "Enterprise", "Startup Program"
    overrideMembers: integer("override_members"),
    overrideStorageMb: integer("override_storage_mb"),
    overrideContacts: integer("override_contacts"),
    overrideInvoicesPerMonth: integer("override_invoices_per_month"),
    overrideProjects: integer("override_projects"),
    overrideBankAccounts: integer("override_bank_accounts"),
    overrideCurrencies: integer("override_currencies"),
    overrideEntriesPerMonth: integer("override_entries_per_month"),
    managedBy: text("managed_by").notNull().default("stripe"), // "stripe" or "manual"
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("subscription_org_idx").on(table.organizationId),
  ]
);

// API Keys
export const apiKey = pgTable(
  "api_key",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => organization.id),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("api_key_hash_idx").on(table.keyHash)]
);

// Relations
export const subscriptionRelations = relations(subscription, ({ one }) => ({
  organization: one(organization, {
    fields: [subscription.organizationId],
    references: [organization.id],
  }),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
}));
