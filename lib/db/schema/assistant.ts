import { pgTable, text, uuid, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

/**
 * A conversation with Tilly, the in-app assistant. The transcript is kept in
 * dubbl's stored message format (text, tool_use, tool_result and file blocks)
 * so a run can pause for approval and resume on the server without trusting
 * tool history sent by the browser.
 */
export const assistantConversation = pgTable(
  "assistant_conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    /** Messages in the stored message format; uploaded files are stored as references, not bytes. */
    messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
    /** Results of calls that ran before the run paused for approval. */
    pendingResults: jsonb("pending_results").$type<unknown[]>().notNull().default([]),
    /** The action waiting for approval, if any. */
    pending: jsonb("pending").$type<Record<string, unknown> | null>(),
    /** Tool names the member allowed to run without asking again in this chat. */
    autoApprove: jsonb("auto_approve").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("assistant_conversation_org_user_idx").on(t.organizationId, t.userId, t.updatedAt)]
);

export const assistantConversationRelations = relations(assistantConversation, ({ one }) => ({
  organization: one(organization, {
    fields: [assistantConversation.organizationId],
    references: [organization.id],
  }),
  user: one(users, {
    fields: [assistantConversation.userId],
    references: [users.id],
  }),
}));
