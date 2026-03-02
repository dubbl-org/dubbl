import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { nanoid } from "nanoid";
import { organization, users } from "./auth";
import { contact } from "./contacts";
import { invoice } from "./invoicing";

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "completed",
  "archived",
]);

export const project = pgTable("project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  contactId: text("contact_id").references(() => contact.id),
  status: projectStatusEnum("status").notNull().default("active"),
  budget: integer("budget").notNull().default(0), // cents
  hourlyRate: integer("hourly_rate").notNull().default(0), // cents
  totalHours: integer("total_hours").notNull().default(0), // minutes
  totalBilled: integer("total_billed").notNull().default(0), // cents
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const timeEntry = pgTable("time_entry", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  date: date("date").notNull(),
  description: text("description"),
  minutes: integer("minutes").notNull().default(0),
  isBillable: boolean("is_billable").notNull().default(true),
  hourlyRate: integer("hourly_rate").notNull().default(0), // cents
  invoiceId: text("invoice_id").references(() => invoice.id),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// Relations
export const projectRelations = relations(project, ({ one, many }) => ({
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
  contact: one(contact, {
    fields: [project.contactId],
    references: [contact.id],
  }),
  timeEntries: many(timeEntry),
}));

export const timeEntryRelations = relations(timeEntry, ({ one }) => ({
  project: one(project, {
    fields: [timeEntry.projectId],
    references: [project.id],
  }),
  user: one(users, {
    fields: [timeEntry.userId],
    references: [users.id],
  }),
  invoice: one(invoice, {
    fields: [timeEntry.invoiceId],
    references: [invoice.id],
  }),
}));
