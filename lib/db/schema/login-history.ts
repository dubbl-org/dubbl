import { pgTable, text, uuid, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./auth";

export const loginHistory = pgTable(
  "login_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(), // SHA-256 hash of IP address
    userAgentHash: text("user_agent_hash"), // SHA-256 hash of user agent
    displayLabel: text("display_label"), // human-readable label e.g. "Chrome on macOS"
    provider: text("provider"), // "credentials", "google", "apple"
    alerted: boolean("alerted").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("login_history_user_idx").on(table.userId),
    index("login_history_user_ip_idx").on(table.userId, table.ipHash),
  ]
);

export const loginHistoryRelations = relations(loginHistory, ({ one }) => ({
  user: one(users, {
    fields: [loginHistory.userId],
    references: [users.id],
  }),
}));
