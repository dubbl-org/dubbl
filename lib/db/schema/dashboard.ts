import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

export interface WidgetLayoutItem {
  widgetType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
}

export const dashboardLayout = pgTable("dashboard_layout", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  layout: jsonb("layout").$type<WidgetLayoutItem[]>().notNull().default([]),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const dashboardLayoutRelations = relations(dashboardLayout, ({ one }) => ({
  organization: one(organization, {
    fields: [dashboardLayout.organizationId],
    references: [organization.id],
  }),
  user: one(users, {
    fields: [dashboardLayout.userId],
    references: [users.id],
  }),
}));
