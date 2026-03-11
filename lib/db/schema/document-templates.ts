import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization } from "./auth";

export const documentTemplateTypeEnum = pgEnum("document_template_type", [
  "invoice",
  "quote",
  "receipt",
  "payslip",
  "purchase_order",
]);

export const documentTemplate = pgTable("document_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: documentTemplateTypeEnum("type").notNull(),
  headerHtml: text("header_html"),
  footerHtml: text("footer_html"),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").default("#10b981"),
  showTaxBreakdown: boolean("show_tax_breakdown").notNull().default(true),
  showPaymentTerms: boolean("show_payment_terms").notNull().default(true),
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
});

export const documentTemplateRelations = relations(documentTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [documentTemplate.organizationId],
    references: [organization.id],
  }),
}));
