import { pgTable, text, uuid, timestamp, integer, date, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organization, users } from "./auth";

/**
 * One emitted ACRA XBRL package.
 *
 * This is the audit trail for "what did we tell ACRA": the mapping that produced
 * each fact, the validation outcome, and the uploaded file. ACRA filings are
 * retained five years, and next year's comparatives come from here.
 */
export const xbrlFiling = pgTable(
  "xbrl_filing",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    fiscalYearStart: date("fiscal_year_start").notNull(),
    fiscalYearEnd: date("fiscal_year_end").notNull(),
    /** "sim" | "full" — the ACRA framework the package was built against. */
    template: text("template").notNull(),
    /** ACRA taxonomy version, e.g. "2026". */
    taxonomyVersion: text("taxonomy_version").notNull(),
    /** "sfrs" | "sfrs_se" — the entry point's accounting standard. */
    accountingStandard: text("accounting_standard").notNull(),
    /** Element → { caption, valueCents, manualOverride } as filed. */
    mappingJson: jsonb("mapping_json"),
    /** "draft" | "validated" | "uploaded" | "filed". */
    status: text("status").notNull().default("draft"),
    genuineErrors: integer("genuine_errors").notNull().default(0),
    possibleErrors: integer("possible_errors").notNull().default(0),
    /** R2 key of the generated zip. */
    fileKey: text("file_key"),
    generatedBy: uuid("generated_by").references(() => users.id),
    filedAt: timestamp("filed_at", { mode: "date" }),
    filedReference: text("filed_reference"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("xbrl_filing_org_period_idx").on(
      table.organizationId,
      table.fiscalYearStart,
      table.fiscalYearEnd
    ),
  ]
);

export const xbrlFilingRelations = relations(xbrlFiling, ({ one }) => ({
  organization: one(organization, {
    fields: [xbrlFiling.organizationId],
    references: [organization.id],
  }),
  generatedByUser: one(users, {
    fields: [xbrlFiling.generatedBy],
    references: [users.id],
  }),
}));
