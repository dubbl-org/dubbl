import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  primaryKey,
  uniqueIndex,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums
export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
]);

// NextAuth tables
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  isSiteAdmin: boolean("is_site_admin").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    uniqueIndex("accounts_provider_idx").on(
      table.provider,
      table.providerAccountId
    ),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

// Custom Roles for fine-grained permissions
export const customRole = pgTable("custom_role", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Organization & Members
export const organization = pgTable("organization", {
  id: uuid("id")
    .primaryKey()
    .defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  country: text("country"),
  businessType: text("business_type"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  fiscalYearStartMonth: integer("fiscal_year_start_month")
    .notNull()
    .default(1),
  // Bookkeeping compliance fields
  countryCode: text("country_code"),
  taxId: text("tax_id"),
  businessRegistrationNumber: text("business_registration_number"),
  legalEntityType: text("legal_entity_type"),
  addressStreet: text("address_street"),
  addressCity: text("address_city"),
  addressState: text("address_state"),
  addressPostalCode: text("address_postal_code"),
  addressCountry: text("address_country"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  contactWebsite: text("contact_website"),
  defaultPaymentTerms: text("default_payment_terms"),
  industrySector: text("industry_sector"),
  referralSource: text("referral_source"),
  billApprovalThreshold: integer("bill_approval_threshold"), // cents, null = no approval needed
  interestRate: integer("interest_rate"), // basis points, e.g. 500 = 5%
  interestMethod: text("interest_method"), // "simple" or "compound"
  interestGraceDays: integer("interest_grace_days").default(0),
  mileageRate: integer("mileage_rate").default(67), // cents per mile (IRS rate $0.67)
  peppolId: text("peppol_id"), // PEPPOL participant identifier
  peppolScheme: text("peppol_scheme"), // e.g. "0088" (EAN), "9925" (VAT)
  taxLookupEnabled: integer("tax_lookup_enabled").default(0), // 0 = disabled, 1 = enabled
  taxLookupProvider: text("tax_lookup_provider"), // "taxjar", "manual"
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const member = pgTable(
  "member",
  {
    id: uuid("id")
      .primaryKey()
      .defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    customRoleId: uuid("custom_role_id").references(() => customRole.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("member_org_user_idx").on(
      table.organizationId,
      table.userId
    ),
  ]
);

// Organization-level Teams
export const team = pgTable("team", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#3b82f6"),
  defaultRoleId: uuid("default_role_id").references(() => customRole.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const teamMember = pgTable(
  "team_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("team_member_unique_idx").on(table.teamId, table.memberId),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  members: many(member),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  teams: many(team),
}));

export const memberRelations = relations(member, ({ one, many }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(users, { fields: [member.userId], references: [users.id] }),
  customRole: one(customRole, {
    fields: [member.customRoleId],
    references: [customRole.id],
  }),
  teamMemberships: many(teamMember),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, {
    fields: [team.organizationId],
    references: [organization.id],
  }),
  members: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  member: one(member, {
    fields: [teamMember.memberId],
    references: [member.id],
  }),
}));

export const customRoleRelations = relations(customRole, ({ one, many }) => ({
  organization: one(organization, {
    fields: [customRole.organizationId],
    references: [organization.id],
  }),
  members: many(member),
}));
