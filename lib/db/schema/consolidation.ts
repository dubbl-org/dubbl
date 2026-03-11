import {
  pgTable, text, uuid, timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

export const consolidationGroup = pgTable("consolidation_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentOrgId: uuid("parent_org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const consolidationGroupMember = pgTable("consolidation_group_member", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => consolidationGroup.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  label: text("label"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const consolidationGroupRelations = relations(consolidationGroup, ({ one, many }) => ({
  parentOrg: one(organization, {
    fields: [consolidationGroup.parentOrgId],
    references: [organization.id],
  }),
  members: many(consolidationGroupMember),
}));

export const consolidationGroupMemberRelations = relations(consolidationGroupMember, ({ one }) => ({
  group: one(consolidationGroup, {
    fields: [consolidationGroupMember.groupId],
    references: [consolidationGroup.id],
  }),
  organization: one(organization, {
    fields: [consolidationGroupMember.orgId],
    references: [organization.id],
  }),
}));
