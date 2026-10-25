CREATE TYPE "public"."tax_supply_category" AS ENUM('standard', 'zero_rated', 'exempt', 'outside_scope');--> statement-breakpoint
CREATE TABLE "xbrl_filing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"fiscal_year_start" date NOT NULL,
	"fiscal_year_end" date NOT NULL,
	"template" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"accounting_standard" text NOT NULL,
	"mapping_json" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"genuine_errors" integer DEFAULT 0 NOT NULL,
	"possible_errors" integer DEFAULT 0 NOT NULL,
	"file_key" text,
	"generated_by" uuid,
	"filed_at" timestamp,
	"filed_reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gst_registered_at" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gst_deregistered_at" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gst_filing_frequency" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "gst_period_start_month" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "xbrl_template" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "accounting_standard" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "new_startup_exemption" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "is_exempt_private_company" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "tax_period" ADD COLUMN "return_kind" text DEFAULT 'vat_return' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_period" ADD COLUMN "authority" text;--> statement-breakpoint
ALTER TABLE "tax_rate" ADD COLUMN "supply_category" "tax_supply_category";--> statement-breakpoint
ALTER TABLE "tax_rate" ADD COLUMN "effective_from" date;--> statement-breakpoint
ALTER TABLE "tax_rate" ADD COLUMN "effective_to" date;--> statement-breakpoint
ALTER TABLE "xbrl_filing" ADD CONSTRAINT "xbrl_filing_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xbrl_filing" ADD CONSTRAINT "xbrl_filing_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "xbrl_filing_org_period_idx" ON "xbrl_filing" USING btree ("organization_id","fiscal_year_start","fiscal_year_end");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_period_org_kind_dates_idx" ON "tax_period" USING btree ("organization_id","return_kind","start_date","end_date");--> statement-breakpoint
-- Backfill supply categories from the existing posting kind. 0%-rated rates
-- named "zero" become zero-rated; other 0% rates stay NULL because the reporting
-- layer has always treated them as standard and GB numbers must not move.
UPDATE "tax_rate" SET "supply_category" = CASE
	WHEN "kind" = 'standard' AND "rate" > 0 THEN 'standard'::"tax_supply_category"
	WHEN "kind" = 'exempt' THEN 'exempt'::"tax_supply_category"
	WHEN "kind" = 'no_vat' THEN 'outside_scope'::"tax_supply_category"
	WHEN "kind" IN ('reverse_charge', 'blocked', 'partial_block') THEN 'standard'::"tax_supply_category"
	WHEN "kind" = 'standard' AND "rate" = 0 AND "name" ILIKE '%zero%' THEN 'zero_rated'::"tax_supply_category"
	ELSE NULL
END
WHERE "supply_category" IS NULL;
