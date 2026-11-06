import { pgTable, text, uuid, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

// Native app sign-in (iOS). The app opens /app-authorize in the system browser,
// the signed-in user approves it, and the app trades the one-time code (PKCE)
// for a token pair. Unlike MCP tokens these act as the user, not one org: the
// app picks the organization per request with `x-organization-id`.
export const appAuthCode = pgTable(
  "app_auth_code",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // "ios"
    deviceName: text("device_name"),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("app_auth_code_hash_idx").on(table.codeHash)]
);

// One row per signed-in device. Refreshing rotates both tokens in place.
export const appSession = pgTable(
  "app_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    deviceName: text("device_name"),
    accessTokenHash: text("access_token_hash").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { mode: "date" }).notNull(),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("app_session_access_idx").on(table.accessTokenHash),
    uniqueIndex("app_session_refresh_idx").on(table.refreshTokenHash),
    index("app_session_user_idx").on(table.userId),
  ]
);

export const appAuthCodeRelations = relations(appAuthCode, ({ one }) => ({
  user: one(users, { fields: [appAuthCode.userId], references: [users.id] }),
}));

export const appSessionRelations = relations(appSession, ({ one }) => ({
  user: one(users, { fields: [appSession.userId], references: [users.id] }),
}));
