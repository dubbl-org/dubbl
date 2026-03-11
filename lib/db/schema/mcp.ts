import {
  pgTable,
  text,
  uuid,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

// MCP OAuth Client - dynamic client registration
export const mcpOAuthClient = pgTable(
  "mcp_oauth_client",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    clientSecret: text("client_secret"), // hashed, nullable for public clients
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    clientName: text("client_name"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mcp_oauth_client_client_id_idx").on(table.clientId)]
);

// MCP OAuth Authorization Code - short-lived
export const mcpOAuthCode = pgTable(
  "mcp_oauth_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
    scopes: text("scopes"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mcp_oauth_code_hash_idx").on(table.codeHash)]
);

// MCP Access Token
export const mcpAccessToken = pgTable(
  "mcp_access_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    clientId: text("client_id").notNull(),
    scopes: text("scopes"),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mcp_access_token_hash_idx").on(table.tokenHash)]
);

// MCP Refresh Token
export const mcpRefreshToken = pgTable(
  "mcp_refresh_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    accessTokenId: uuid("access_token_id")
      .notNull()
      .references(() => mcpAccessToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("mcp_refresh_token_hash_idx").on(table.tokenHash)]
);

// Relations
export const mcpOAuthClientRelations = relations(mcpOAuthClient, () => ({}));

export const mcpOAuthCodeRelations = relations(mcpOAuthCode, ({ one }) => ({
  user: one(users, {
    fields: [mcpOAuthCode.userId],
    references: [users.id],
  }),
  organization: one(organization, {
    fields: [mcpOAuthCode.organizationId],
    references: [organization.id],
  }),
}));

export const mcpAccessTokenRelations = relations(
  mcpAccessToken,
  ({ one, many }) => ({
    user: one(users, {
      fields: [mcpAccessToken.userId],
      references: [users.id],
    }),
    organization: one(organization, {
      fields: [mcpAccessToken.organizationId],
      references: [organization.id],
    }),
    refreshTokens: many(mcpRefreshToken),
  })
);

export const mcpRefreshTokenRelations = relations(
  mcpRefreshToken,
  ({ one }) => ({
    accessToken: one(mcpAccessToken, {
      fields: [mcpRefreshToken.accessTokenId],
      references: [mcpAccessToken.id],
    }),
  })
);
